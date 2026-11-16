import type { SQLiteDatabase } from 'expo-sqlite';

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` after every task queued before it on the app's connection has finished.
 *
 * The app talks to SQLite over one connection. A transaction on it is visible to every statement
 * sent while it is open, so without a queue a screen refreshing in the middle of a checkout could
 * read the half-written order (and keep showing it if the checkout then rolled back). Writes
 * (runInTransaction) and screen reads (useDbQuery) therefore take turns here.
 *
 * Never call `serialized` or `runInTransaction` from inside a queued task: it would wait for itself.
 */
export function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Runs `task` in a transaction on the main connection, one write operation at a time.
 *
 * expo-sqlite's `withTransactionAsync` is not exclusive: another async write started meanwhile
 * (e.g. a double-tapped "Checkout") could run inside it. `withExclusiveTransactionAsync` avoids
 * that, but it opens a second connection on which `PRAGMA foreign_keys` is off (and it can't be
 * turned on inside a transaction), and it isn't available on web. So work is serialised instead.
 */
export function runInTransaction<T>(db: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  return serialized(async () => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await task(db);
    });
    return result;
  });
}
