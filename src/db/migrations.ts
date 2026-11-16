import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SETTINGS, HISTORY_TABLE_SQL, INDEXES_SQL, QUERY_INDEXES_SQL, quoteIdent, TABLES_SQL, TRIGGERS_SQL, VIEWS_SQL } from './schema';
import { seed } from './seed';
import { runInTransaction, serialized } from './transaction';

export type Migration = { version: number; name: string; up: (db: SQLiteDatabase) => Promise<void> };

/**
 * Ordered schema changes. Pending ones run in order inside a single transaction (an upgrade either
 * completes or leaves the database untouched), and `PRAGMA user_version` records how far a
 * database has come. Never edit a migration that has shipped: append a new one.
 *
 * Triggers and views hold no data, so they aren't migrated step by step: after any upgrade they are
 * dropped and re-created from the current definitions in schema.ts.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'Tables, constraints and indexes',
    up: (db) => db.execAsync(TABLES_SQL + INDEXES_SQL + HISTORY_TABLE_SQL),
  },
  {
    version: 2,
    name: 'Indexes for daily sales, the stock ledger and FEFO allocation',
    up: (db) => db.execAsync(QUERY_INDEXES_SQL),
  },
];

/** The schema version this build of the app expects. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export class NewerSchemaError extends Error {
  constructor(readonly found: number) {
    super(`The database is at schema version ${found}, but this app only knows up to ${SCHEMA_VERSION}. Update the app.`);
  }
}

export type ConnectionOptions = {
  /**
   * Write-ahead logging: commits append to a log instead of rewriting pages, so each checkout or
   * stock change needs fewer disk syncs. Native only: the browser storage behind expo-sqlite on web
   * has no shared memory, which WAL needs.
   */
  wal?: boolean;
};

/** Per-connection settings. SQLite forgets these when a connection closes, so they run on every open. */
export async function configureConnection(db: SQLiteDatabase, { wal = false }: ConnectionOptions = {}) {
  // Foreign keys are off by default in SQLite. busy_timeout waits for a lock instead of failing at once.
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;');
  // With WAL, synchronous=NORMAL is still crash-safe: at worst the last commit before a power cut is lost.
  if (wal) await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
}

export async function schemaVersion(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Names of the app's own triggers and views, read from their definitions. */
function derivedObjects() {
  const found: { type: 'TRIGGER' | 'VIEW'; name: string }[] = [];
  for (const m of (TRIGGERS_SQL + VIEWS_SQL).matchAll(/CREATE\s+(TRIGGER|VIEW)\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)) {
    found.push({ type: m[1].toUpperCase() as 'TRIGGER' | 'VIEW', name: m[2] });
  }
  return found;
}

/**
 * Drops and re-creates the app's triggers and views from their current definitions. Objects that
 * users made themselves in the SQL console are left alone.
 */
async function rebuildDerivedObjects(db: SQLiteDatabase) {
  for (const { type, name } of derivedObjects()) {
    await db.execAsync(`DROP ${type} IF EXISTS ${quoteIdent(name)};`);
  }
  await db.execAsync(TRIGGERS_SQL + VIEWS_SQL);
}

export type MigrationResult = { from: number; to: number; applied: number[] };

/**
 * Brings the database up to SCHEMA_VERSION. Runs on every app start (SQLiteProvider.onInit) and
 * after a backup is restored; a database that is already current costs one PRAGMA read.
 * A brand-new database is filled with the demo data unless `seed: false`.
 */
export async function migrate(db: SQLiteDatabase, options: ConnectionOptions & { seed?: boolean } = {}): Promise<MigrationResult> {
  await configureConnection(db, options);
  const from = await schemaVersion(db);
  if (from > SCHEMA_VERSION) throw new NewerSchemaError(from);
  if (from === SCHEMA_VERSION) return { from, to: from, applied: [] };

  const pending = MIGRATIONS.filter((m) => m.version > from);
  await runInTransaction(db, async (tx) => {
    for (const migration of pending) await migration.up(tx);
    await rebuildDerivedObjects(tx);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await tx.runAsync('INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)', key, value);
    }
    if (from === 0 && options.seed !== false) await seed(tx);
    await tx.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
  // Tables and indexes changed: let SQLite refresh the statistics its query planner uses.
  await serialized(() => db.execAsync('PRAGMA optimize;'));
  return { from, to: SCHEMA_VERSION, applied: pending.map((m) => m.version) };
}

/** Drops every user table and view (including ones created in the SQL editor) and re-seeds. */
export async function resetDatabase(db: SQLiteDatabase) {
  await serialized(async () => {
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
  });
  await migrate(db);
}
