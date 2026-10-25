import type { SQLiteDatabase } from 'expo-sqlite';

const categories = ['Electronics', 'Office Supplies', 'Furniture', 'Kitchen', 'Books'];

// [name, sku, category, price, quantity, days ago added]
const products: [string, string, string, number, number, number][] = [
  ['Wireless Mouse', 'EL-1001', 'Electronics', 24.99, 42, 60],
  ['Mechanical Keyboard', 'EL-1002', 'Electronics', 89.5, 15, 58],
  ['27" 4K Monitor', 'EL-1003', 'Electronics', 329.0, 4, 55],
  ['USB-C Hub (7-in-1)', 'EL-1004', 'Electronics', 39.95, 27, 50],
  ['Noise-Cancelling Headphones', 'EL-1005', 'Electronics', 199.0, 3, 41],
  ['A4 Copy Paper (500 sheets)', 'OF-2001', 'Office Supplies', 6.49, 120, 59],
  ['Gel Pens (12-pack)', 'OF-2002', 'Office Supplies', 8.99, 64, 47],
  ['Desk Organizer', 'OF-2003', 'Office Supplies', 18.75, 2, 33],
  ['Ergonomic Office Chair', 'FU-3001', 'Furniture', 249.0, 8, 52],
  ['Standing Desk', 'FU-3002', 'Furniture', 479.0, 5, 30],
  ['Stainless Steel Kettle', 'KI-4001', 'Kitchen', 34.0, 19, 44],
  ['Coffee Grinder', 'KI-4002', 'Kitchen', 52.25, 11, 21],
  ['Clean Code (Paperback)', 'BK-5001', 'Books', 37.99, 9, 38],
  ['Designing Data-Intensive Applications', 'BK-5002', 'Books', 45.5, 6, 12],
];

// [name, email, phone, city, days ago joined]
const customers: [string, string, string | null, string, number][] = [
  ['Bat-Erdene Ganbold', 'bat-erdene.g@example.com', '+976 9911 2233', 'Ulaanbaatar', 57],
  ['Aiko Tanaka', 'aiko.tanaka@example.com', '+81 90 1234 5678', 'Osaka', 54],
  ['Maria Lopez', 'maria.lopez@example.com', '+34 612 345 678', 'Madrid', 49],
  ['James Carter', 'james.carter@example.com', '+1 415 555 0142', 'San Francisco', 45],
  ['Sarnai Dorj', 'sarnai.dorj@example.com', '+976 8800 4455', 'Darkhan', 40],
  ['Lukas Schneider', 'lukas.schneider@example.com', null, 'Berlin', 31],
  ['Priya Sharma', 'priya.sharma@example.com', '+91 98765 43210', 'Bengaluru', 22],
  ['Chen Wei', 'chen.wei@example.com', '+86 138 0013 8000', 'Shanghai', 9],
];

// [customer email, product sku, quantity, status, days ago]
const orders: [string, string, number, string, number][] = [
  ['bat-erdene.g@example.com', 'EL-1002', 1, 'delivered', 28],
  ['aiko.tanaka@example.com', 'FU-3001', 2, 'delivered', 25],
  ['maria.lopez@example.com', 'OF-2001', 10, 'delivered', 21],
  ['james.carter@example.com', 'EL-1003', 1, 'shipped', 14],
  ['sarnai.dorj@example.com', 'KI-4001', 1, 'cancelled', 12],
  ['bat-erdene.g@example.com', 'BK-5002', 2, 'shipped', 8],
  ['lukas.schneider@example.com', 'EL-1001', 3, 'delivered', 6],
  ['priya.sharma@example.com', 'FU-3002', 1, 'pending', 3],
  ['chen.wei@example.com', 'EL-1005', 1, 'pending', 2],
  ['aiko.tanaka@example.com', 'KI-4002', 1, 'pending', 1],
];

export async function seed(db: SQLiteDatabase) {
  for (const name of categories) {
    await db.runAsync('INSERT INTO categories (name) VALUES (?)', name);
  }
  for (const [name, sku, category, price, quantity, daysAgo] of products) {
    await db.runAsync(
      `INSERT INTO products (name, sku, category_id, price, quantity, created_at)
       VALUES (?, ?, (SELECT id FROM categories WHERE name = ?), ?, ?, datetime('now', ?))`,
      name, sku, category, price, quantity, `-${daysAgo} days`
    );
  }
  for (const [name, email, phone, city, daysAgo] of customers) {
    await db.runAsync(
      `INSERT INTO customers (name, email, phone, city, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))`,
      name, email, phone, city, `-${daysAgo} days`
    );
  }
  for (const [email, sku, quantity, status, daysAgo] of orders) {
    await db.runAsync(
      `INSERT INTO orders (customer_id, product_id, quantity, total, status, created_at)
       SELECT c.id, p.id, ?, ROUND(p.price * ?, 2), ?, datetime('now', ?)
       FROM customers c, products p WHERE c.email = ? AND p.sku = ?`,
      quantity, quantity, status, `-${daysAgo} days`, email, sku
    );
  }
}
