export const EXAMPLE_QUERIES: { label: string; sql: string }[] = [
  { label: 'All products', sql: 'SELECT * FROM products ORDER BY name;' },
  {
    label: 'Orders with names (JOIN)',
    sql: `SELECT o.id, c.name AS customer, p.name AS product,
       o.quantity, o.total, o.status, o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
ORDER BY o.created_at DESC;`,
  },
  {
    label: 'Revenue by category',
    sql: `SELECT COALESCE(cat.name, 'Uncategorized') AS category,
       COUNT(o.id) AS orders,
       ROUND(SUM(o.total), 2) AS revenue
FROM orders o
JOIN products p ON p.id = o.product_id
LEFT JOIN categories cat ON cat.id = p.category_id
WHERE o.status != 'cancelled'
GROUP BY category
ORDER BY revenue DESC;`,
  },
  {
    label: 'INSERT customer',
    sql: `INSERT INTO customers (name, email, phone, city)
VALUES ('Nomin Bold', 'nomin.bold@example.com', '+976 9900 1122', 'Erdenet');`,
  },
  { label: 'UPDATE restock', sql: 'UPDATE products SET quantity = quantity + 10 WHERE quantity <= 5;' },
  { label: 'DELETE cancelled', sql: "DELETE FROM orders WHERE status = 'cancelled';" },
  {
    label: 'CREATE TABLE',
    sql: `CREATE TABLE IF NOT EXISTS suppliers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  country TEXT
);
INSERT INTO suppliers (name, country)
VALUES ('Nordic Office AB', 'Sweden'), ('Tokyo Gadget Co.', 'Japan');
SELECT * FROM suppliers;`,
  },
  { label: 'Table schema (PRAGMA)', sql: 'PRAGMA table_info(orders);' },
  { label: 'Error example', sql: 'SELECT * FROM table_that_does_not_exist;' },
];
