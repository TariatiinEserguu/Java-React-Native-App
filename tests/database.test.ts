// Schema migrations, connection settings, the connection queue and the SQL console's database tools.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS, migrate, NewerSchemaError, resetDatabase, SCHEMA_VERSION, schemaVersion } from '../src/db/migrations';
import { DEFAULT_SETTINGS, TRIGGERS_SQL, VIEWS_SQL } from '../src/db/schema';
import { seed } from '../src/db/seed';
import { checkDatabase, compactDatabase, databaseInfo, explainQueryPlan, optimizeDatabase } from '../src/db/sqlRunner';
import { runInTransaction, serialized } from '../src/db/transaction';
import { setLanguage } from '../src/i18n/core';
import { sellableBatches } from '../src/services/sales';
import { openTestDb } from './nodeDb';

setLanguage('en');

const first = async <T>(db: SQLiteDatabase, sql: string, ...args: unknown[]) => (await db.getFirstAsync<T>(sql, ...(args as never[])))!;
const count = async (db: SQLiteDatabase, table: string) => (await first<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${table}`)).n;
const exists = async (db: SQLiteDatabase, type: string, name: string) =>
  (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM sqlite_master WHERE type = ? AND name = ?', type, name)).n === 1;
const plan = async (db: SQLiteDatabase, sql: string) => (await explainQueryPlan(db, sql)).map((s) => s.detail).join('\n');

/** A database as the previous release (schema version 1) left it: tables, triggers, views and demo data. */
async function versionOneDatabase() {
  const db = openTestDb();
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await MIGRATIONS[0].up(db);
  await db.execAsync(TRIGGERS_SQL + VIEWS_SQL);
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.runAsync('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)', key, value);
  }
  await seed(db);
  await db.execAsync('PRAGMA user_version = 1;');
  return db;
}

describe('migrations', () => {
  test('are numbered 1, 2, 3, … and SCHEMA_VERSION is the last one', () => {
    assert.deepEqual(
      MIGRATIONS.map((m) => m.version),
      MIGRATIONS.map((_, i) => i + 1)
    );
    assert.equal(SCHEMA_VERSION, MIGRATIONS[MIGRATIONS.length - 1].version);
  });

  test('a new database goes straight to the current version with demo data', async () => {
    const db = openTestDb();
    const result = await migrate(db);
    assert.deepEqual(result, { from: 0, to: SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    assert.equal(await schemaVersion(db), SCHEMA_VERSION);
    assert.ok((await count(db, 'orders')) > 0);
    assert.deepEqual(await migrate(db), { from: SCHEMA_VERSION, to: SCHEMA_VERSION, applied: [] });
  });

  test('seed: false creates an empty schema', async () => {
    const db = openTestDb();
    await migrate(db, { seed: false });
    assert.equal(await count(db, 'orders'), 0);
    assert.equal(await count(db, 'app_settings'), Object.keys(DEFAULT_SETTINGS).length);
  });

  test('upgrades a version 1 database without touching its data', async () => {
    const db = await versionOneDatabase();
    const orders = await count(db, 'orders');
    const movements = await count(db, 'stock_movements');
    // Things an upgrade must handle: a user's own view, and an app view that is missing.
    await db.execAsync('CREATE VIEW my_report AS SELECT order_number FROM orders; DROP VIEW v_sales;');

    const result = await migrate(db);
    assert.deepEqual(result.applied, [2]);
    assert.equal(await schemaVersion(db), 2);
    assert.equal(await count(db, 'orders'), orders);
    assert.equal(await count(db, 'stock_movements'), movements);
    for (const index of ['idx_orders_sale_day', 'idx_movements_day', 'idx_movements_date', 'idx_batches_fefo']) {
      assert.ok(await exists(db, 'index', index), `${index} created`);
    }
    assert.ok(await exists(db, 'view', 'v_sales'), 'app views are re-created');
    assert.ok(await exists(db, 'view', 'my_report'), 'user views are kept');
    const health = await checkDatabase(db);
    assert.deepEqual(health, { structure: ['ok'], foreignKeyViolations: 0, issues: [] });
  });

  test('a failing upgrade rolls back completely', async () => {
    const db = await versionOneDatabase();
    // A table squatting on the name of a version 2 index makes that migration fail half-way.
    await db.execAsync('CREATE TABLE idx_movements_date (x);');
    await assert.rejects(migrate(db), /already/);
    assert.equal(await schemaVersion(db), 1);
    assert.equal(await exists(db, 'index', 'idx_orders_sale_day'), false, 'earlier statements of the upgrade were undone');
  });

  test('refuses a database from a newer app version', async () => {
    const db = openTestDb();
    await migrate(db);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1};`);
    await assert.rejects(migrate(db), NewerSchemaError);
  });

  test('reset drops everything, including tables made in the console, and re-seeds', async () => {
    const db = openTestDb();
    await migrate(db);
    await db.execAsync("CREATE TABLE scratch (x); DELETE FROM customers WHERE customer_id NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL) AND customer_id NOT IN (SELECT customer_id FROM prescriptions WHERE customer_id IS NOT NULL);");
    await resetDatabase(db);
    assert.equal(await exists(db, 'table', 'scratch'), false);
    assert.equal(await count(db, 'customers'), 6);
    assert.equal(await schemaVersion(db), SCHEMA_VERSION);
  });
});

describe('connection', () => {
  test('foreign keys are enforced after opening', async () => {
    const db = openTestDb();
    await migrate(db);
    assert.equal((await first<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')).foreign_keys, 1);
  });

  test('WAL mode on a database file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pharmacare-'));
    try {
      const db = openTestDb(join(dir, 'test.db'));
      await migrate(db, { wal: true, seed: false });
      assert.equal((await first<{ journal_mode: string }>(db, 'PRAGMA journal_mode')).journal_mode, 'wal');
      assert.equal((await first<{ synchronous: number }>(db, 'PRAGMA synchronous')).synchronous, 1); // NORMAL
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a queued read waits for the transaction in progress and never sees rolled-back rows', async () => {
    const db = openTestDb();
    await migrate(db);
    const before = await count(db, 'customers');
    const write = runInTransaction(db, async (tx) => {
      await tx.runAsync("INSERT INTO customers (full_name) VALUES ('Phantom Customer')");
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('checkout failed');
    }).catch(() => 'rolled back');
    const read = serialized(() => count(db, 'customers'));
    assert.equal(await write, 'rolled back');
    assert.equal(await read, before);
  });
});

describe('query plans use the version 2 indexes', () => {
  test('daily sales, movement log and FEFO allocation', async () => {
    const db = openTestDb();
    await migrate(db);
    assert.match(await plan(db, "SELECT SUM(net_amount) FROM v_sales WHERE sale_date = date('now', 'localtime')"), /idx_orders_sale_day/);
    assert.match(await plan(db, "SELECT * FROM v_sales WHERE sale_date BETWEEN '2026-01-01' AND '2026-12-31'"), /idx_orders_sale_day/);
    assert.match(await plan(db, "SELECT * FROM stock_movements WHERE date(movement_date) BETWEEN '2026-01-01' AND '2026-12-31'"), /idx_movements_day/);
    assert.match(await plan(db, 'SELECT * FROM stock_movements ORDER BY movement_date DESC, movement_id DESC LIMIT 100'), /idx_movements_date/);
    assert.match(
      await plan(
        db,
        `SELECT batch_id FROM medicine_batches
         WHERE medicine_id = 1 AND is_active = 1 AND quantity_remaining > 0 AND expiry_date >= date('now', 'localtime')
         ORDER BY expiry_date, batch_id`
      ),
      /idx_batches_fefo/
    );
    // And FEFO still picks the earliest-expiring sellable batch first.
    const batches = await sellableBatches(db, 1);
    assert.deepEqual(
      batches.map((b) => b.expiry_date),
      [...batches.map((b) => b.expiry_date)].sort()
    );
  });
});

describe('database tools', () => {
  test('overview reports version, journal, size and object counts', async () => {
    const db = openTestDb();
    await migrate(db);
    const info = await databaseInfo(db);
    assert.equal(info.schemaVersion, SCHEMA_VERSION);
    assert.equal(info.foreignKeys, true);
    assert.match(info.sqliteVersion, /^3\.\d+/);
    assert.ok(info.pageCount * info.pageSize > 0);
    assert.ok(info.objects.table >= 12 && info.objects.view >= 5 && info.objects.trigger >= 15 && info.objects.index >= 20);
  });

  test('health check finds a broken stock balance', async () => {
    const db = openTestDb();
    await migrate(db);
    assert.deepEqual((await checkDatabase(db)).issues, []);
    // Bypass the ledger (only possible with triggers dropped) to create an inconsistency.
    await db.execAsync('DROP TRIGGER trg_batches_immutable; UPDATE medicine_batches SET quantity_remaining = quantity_remaining - 1 WHERE batch_id = 2;');
    const report = await checkDatabase(db);
    assert.deepEqual(report.issues.map((i) => ({ ...i })), [{ issue: 'Batch balance differs from movement ledger', ref: 'batch 2' }]);
  });

  test('explain builds a nested plan without running the statement', async () => {
    const db = openTestDb();
    await migrate(db);
    const before = await count(db, 'customers');
    const steps = await explainQueryPlan(db, "-- comment\nDELETE FROM customers WHERE customer_id = 1; SELECT 1;");
    assert.ok(steps.length > 0);
    assert.equal(await count(db, 'customers'), before, 'nothing was deleted');
    const nested = await explainQueryPlan(db, 'SELECT * FROM orders WHERE order_id IN (SELECT order_id FROM order_items WHERE quantity > 1)');
    assert.ok(nested.some((s) => s.depth > 0));
    assert.deepEqual(await explainQueryPlan(db, '  -- only a comment'), []);
  });

  test('optimize and compact run and keep the data', async () => {
    const db = openTestDb();
    await migrate(db);
    const orders = await count(db, 'orders');
    await optimizeDatabase(db);
    const { before, after } = await compactDatabase(db);
    assert.ok(before > 0 && after > 0 && after <= before);
    assert.equal(await count(db, 'orders'), orders);
  });
});
