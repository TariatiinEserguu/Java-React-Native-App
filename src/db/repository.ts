import type { SQLiteDatabase } from 'expo-sqlite';

export const LOW_STOCK_THRESHOLD = 5;

export type Category = { id: number; name: string };

export type Product = {
  id: number;
  name: string;
  sku: string;
  category_id: number | null;
  category_name: string | null;
  price: number;
  quantity: number;
  created_at: string;
};
export type ProductInput = Pick<Product, 'name' | 'sku' | 'category_id' | 'price' | 'quantity'>;

export type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
};
export type CustomerInput = Pick<Customer, 'name' | 'email' | 'phone' | 'city'>;

export const ORDER_STATUSES = ['pending', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  id: number;
  customer_id: number;
  customer_name: string;
  product_id: number;
  product_name: string;
  quantity: number;
  total: number;
  status: OrderStatus;
  created_at: string;
};
export type OrderInput = { customer_id: number; product_id: number; quantity: number };

/** Allowed status changes. Cancelled and delivered are final. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

// Orders that still hold stock; cancelling or deleting them returns it.
const RESERVES_STOCK: OrderStatus[] = ['pending', 'shipped'];

// ---- Categories ----

export function listCategories(db: SQLiteDatabase) {
  return db.getAllAsync<Category>('SELECT id, name FROM categories ORDER BY name');
}

// ---- Products ----

export function listProducts(db: SQLiteDatabase, search = '') {
  const like = `%${search.trim()}%`;
  return db.getAllAsync<Product>(
    `SELECT p.*, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.name LIKE ? OR p.sku LIKE ? OR c.name LIKE ?
     ORDER BY p.name`,
    like, like, like
  );
}

export async function createProduct(db: SQLiteDatabase, input: ProductInput) {
  const result = await db.runAsync(
    'INSERT INTO products (name, sku, category_id, price, quantity) VALUES (?, ?, ?, ?, ?)',
    input.name, input.sku, input.category_id, input.price, input.quantity
  );
  return result.lastInsertRowId;
}

export async function updateProduct(db: SQLiteDatabase, id: number, input: ProductInput) {
  await db.runAsync(
    'UPDATE products SET name = ?, sku = ?, category_id = ?, price = ?, quantity = ? WHERE id = ?',
    input.name, input.sku, input.category_id, input.price, input.quantity, id
  );
}

export async function deleteProduct(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM products WHERE id = ?', id);
}

// ---- Customers ----

export function listCustomers(db: SQLiteDatabase, search = '') {
  const like = `%${search.trim()}%`;
  return db.getAllAsync<Customer>(
    `SELECT c.*,
            COUNT(o.id) AS order_count,
            COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total END), 0) AS total_spent
     FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
     WHERE c.name LIKE ? OR c.email LIKE ? OR c.city LIKE ?
     GROUP BY c.id
     ORDER BY c.name`,
    like, like, like
  );
}

export async function createCustomer(db: SQLiteDatabase, input: CustomerInput) {
  const result = await db.runAsync(
    'INSERT INTO customers (name, email, phone, city) VALUES (?, ?, ?, ?)',
    input.name, input.email, input.phone, input.city
  );
  return result.lastInsertRowId;
}

export async function updateCustomer(db: SQLiteDatabase, id: number, input: CustomerInput) {
  await db.runAsync(
    'UPDATE customers SET name = ?, email = ?, phone = ?, city = ? WHERE id = ?',
    input.name, input.email, input.phone, input.city, id
  );
}

export async function deleteCustomer(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM customers WHERE id = ?', id);
}

// ---- Orders ----

export function listOrders(db: SQLiteDatabase, status: OrderStatus | 'all' = 'all') {
  return db.getAllAsync<Order>(
    `SELECT o.*, c.name AS customer_name, p.name AS product_name
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN products p ON p.id = o.product_id
     WHERE ? = 'all' OR o.status = ?
     ORDER BY o.created_at DESC, o.id DESC`,
    status, status
  );
}

/** Creates an order and takes the quantity out of stock, atomically. */
export async function createOrder(db: SQLiteDatabase, input: OrderInput) {
  await db.withTransactionAsync(async () => {
    const product = await db.getFirstAsync<{ name: string; price: number; quantity: number }>(
      'SELECT name, price, quantity FROM products WHERE id = ?',
      input.product_id
    );
    if (!product) throw new Error('The selected product no longer exists.');
    if (product.quantity < input.quantity) {
      throw new Error(`Only ${product.quantity} unit(s) of "${product.name}" left in stock.`);
    }
    const total = Math.round(product.price * input.quantity * 100) / 100;
    await db.runAsync(
      'INSERT INTO orders (customer_id, product_id, quantity, total) VALUES (?, ?, ?, ?)',
      input.customer_id, input.product_id, input.quantity, total
    );
    await db.runAsync('UPDATE products SET quantity = quantity - ? WHERE id = ?', input.quantity, input.product_id);
  });
}

export async function setOrderStatus(db: SQLiteDatabase, order: Order, status: OrderStatus) {
  if (!NEXT_STATUSES[order.status].includes(status)) {
    throw new Error(`An order that is ${order.status} cannot be marked ${status}.`);
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE orders SET status = ? WHERE id = ?', status, order.id);
    if (status === 'cancelled') {
      await db.runAsync('UPDATE products SET quantity = quantity + ? WHERE id = ?', order.quantity, order.product_id);
    }
  });
}

export async function deleteOrder(db: SQLiteDatabase, order: Order) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM orders WHERE id = ?', order.id);
    if (RESERVES_STOCK.includes(order.status)) {
      await db.runAsync('UPDATE products SET quantity = quantity + ? WHERE id = ?', order.quantity, order.product_id);
    }
  });
}

// ---- Dashboard ----

export type DashboardStats = {
  products: number;
  customers: number;
  orders: number;
  pending: number;
  revenue: number;
  inventoryValue: number;
};

export async function getDashboard(db: SQLiteDatabase) {
  const stats = await db.getFirstAsync<DashboardStats>(
    `SELECT
       (SELECT COUNT(*) FROM products) AS products,
       (SELECT COUNT(*) FROM customers) AS customers,
       (SELECT COUNT(*) FROM orders) AS orders,
       (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending,
       (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'cancelled') AS revenue,
       (SELECT COALESCE(SUM(price * quantity), 0) FROM products) AS inventoryValue`
  );
  const lowStock = await db.getAllAsync<Pick<Product, 'id' | 'name' | 'sku' | 'quantity'>>(
    'SELECT id, name, sku, quantity FROM products WHERE quantity <= ? ORDER BY quantity, name',
    LOW_STOCK_THRESHOLD
  );
  const recentOrders = await listOrders(db);
  return { stats: stats!, lowStock, recentOrders: recentOrders.slice(0, 5) };
}
