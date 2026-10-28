import type { TranslationKey } from '../../i18n';

/** `label` is a translation key; the SQL itself is left as written. */
export const EXAMPLE_QUERIES: { label: TranslationKey; sql: string }[] = [
  {
    label: 'sql.example.stockView',
    sql: `SELECT brand_name, strength, generic_name, sellable_stock, min_stock_level, stock_state, next_expiry
FROM v_medicine_stock
WHERE is_active = 1
ORDER BY stock_state, brand_name;`,
  },
  {
    label: 'sql.example.fefo',
    sql: `SELECT brand_name, batch_number, quantity_remaining, expiry_date, days_to_expiry, batch_state
FROM v_batch_status
WHERE quantity_remaining > 0
ORDER BY expiry_date;`,
  },
  {
    label: 'sql.example.join',
    sql: `SELECT o.order_number, m.brand_name, oi.quantity, oi.unit_price, oi.line_total,
       b.batch_number, -sm.quantity_change AS taken_from_batch
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN medicines m ON m.medicine_id = oi.medicine_id
JOIN stock_movements sm ON sm.order_item_id = oi.order_item_id AND sm.movement_type = 'SALE'
JOIN medicine_batches b ON b.batch_id = sm.batch_id
ORDER BY o.completed_at DESC
LIMIT 50;`,
  },
  {
    label: 'sql.example.groupBy',
    sql: `SELECT c.category_name, SUM(oi.quantity - oi.quantity_returned) AS units,
       SUM((oi.quantity - oi.quantity_returned) * oi.unit_price) AS revenue_mnt
FROM order_items oi
JOIN v_sales s ON s.order_id = oi.order_id
JOIN medicines m ON m.medicine_id = oi.medicine_id
JOIN categories c ON c.category_id = m.category_id
GROUP BY c.category_id
ORDER BY revenue_mnt DESC;`,
  },
  {
    label: 'sql.example.ledger',
    sql: `SELECT b.batch_id, b.quantity_remaining,
       (SELECT SUM(quantity_change) FROM stock_movements WHERE batch_id = b.batch_id) AS ledger_sum
FROM medicine_batches b
WHERE b.quantity_remaining <> (SELECT SUM(quantity_change) FROM stock_movements WHERE batch_id = b.batch_id);
SELECT * FROM v_integrity_issues;`,
  },
  {
    label: 'sql.example.insert',
    sql: `INSERT INTO customers (full_name, phone, email)
VALUES ('Nomin Bold', '+976 9900 1122', 'nomin.bold@example.com');`,
  },
  {
    label: 'sql.example.trigger',
    sql: `-- The stock ledger is append-only, so this is refused by trg_movements_no_update.
UPDATE stock_movements SET quantity_change = 999 WHERE movement_id = 1;`,
  },
  {
    label: 'sql.example.check',
    sql: `-- Negative prices violate a CHECK constraint.
INSERT INTO medicines (category_id, brand_name, generic_name, dosage_form, unit, selling_price)
VALUES (1, 'Broken', 'Nothing', 'TABLET', 'box', -100);`,
  },
  { label: 'sql.example.pragmaTable', sql: 'PRAGMA table_info(medicine_batches);' },
  { label: 'sql.example.pragmaFk', sql: 'PRAGMA foreign_key_list(order_items);' },
  { label: 'sql.example.error', sql: 'SELECT * FROM table_that_does_not_exist;' },
];
