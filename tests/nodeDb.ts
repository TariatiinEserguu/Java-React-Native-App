import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * Minimal stand-in for expo-sqlite's async API on top of Node's built-in SQLite, so the real
 * schema, triggers, services and reports can be tested on a computer. Only the methods the app
 * uses are implemented.
 */
export function openTestDb(): SQLiteDatabase {
  const db = new DatabaseSync(':memory:');
  const params = (args: unknown[]) => args as SQLInputValue[];
  const adapter = {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, ...args: unknown[]) {
      const r = db.prepare(sql).run(...params(args));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync(sql: string, ...args: unknown[]) {
      return db.prepare(sql).get(...params(args)) ?? null;
    },
    async getAllAsync(sql: string, ...args: unknown[]) {
      return db.prepare(sql).all(...params(args));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return adapter as unknown as SQLiteDatabase;
}
