import type { SQLiteDatabase } from 'expo-sqlite';

import type { Role } from '../services/permissions';

// Read queries for the screens. All writes go through src/services (permission checks + transactions).

export type Category = { category_id: number; category_name: string; description: string | null; is_active: number; medicine_count: number };

export type Supplier = {
  supplier_id: number;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: number;
  batch_count: number;
};

export type StockState = 'OUT' | 'LOW' | 'OK';

export type Medicine = {
  medicine_id: number;
  category_id: number;
  category_name: string;
  brand_name: string;
  generic_name: string;
  strength: string | null;
  dosage_form: string;
  unit: string;
  barcode: string | null;
  selling_price: number;
  min_stock_level: number;
  requires_prescription: number;
  is_active: number;
  sellable_stock: number;
  stock_on_hand: number;
  next_expiry: string | null;
  stock_state: StockState;
};

export type BatchState = 'SELLABLE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'DEPLETED' | 'QUARANTINED';

export type Batch = {
  batch_id: number;
  medicine_id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  brand_name: string;
  generic_name: string;
  strength: string | null;
  unit: string;
  batch_number: string;
  purchase_price: number;
  quantity_received: number;
  quantity_remaining: number;
  received_date: string;
  expiry_date: string;
  is_active: number;
  days_to_expiry: number;
  batch_state: BatchState;
  is_sellable: number;
};

export type Movement = {
  movement_id: number;
  batch_id: number;
  batch_number: string;
  brand_name: string;
  movement_type: 'RECEIPT' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'WRITE_OFF';
  quantity_change: number;
  reason: string | null;
  movement_date: string;
  user_name: string;
  order_number: string | null;
};

export type Customer = {
  customer_id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  last_visit: string | null;
};

export type OrderStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';

export type OrderSummary = {
  order_id: number;
  order_number: string;
  status: OrderStatus;
  payment_method: string | null;
  payment_status: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  refunded_amount: number;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  customer_id: number | null;
  customer_name: string | null;
  user_id: number;
  staff_name: string;
  item_count: number;
};

export type OrderLine = {
  order_item_id: number;
  medicine_id: number;
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  quantity_returned: number;
  prescription_id: number | null;
  prescriber_name: string | null;
  batches: string | null;
};

export type User = {
  user_id: number;
  full_name: string;
  username: string;
  role: Role;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
};

const like = (search: string) => `%${search.trim()}%`;

// ---- Lookups ----

export function listCategories(db: SQLiteDatabase, includeInactive = false) {
  return db.getAllAsync<Category>(
    `SELECT c.*, (SELECT COUNT(*) FROM medicines m WHERE m.category_id = c.category_id) AS medicine_count
     FROM categories c WHERE ? OR c.is_active = 1 ORDER BY c.category_name`,
    includeInactive ? 1 : 0
  );
}

export function listSuppliers(db: SQLiteDatabase, includeInactive = false) {
  return db.getAllAsync<Supplier>(
    `SELECT s.*, (SELECT COUNT(*) FROM medicine_batches b WHERE b.supplier_id = s.supplier_id) AS batch_count
     FROM suppliers s WHERE ? OR s.is_active = 1 ORDER BY s.supplier_name`,
    includeInactive ? 1 : 0
  );
}

// ---- Medicines ----

export type MedicineFilter = 'all' | 'low' | 'out' | 'rx' | 'inactive';

export function listMedicines(db: SQLiteDatabase, opts: { search?: string; categoryId?: number | null; filter?: MedicineFilter } = {}) {
  const filter = opts.filter ?? 'all';
  return db.getAllAsync<Medicine>(
    `SELECT * FROM v_medicine_stock
     WHERE (brand_name LIKE ? OR generic_name LIKE ? OR IFNULL(barcode, '') LIKE ?)
       AND (? IS NULL OR category_id = ?)
       AND CASE ?
             WHEN 'inactive' THEN is_active = 0
             WHEN 'low' THEN is_active = 1 AND stock_state IN ('LOW', 'OUT')
             WHEN 'out' THEN is_active = 1 AND stock_state = 'OUT'
             WHEN 'rx' THEN is_active = 1 AND requires_prescription = 1
             ELSE is_active = 1
           END
     ORDER BY brand_name, strength`,
    like(opts.search ?? ''), like(opts.search ?? ''), like(opts.search ?? ''),
    opts.categoryId ?? null, opts.categoryId ?? null, filter
  );
}

export function getMedicine(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Medicine>('SELECT * FROM v_medicine_stock WHERE medicine_id = ?', id);
}

export function findByBarcode(db: SQLiteDatabase, barcode: string) {
  return db.getFirstAsync<Medicine>('SELECT * FROM v_medicine_stock WHERE barcode = ? AND is_active = 1', barcode.trim());
}

// ---- Inventory ----

export type BatchView = 'all' | 'sellable' | 'near' | 'expired' | 'quarantined' | 'depleted';

export function listBatches(db: SQLiteDatabase, opts: { search?: string; view?: BatchView; medicineId?: number } = {}) {
  return db.getAllAsync<Batch>(
    `SELECT * FROM v_batch_status
     WHERE (brand_name LIKE ? OR generic_name LIKE ? OR batch_number LIKE ?)
       AND (? IS NULL OR medicine_id = ?)
       AND CASE ?
             WHEN 'sellable' THEN is_sellable = 1
             WHEN 'near' THEN batch_state = 'NEAR_EXPIRY'
             WHEN 'expired' THEN batch_state = 'EXPIRED'
             WHEN 'quarantined' THEN batch_state = 'QUARANTINED'
             WHEN 'depleted' THEN batch_state = 'DEPLETED'
             ELSE 1
           END
     ORDER BY CASE batch_state WHEN 'EXPIRED' THEN 0 WHEN 'NEAR_EXPIRY' THEN 1 WHEN 'QUARANTINED' THEN 2
                               WHEN 'SELLABLE' THEN 3 ELSE 4 END,
              expiry_date, brand_name`,
    like(opts.search ?? ''), like(opts.search ?? ''), like(opts.search ?? ''),
    opts.medicineId ?? null, opts.medicineId ?? null, opts.view ?? 'all'
  );
}

export function getBatch(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Batch>('SELECT * FROM v_batch_status WHERE batch_id = ?', id);
}

export function listMovements(db: SQLiteDatabase, opts: { batchId?: number; medicineId?: number; limit?: number } = {}) {
  return db.getAllAsync<Movement>(
    `SELECT sm.movement_id, sm.batch_id, b.batch_number, m.brand_name, sm.movement_type, sm.quantity_change,
            sm.reason, sm.movement_date, u.full_name AS user_name, o.order_number
     FROM stock_movements sm
     JOIN medicine_batches b ON b.batch_id = sm.batch_id
     JOIN medicines m ON m.medicine_id = b.medicine_id
     JOIN users u ON u.user_id = sm.user_id
     LEFT JOIN order_items oi ON oi.order_item_id = sm.order_item_id
     LEFT JOIN orders o ON o.order_id = oi.order_id
     WHERE (? IS NULL OR sm.batch_id = ?) AND (? IS NULL OR b.medicine_id = ?)
     ORDER BY sm.movement_date DESC, sm.movement_id DESC
     LIMIT ?`,
    opts.batchId ?? null, opts.batchId ?? null, opts.medicineId ?? null, opts.medicineId ?? null, opts.limit ?? 200
  );
}

// ---- Customers ----

export function listCustomers(db: SQLiteDatabase, search = '') {
  return db.getAllAsync<Customer>(
    `SELECT c.*,
            COUNT(s.order_id) AS order_count,
            IFNULL(SUM(s.net_amount), 0) AS total_spent,
            MAX(s.completed_at) AS last_visit
     FROM customers c LEFT JOIN v_sales s ON s.customer_id = c.customer_id
     WHERE c.full_name LIKE ? OR IFNULL(c.phone, '') LIKE ? OR IFNULL(c.email, '') LIKE ?
     GROUP BY c.customer_id
     ORDER BY c.full_name`,
    like(search), like(search), like(search)
  );
}

// ---- Orders ----

export type OrderFilter = { status?: OrderStatus | 'all'; userId?: number | null; customerId?: number | null; search?: string; days?: number | null };

export function listOrders(db: SQLiteDatabase, f: OrderFilter = {}) {
  return db.getAllAsync<OrderSummary>(
    `SELECT o.*, cu.full_name AS customer_name, u.full_name AS staff_name,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
     FROM orders o
     JOIN users u ON u.user_id = o.user_id
     LEFT JOIN customers cu ON cu.customer_id = o.customer_id
     WHERE (? = 'all' OR o.status = ?)
       AND (? IS NULL OR o.user_id = ?)
       AND (? IS NULL OR o.customer_id = ?)
       AND (o.order_number LIKE ? OR IFNULL(cu.full_name, '') LIKE ?)
       AND (? IS NULL OR o.created_at >= datetime('now', 'localtime', '-' || ? || ' days'))
     ORDER BY o.created_at DESC, o.order_id DESC
     LIMIT 300`,
    f.status ?? 'all', f.status ?? 'all',
    f.userId ?? null, f.userId ?? null,
    f.customerId ?? null, f.customerId ?? null,
    like(f.search ?? ''), like(f.search ?? ''),
    f.days ?? null, f.days ?? null
  );
}

export async function getOrderDetail(db: SQLiteDatabase, orderId: number) {
  const order = await db.getFirstAsync<OrderSummary>(
    `SELECT o.*, cu.full_name AS customer_name, u.full_name AS staff_name,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
     FROM orders o JOIN users u ON u.user_id = o.user_id LEFT JOIN customers cu ON cu.customer_id = o.customer_id
     WHERE o.order_id = ?`,
    orderId
  );
  const lines = await db.getAllAsync<OrderLine>(
    `SELECT oi.*, m.brand_name || IFNULL(' ' || m.strength, '') AS label, p.prescriber_name,
            (SELECT GROUP_CONCAT(b.batch_number || ' ×' || (-sm.quantity_change), ', ')
             FROM stock_movements sm JOIN medicine_batches b ON b.batch_id = sm.batch_id
             WHERE sm.order_item_id = oi.order_item_id AND sm.movement_type = 'SALE') AS batches
     FROM order_items oi
     JOIN medicines m ON m.medicine_id = oi.medicine_id
     LEFT JOIN prescriptions p ON p.prescription_id = oi.prescription_id
     WHERE oi.order_id = ?
     ORDER BY oi.order_item_id`,
    orderId
  );
  return order ? { order, lines } : null;
}

// ---- Users ----

export function listUsers(db: SQLiteDatabase) {
  return db.getAllAsync<User>(
    'SELECT user_id, full_name, username, role, is_active, last_login_at, created_at FROM users ORDER BY is_active DESC, full_name'
  );
}

// ---- Dashboard ----

export type DashboardStats = {
  today_net: number;
  today_orders: number;
  active_medicines: number;
  sellable_units: number;
  low_stock: number;
  near_expiry: number;
  expired: number;
  inventory_value: number;
};

export async function getDashboard(db: SQLiteDatabase, userId: number | null = null) {
  const stats = await db.getFirstAsync<DashboardStats>(
    `SELECT
       (SELECT IFNULL(SUM(net_amount), 0) FROM v_sales WHERE sale_date = date('now', 'localtime') AND (?1 IS NULL OR user_id = ?1)) AS today_net,
       (SELECT COUNT(*) FROM v_sales WHERE sale_date = date('now', 'localtime') AND (?1 IS NULL OR user_id = ?1)) AS today_orders,
       (SELECT COUNT(*) FROM medicines WHERE is_active = 1) AS active_medicines,
       (SELECT IFNULL(SUM(sellable_stock), 0) FROM v_medicine_stock WHERE is_active = 1) AS sellable_units,
       (SELECT COUNT(*) FROM v_medicine_stock WHERE is_active = 1 AND stock_state IN ('LOW', 'OUT')) AS low_stock,
       (SELECT COUNT(*) FROM v_batch_status WHERE batch_state = 'NEAR_EXPIRY') AS near_expiry,
       (SELECT COUNT(*) FROM v_batch_status WHERE batch_state = 'EXPIRED') AS expired,
       (SELECT IFNULL(SUM(quantity_remaining * purchase_price), 0) FROM v_batch_status WHERE is_sellable = 1) AS inventory_value`,
    userId
  );
  const lowStock = await db.getAllAsync<Medicine>(
    "SELECT * FROM v_medicine_stock WHERE is_active = 1 AND stock_state IN ('LOW', 'OUT') ORDER BY sellable_stock, brand_name LIMIT 8"
  );
  const expiring = await db.getAllAsync<Batch>(
    "SELECT * FROM v_batch_status WHERE batch_state IN ('EXPIRED', 'NEAR_EXPIRY') ORDER BY expiry_date LIMIT 8"
  );
  const recent = await listOrders(db, { userId });
  return { stats: stats!, lowStock, expiring, recent: recent.slice(0, 6) };
}

export function integrityIssues(db: SQLiteDatabase) {
  return db.getAllAsync<{ issue: string; ref: string }>('SELECT * FROM v_integrity_issues');
}

export async function databaseCounts(db: SQLiteDatabase, tables: string[]) {
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t}"`);
    counts[t] = row?.n ?? 0;
  }
  return counts;
}
