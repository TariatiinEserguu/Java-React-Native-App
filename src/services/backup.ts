import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { AppError, assertCan, type SessionUser } from './permissions';
import { writeSetting } from './settings';
import { t } from '../i18n/core';

// FR-20 / TC-16: copies the whole database to a second SQLite file in the app's private storage
// using SQLite's online backup API, and restores from it. Not available on web.

export const BACKUP_DATABASE_NAME = 'pharmacare-backup.db';

export const backupSupported = Platform.OS !== 'web';

/** Returns when the existing backup was made, or null if there is none. */
export async function backupInfo(): Promise<{ created_at: string; orders: number } | null> {
  if (!backupSupported) return null;
  const backup = await openDatabaseAsync(BACKUP_DATABASE_NAME);
  try {
    const row = await backup.getFirstAsync<{ created_at: string; orders: number }>(
      "SELECT setting_value AS created_at, (SELECT COUNT(*) FROM orders) AS orders FROM app_settings WHERE setting_key = 'last_backup_at'"
    );
    return row ?? null;
  } catch {
    return null; // empty file: no tables yet
  } finally {
    await backup.closeAsync();
  }
}

export async function createBackup(db: SQLiteDatabase, actor: SessionUser) {
  assertCan(actor, 'backup.manage');
  if (!backupSupported) throw new AppError(t('backup.unsupported'));
  const now = (await db.getFirstAsync<{ now: string }>("SELECT datetime('now', 'localtime') AS now"))!.now;
  // Written first so the copy records its own creation time.
  await writeSetting(db, 'last_backup_at', now);
  const backup = await openDatabaseAsync(BACKUP_DATABASE_NAME);
  try {
    await backupDatabaseAsync({ sourceDatabase: db, destDatabase: backup });
  } finally {
    await backup.closeAsync();
  }
  return now;
}

/** Replaces the current data with the backup. The caller should log the user out afterwards. */
export async function restoreBackup(db: SQLiteDatabase, actor: SessionUser) {
  assertCan(actor, 'backup.manage');
  if (!backupSupported) throw new AppError(t('backup.unsupported'));
  const info = await backupInfo();
  if (!info) throw new AppError(t('backup.none'));
  const backup = await openDatabaseAsync(BACKUP_DATABASE_NAME);
  try {
    const check = await backup.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (check?.integrity_check !== 'ok') throw new AppError(t('backup.damaged'));
    await backupDatabaseAsync({ sourceDatabase: backup, destDatabase: db });
  } finally {
    await backup.closeAsync();
  }
  await db.execAsync('PRAGMA foreign_keys = ON;');
}
