import type { SQLiteDatabase } from 'expo-sqlite';

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` in a transaction on the main connection, one write operation at a time.
 *
 * expo-sqlite's `withTransactionAsync` is not exclusive: another async write started meanwhile
 * (e.g. a double-tapped "Checkout") could run inside it. `withExclusiveTransactionAsync` avoids
 * that, but it opens a second connection on which `PRAGMA foreign_keys` is off (and it can't be
 * turned on inside a transaction), and it isn't available on web. So writes are serialised here
 * instead. Don't call runInTransaction from inside another runInTransaction: it would wait forever.
 */
export function runInTransaction<T>(db: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = async () => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await task(db);
    });
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
