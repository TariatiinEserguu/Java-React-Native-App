import type { SQLiteDatabase } from 'expo-sqlite';

import { seed } from './seed';

export const DATABASE_NAME = 'inventory.db';

// Bump this and add a migration step when the schema changes.
const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  sku         TEXT    NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price       REAL    NOT NULL CHECK (price >= 0),
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT,
  city       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  total       REAL    NOT NULL CHECK (total >= 0),
  status      TEXT    NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
`;

export const HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS query_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sql         TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('success', 'error')),
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Runs on app start (via SQLiteProvider.onInit): creates the schema and seeds sample data once. */
export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await db.withTransactionAsync(async () => {
    await db.execAsync(SCHEMA_SQL + HISTORY_TABLE_SQL);
    await seed(db);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
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
