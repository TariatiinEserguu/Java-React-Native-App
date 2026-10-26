import type { SQLiteDatabase } from 'expo-sqlite';

import { seed } from './seed';
import { runInTransaction } from './transaction';

export const DATABASE_NAME = 'pharmacare.db';

// Bump this and add a migration step when the schema changes.
export const SCHEMA_VERSION = 1;

/*
 * PharmaCare schema — see docs/02-erd-and-database.md and docs/03-data-dictionary.md.
 *
 * Conventions: money is whole MNT (INTEGER), dates are 'YYYY-MM-DD', timestamps are local
 * 'YYYY-MM-DD HH:MM:SS'. SQLite CHECK constraints treat NULL as "passes", so nullable columns
 * are compared with IS / IFNULL where it matters. CHECKs can't call date('now'), so rules that
 * depend on today's date live in triggers.
 */
const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 100),
  username      TEXT    NOT NULL COLLATE NOCASE UNIQUE
                CHECK (length(username) BETWEEN 3 AND 30 AND username NOT GLOB '*[^A-Za-z0-9._]*'),
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('ADMIN', 'PHARMACIST', 'CASHIER')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  category_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(category_name)) BETWEEN 2 AND 50),
  description   TEXT    CHECK (description IS NULL OR length(description) <= 200),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS medicines (
  medicine_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id           INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
  brand_name            TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(brand_name)) BETWEEN 1 AND 100),
  generic_name          TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(generic_name)) BETWEEN 1 AND 100),
  strength              TEXT    COLLATE NOCASE CHECK (strength IS NULL OR length(strength) <= 30),
  dosage_form           TEXT    NOT NULL CHECK (dosage_form IN ('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION',
                                'CREAM', 'OINTMENT', 'DROPS', 'SPRAY', 'INHALER', 'POWDER', 'DEVICE', 'OTHER')),
  unit                  TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(unit)) BETWEEN 1 AND 30),
  barcode               TEXT    UNIQUE
                        CHECK (barcode IS NULL OR (length(barcode) BETWEEN 8 AND 14 AND barcode NOT GLOB '*[^0-9]*')),
  selling_price         INTEGER NOT NULL CHECK (typeof(selling_price) = 'integer' AND selling_price >= 0),
  min_stock_level       INTEGER NOT NULL DEFAULT 10 CHECK (typeof(min_stock_level) = 'integer' AND min_stock_level >= 0),
  requires_prescription INTEGER NOT NULL DEFAULT 0 CHECK (requires_prescription IN (0, 1)),
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at            TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name  TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(supplier_name)) BETWEEN 2 AND 100),
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT    CHECK (address IS NULL OR length(address) <= 200),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS medicine_batches (
  batch_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id        INTEGER NOT NULL REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
  supplier_id        INTEGER REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
  batch_number       TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(batch_number)) BETWEEN 1 AND 40),
  purchase_price     INTEGER NOT NULL CHECK (typeof(purchase_price) = 'integer' AND purchase_price >= 0),
  quantity_received  INTEGER NOT NULL CHECK (typeof(quantity_received) = 'integer' AND quantity_received > 0),
  -- Cached balance. Starts at 0 and is changed only by trg_movement_apply.
  quantity_remaining INTEGER NOT NULL DEFAULT 0 CHECK (quantity_remaining BETWEEN 0 AND quantity_received),
  received_date      TEXT    NOT NULL DEFAULT (date('now', 'localtime')) CHECK (date(received_date) IS received_date),
  expiry_date        TEXT    NOT NULL CHECK (date(expiry_date) IS expiry_date AND expiry_date > received_date),
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 100),
  phone       TEXT UNIQUE,
  email       TEXT,
  notes       TEXT CHECK (notes IS NULL OR length(notes) <= 200),
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id         INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL,
  verified_by         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  patient_name        TEXT    NOT NULL CHECK (length(trim(patient_name)) BETWEEN 2 AND 100),
  prescriber_name     TEXT    NOT NULL CHECK (length(trim(prescriber_name)) BETWEEN 2 AND 100),
  prescription_number TEXT    CHECK (prescription_number IS NULL OR length(prescription_number) <= 40),
  issue_date          TEXT    NOT NULL CHECK (date(issue_date) IS issue_date),
  verified_at         TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  notes               TEXT,
  CHECK (issue_date <= substr(verified_at, 1, 10))
);

CREATE TABLE IF NOT EXISTS orders (
  order_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number    TEXT    NOT NULL UNIQUE,
  customer_id     INTEGER REFERENCES customers(customer_id) ON DELETE RESTRICT,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  status          TEXT    NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED')),
  payment_method  TEXT    CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'CARD', 'QPAY', 'OTHER')),
  payment_status  TEXT    NOT NULL DEFAULT 'UNPAID'
                  CHECK (payment_status IN ('UNPAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  subtotal        INTEGER NOT NULL DEFAULT 0 CHECK (typeof(subtotal) = 'integer' AND subtotal >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0
                  CHECK (typeof(discount_amount) = 'integer' AND discount_amount BETWEEN 0 AND subtotal),
  total_amount    INTEGER NOT NULL DEFAULT 0 CHECK (total_amount = subtotal - discount_amount),
  refunded_amount INTEGER NOT NULL DEFAULT 0
                  CHECK (typeof(refunded_amount) = 'integer' AND refunded_amount BETWEEN 0 AND total_amount),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  completed_at    TEXT,
  cancelled_at    TEXT,
  notes           TEXT,
  CHECK (status NOT IN ('COMPLETED', 'REFUNDED') OR (completed_at IS NOT NULL AND payment_method IS NOT NULL)),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  CHECK (status <> 'PENDING' OR payment_status = 'UNPAID'),
  CHECK (status <> 'REFUNDED' OR payment_status = 'REFUNDED')
);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  medicine_id       INTEGER NOT NULL REFERENCES medicines(medicine_id) ON DELETE RESTRICT,
  prescription_id   INTEGER REFERENCES prescriptions(prescription_id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity > 0),
  unit_price        INTEGER NOT NULL CHECK (typeof(unit_price) = 'integer' AND unit_price >= 0),
  line_total        INTEGER NOT NULL CHECK (line_total = quantity * unit_price),
  quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned BETWEEN 0 AND quantity),
  UNIQUE (order_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  movement_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        INTEGER NOT NULL REFERENCES medicine_batches(batch_id) ON DELETE RESTRICT,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  order_item_id   INTEGER REFERENCES order_items(order_item_id) ON DELETE RESTRICT,
  movement_type   TEXT    NOT NULL CHECK (movement_type IN ('RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'WRITE_OFF')),
  quantity_change INTEGER NOT NULL CHECK (typeof(quantity_change) = 'integer' AND quantity_change <> 0),
  reason          TEXT,
  movement_date   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  -- Sign convention: + stock in, - stock out.
  CHECK (CASE movement_type
           WHEN 'RECEIPT'   THEN quantity_change > 0
           WHEN 'SALE'      THEN quantity_change < 0
           WHEN 'RETURN'    THEN quantity_change > 0
           WHEN 'WRITE_OFF' THEN quantity_change < 0
           ELSE 1 END),
  CHECK ((movement_type IN ('SALE', 'RETURN')) = (order_item_id IS NOT NULL)),
  CHECK (movement_type NOT IN ('RETURN', 'ADJUSTMENT', 'WRITE_OFF') OR IFNULL(length(trim(reason)), 0) > 0)
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`;

const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_medicines_brand ON medicines(brand_name);
CREATE INDEX IF NOT EXISTS idx_medicines_generic ON medicines(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_medicines_product
  ON medicines(brand_name, IFNULL(strength, ''), dosage_form, unit);
CREATE UNIQUE INDEX IF NOT EXISTS ux_batches_number
  ON medicine_batches(medicine_id, IFNULL(supplier_id, 0), batch_number);
CREATE INDEX IF NOT EXISTS idx_batches_medicine_expiry ON medicine_batches(medicine_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON medicine_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_supplier ON medicine_batches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_verified_by ON prescriptions(verified_by);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_completed ON orders(status, completed_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_medicine ON order_items(medicine_id);
CREATE INDEX IF NOT EXISTS idx_order_items_prescription ON order_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_movements_batch_date ON stock_movements(batch_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_movements_order_item ON stock_movements(order_item_id);
CREATE INDEX IF NOT EXISTS idx_movements_user ON stock_movements(user_id);
`;

// Business rules the database enforces itself, so they hold even for writes from the SQL console.
const TRIGGERS_SQL = `
-- BR-21: the last active admin can't be demoted or deactivated.
CREATE TRIGGER IF NOT EXISTS trg_users_keep_admin
BEFORE UPDATE OF role, is_active ON users
WHEN OLD.role = 'ADMIN' AND OLD.is_active = 1 AND (NEW.role <> 'ADMIN' OR NEW.is_active = 0)
BEGIN
  SELECT RAISE(ABORT, 'At least one active administrator is required.')
  WHERE (SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND is_active = 1) <= 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_medicines_touch
AFTER UPDATE ON medicines
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE medicines SET updated_at = datetime('now', 'localtime') WHERE medicine_id = NEW.medicine_id;
END;

-- BR-03 / BR-11 and the ledger rule: a batch starts empty and is filled by its RECEIPT movement.
CREATE TRIGGER IF NOT EXISTS trg_batches_insert
BEFORE INSERT ON medicine_batches
BEGIN
  SELECT RAISE(ABORT, 'A new batch must start with quantity_remaining = 0; record a RECEIPT movement.')
  WHERE NEW.quantity_remaining <> 0;
  SELECT RAISE(ABORT, 'Inactive medicines cannot receive stock.')
  WHERE (SELECT is_active FROM medicines WHERE medicine_id = NEW.medicine_id) = 0;
  SELECT RAISE(ABORT, 'Received date cannot be in the future.')
  WHERE NEW.received_date > date('now', 'localtime');
END;

CREATE TRIGGER IF NOT EXISTS trg_batches_immutable
BEFORE UPDATE OF medicine_id, quantity_received, purchase_price ON medicine_batches
BEGIN
  SELECT RAISE(ABORT, 'Medicine, received quantity and purchase price of a batch cannot be changed.');
END;

-- BR-22: the stock ledger is append-only.
CREATE TRIGGER IF NOT EXISTS trg_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'Stock movements cannot be edited. Record a new adjustment instead.');
END;

CREATE TRIGGER IF NOT EXISTS trg_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'Stock movements cannot be deleted. Record a new adjustment instead.');
END;

CREATE TRIGGER IF NOT EXISTS trg_movements_receipt
BEFORE INSERT ON stock_movements
WHEN NEW.movement_type = 'RECEIPT'
BEGIN
  SELECT RAISE(ABORT, 'This batch has already been received.')
  WHERE EXISTS (SELECT 1 FROM stock_movements WHERE batch_id = NEW.batch_id AND movement_type = 'RECEIPT');
  SELECT RAISE(ABORT, 'A receipt must equal the batch quantity received.')
  WHERE NEW.quantity_change <> (SELECT quantity_received FROM medicine_batches WHERE batch_id = NEW.batch_id);
END;

-- BR-07 / BR-08 / BR-16: sales take stock only from sellable batches of the right medicine,
-- only while the order is being checked out, and never more than the line quantity.
CREATE TRIGGER IF NOT EXISTS trg_movements_sale
BEFORE INSERT ON stock_movements
WHEN NEW.movement_type = 'SALE'
BEGIN
  SELECT RAISE(ABORT, 'The batch belongs to a different medicine.')
  WHERE (SELECT medicine_id FROM medicine_batches WHERE batch_id = NEW.batch_id)
     <> (SELECT medicine_id FROM order_items WHERE order_item_id = NEW.order_item_id);
  SELECT RAISE(ABORT, 'Expired or quarantined batches cannot be sold.')
  WHERE EXISTS (SELECT 1 FROM medicine_batches WHERE batch_id = NEW.batch_id
                AND (is_active = 0 OR expiry_date < date('now', 'localtime')));
  SELECT RAISE(ABORT, 'Stock can only be allocated while an order is being checked out.')
  WHERE (SELECT o.status FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
         WHERE oi.order_item_id = NEW.order_item_id) <> 'PENDING';
  SELECT RAISE(ABORT, 'Allocated more stock than the ordered quantity.')
  WHERE (SELECT quantity FROM order_items WHERE order_item_id = NEW.order_item_id)
      < -NEW.quantity_change - IFNULL((SELECT SUM(quantity_change) FROM stock_movements
                                       WHERE order_item_id = NEW.order_item_id AND movement_type = 'SALE'), 0);
END;

-- BR-13 / BR-19: returns go back to a batch the line was sold from, never more than was sold.
CREATE TRIGGER IF NOT EXISTS trg_movements_return
BEFORE INSERT ON stock_movements
WHEN NEW.movement_type = 'RETURN'
BEGIN
  SELECT RAISE(ABORT, 'Only completed orders can be returned.')
  WHERE (SELECT o.status FROM orders o JOIN order_items oi ON oi.order_id = o.order_id
         WHERE oi.order_item_id = NEW.order_item_id) <> 'COMPLETED';
  SELECT RAISE(ABORT, 'Cannot return more than was sold from this batch.')
  WHERE NEW.quantity_change >
        -IFNULL((SELECT SUM(quantity_change) FROM stock_movements
                 WHERE order_item_id = NEW.order_item_id AND batch_id = NEW.batch_id AND movement_type = 'SALE'), 0)
        - IFNULL((SELECT SUM(quantity_change) FROM stock_movements
                  WHERE order_item_id = NEW.order_item_id AND batch_id = NEW.batch_id AND movement_type = 'RETURN'), 0);
END;

-- BR-09: every movement updates the cached batch balance (the batch CHECK stops it going below 0).
CREATE TRIGGER IF NOT EXISTS trg_movement_apply
AFTER INSERT ON stock_movements
BEGIN
  UPDATE medicine_batches
  SET quantity_remaining = quantity_remaining + NEW.quantity_change
  WHERE batch_id = NEW.batch_id;
  UPDATE order_items
  SET quantity_returned = quantity_returned + NEW.quantity_change
  WHERE NEW.movement_type = 'RETURN' AND order_item_id = NEW.order_item_id;
END;

-- BR-11 / BR-17: only active medicines, Rx-only items need a prescription, only on pending orders.
CREATE TRIGGER IF NOT EXISTS trg_order_items_insert
BEFORE INSERT ON order_items
BEGIN
  SELECT RAISE(ABORT, 'Items can only be added to a pending order.')
  WHERE (SELECT status FROM orders WHERE order_id = NEW.order_id) <> 'PENDING';
  SELECT RAISE(ABORT, 'Inactive medicines cannot be sold.')
  WHERE (SELECT is_active FROM medicines WHERE medicine_id = NEW.medicine_id) = 0;
  SELECT RAISE(ABORT, 'This medicine requires a verified prescription.')
  WHERE NEW.prescription_id IS NULL
    AND (SELECT requires_prescription FROM medicines WHERE medicine_id = NEW.medicine_id) = 1;
END;

-- BR-10: lines of a completed order are history (only quantity_returned may change, via returns).
CREATE TRIGGER IF NOT EXISTS trg_order_items_locked
BEFORE UPDATE OF order_id, medicine_id, prescription_id, quantity, unit_price, line_total ON order_items
WHEN (SELECT status FROM orders WHERE order_id = OLD.order_id) <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'Items of a completed order cannot be changed.');
END;

CREATE TRIGGER IF NOT EXISTS trg_order_items_no_delete
BEFORE DELETE ON order_items
WHEN (SELECT status FROM orders WHERE order_id = OLD.order_id) <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'Items of a completed order cannot be deleted.');
END;

CREATE TRIGGER IF NOT EXISTS trg_orders_locked
BEFORE UPDATE OF customer_id, user_id, subtotal, discount_amount, total_amount, order_number ON orders
WHEN OLD.status <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'A completed order cannot be changed. Use a refund instead.');
END;

CREATE TRIGGER IF NOT EXISTS trg_orders_no_delete
BEFORE DELETE ON orders
WHEN OLD.status IN ('COMPLETED', 'REFUNDED')
BEGIN
  SELECT RAISE(ABORT, 'Completed orders cannot be deleted. Use a refund instead.');
END;

-- Order state machine (docs/04-system-diagrams.md §4.6) plus BR-05 / BR-06 / BR-07.
CREATE TRIGGER IF NOT EXISTS trg_orders_status
BEFORE UPDATE OF status ON orders
WHEN NEW.status <> OLD.status
BEGIN
  SELECT RAISE(ABORT, 'Invalid order status change.')
  WHERE NOT ((OLD.status = 'PENDING' AND NEW.status IN ('COMPLETED', 'CANCELLED'))
          OR (OLD.status = 'COMPLETED' AND NEW.status = 'REFUNDED'));
  SELECT RAISE(ABORT, 'A completed order needs at least one item.')
  WHERE NEW.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.order_id);
  SELECT RAISE(ABORT, 'Order subtotal does not match its items.')
  WHERE NEW.status = 'COMPLETED'
    AND NEW.subtotal <> (SELECT IFNULL(SUM(line_total), 0) FROM order_items WHERE order_id = NEW.order_id);
  SELECT RAISE(ABORT, 'Every order line must be fully allocated to stock batches.')
  WHERE NEW.status = 'COMPLETED' AND EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = NEW.order_id
      AND oi.quantity <> -IFNULL((SELECT SUM(m.quantity_change) FROM stock_movements m
                                  WHERE m.order_item_id = oi.order_item_id AND m.movement_type = 'SALE'), 0));
  SELECT RAISE(ABORT, 'A pending order with allocated stock cannot be cancelled.')
  WHERE NEW.status = 'CANCELLED' AND EXISTS (
    SELECT 1 FROM stock_movements m JOIN order_items oi ON oi.order_item_id = m.order_item_id
    WHERE oi.order_id = NEW.order_id);
  SELECT RAISE(ABORT, 'Only a fully returned order can be marked refunded.')
  WHERE NEW.status = 'REFUNDED'
    AND EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.order_id AND quantity_returned < quantity);
END;

-- BR-17: prescriptions are verified by a pharmacist or admin.
CREATE TRIGGER IF NOT EXISTS trg_prescriptions_verifier
BEFORE INSERT ON prescriptions
BEGIN
  SELECT RAISE(ABORT, 'Prescriptions must be verified by an active pharmacist or administrator.')
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.verified_by
                    AND is_active = 1 AND role IN ('ADMIN', 'PHARMACIST'));
END;
`;

// Read models used by screens, reports and the SQL console. Definitions match docs/07-reports.md.
const VIEWS_SQL = `
CREATE VIEW IF NOT EXISTS v_batch_status AS
SELECT b.*,
       m.brand_name, m.generic_name, m.strength, m.unit, m.category_id,
       s.supplier_name,
       CAST(julianday(b.expiry_date) - julianday(date('now', 'localtime')) AS INTEGER) AS days_to_expiry,
       CASE
         WHEN b.quantity_remaining = 0 THEN 'DEPLETED'
         WHEN b.is_active = 0 THEN 'QUARANTINED'
         WHEN b.expiry_date < date('now', 'localtime') THEN 'EXPIRED'
         WHEN b.expiry_date <= date('now', 'localtime', '+' || IFNULL(
              (SELECT setting_value FROM app_settings WHERE setting_key = 'expiry_warning_days'), '90') || ' days')
           THEN 'NEAR_EXPIRY'
         ELSE 'SELLABLE'
       END AS batch_state,
       (b.is_active = 1 AND b.quantity_remaining > 0 AND b.expiry_date >= date('now', 'localtime')) AS is_sellable
FROM medicine_batches b
JOIN medicines m ON m.medicine_id = b.medicine_id
LEFT JOIN suppliers s ON s.supplier_id = b.supplier_id;

CREATE VIEW IF NOT EXISTS v_medicine_stock AS
SELECT m.*,
       c.category_name,
       IFNULL(SUM(CASE WHEN bs.is_sellable THEN bs.quantity_remaining END), 0) AS sellable_stock,
       IFNULL(SUM(bs.quantity_remaining), 0) AS stock_on_hand,
       MIN(CASE WHEN bs.is_sellable THEN bs.expiry_date END) AS next_expiry,
       CASE
         WHEN IFNULL(SUM(CASE WHEN bs.is_sellable THEN bs.quantity_remaining END), 0) = 0 THEN 'OUT'
         WHEN IFNULL(SUM(CASE WHEN bs.is_sellable THEN bs.quantity_remaining END), 0) <= m.min_stock_level THEN 'LOW'
         ELSE 'OK'
       END AS stock_state
FROM medicines m
JOIN categories c ON c.category_id = m.category_id
LEFT JOIN v_batch_status bs ON bs.medicine_id = m.medicine_id
GROUP BY m.medicine_id;

-- Counted sales: completed or later refunded. net_amount = what the pharmacy kept.
CREATE VIEW IF NOT EXISTS v_sales AS
SELECT o.*,
       date(o.completed_at) AS sale_date,
       o.total_amount - o.refunded_amount AS net_amount,
       u.full_name AS staff_name,
       cu.full_name AS customer_name
FROM orders o
JOIN users u ON u.user_id = o.user_id
LEFT JOIN customers cu ON cu.customer_id = o.customer_id
WHERE o.status IN ('COMPLETED', 'REFUNDED');

-- Cost of goods per sale line: SALE movements at batch cost, minus RETURN movements.
CREATE VIEW IF NOT EXISTS v_line_cost AS
SELECT oi.order_item_id, oi.order_id, oi.medicine_id,
       IFNULL(SUM(-m.quantity_change * b.purchase_price), 0) AS cost_amount
FROM order_items oi
LEFT JOIN stock_movements m ON m.order_item_id = oi.order_item_id AND m.movement_type IN ('SALE', 'RETURN')
LEFT JOIN medicine_batches b ON b.batch_id = m.batch_id
GROUP BY oi.order_item_id;

-- docs/07-reports.md §7.4: every row here is a consistency problem.
CREATE VIEW IF NOT EXISTS v_integrity_issues AS
SELECT 'Batch balance differs from movement ledger' AS issue, 'batch ' || b.batch_id AS ref
FROM medicine_batches b
WHERE b.quantity_remaining <> (SELECT IFNULL(SUM(quantity_change), 0) FROM stock_movements WHERE batch_id = b.batch_id)
UNION ALL
SELECT 'Completed order without items', o.order_number
FROM orders o
WHERE o.status IN ('COMPLETED', 'REFUNDED') AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = o.order_id)
UNION ALL
SELECT 'Order subtotal differs from its lines', o.order_number
FROM orders o
WHERE o.status <> 'PENDING'
  AND o.subtotal <> (SELECT IFNULL(SUM(line_total), 0) FROM order_items WHERE order_id = o.order_id)
UNION ALL
SELECT 'Sold quantity differs from batch allocations', 'order item ' || oi.order_item_id
FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
WHERE o.status IN ('COMPLETED', 'REFUNDED')
  AND oi.quantity <> -(SELECT IFNULL(SUM(quantity_change), 0) FROM stock_movements
                      WHERE order_item_id = oi.order_item_id AND movement_type = 'SALE')
UNION ALL
SELECT 'Returned quantity differs from RETURN movements', 'order item ' || oi.order_item_id
FROM order_items oi
WHERE oi.quantity_returned <> (SELECT IFNULL(SUM(quantity_change), 0) FROM stock_movements
                               WHERE order_item_id = oi.order_item_id AND movement_type = 'RETURN')
UNION ALL
SELECT 'Prescription medicine sold without prescription', 'order item ' || oi.order_item_id
FROM order_items oi JOIN medicines m ON m.medicine_id = oi.medicine_id
WHERE m.requires_prescription = 1 AND oi.prescription_id IS NULL;
`;

export const DEFAULT_SETTINGS: Record<string, string> = {
  pharmacy_name: 'PharmaCare',
  expiry_warning_days: '90',
  default_min_stock: '10',
  auto_lock_minutes: '5',
  receipt_footer: 'Thank you! Get well soon.',
};

export const HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS query_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sql         TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('success', 'error')),
  executed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`;

export const BUSINESS_TABLES = [
  'users',
  'categories',
  'medicines',
  'suppliers',
  'medicine_batches',
  'customers',
  'prescriptions',
  'orders',
  'order_items',
  'stock_movements',
  'app_settings',
];

/** Creates tables, constraints, triggers and views (idempotent). */
export async function createSchema(db: SQLiteDatabase) {
  await db.execAsync(TABLES_SQL + INDEXES_SQL + TRIGGERS_SQL + VIEWS_SQL + HISTORY_TABLE_SQL);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.runAsync('INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)', key, value);
  }
}

/** Runs on app start (via SQLiteProvider.onInit): creates the schema and seeds sample data once. */
export async function migrate(db: SQLiteDatabase, options: { seed?: boolean } = {}) {
  // Foreign keys are off by default in SQLite and are a per-connection setting.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await runInTransaction(db, async (tx) => {
    await createSchema(tx);
    if (options.seed !== false) await seed(tx);
    await tx.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}

export function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Drops every user table and view (including ones created in the SQL editor) and re-seeds. */
export async function resetDatabase(db: SQLiteDatabase) {
  const objects = await db.getAllAsync<{ type: string; name: string }>(
    "SELECT type, name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC"
  );
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    for (const { type, name } of objects) {
      await db.execAsync(`DROP ${type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS ${quoteIdent(name)};`);
    }
    await db.execAsync('PRAGMA user_version = 0;');
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
  await migrate(db);
}
