import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SETTINGS } from '../db/schema';
import { AppError, assertCan, type SessionUser } from './permissions';

export type Settings = {
  pharmacy_name: string;
  expiry_warning_days: number;
  default_min_stock: number;
  auto_lock_minutes: number;
  receipt_footer: string;
  last_backup_at: string | null;
};

const NUMERIC: Record<string, [min: number, max: number]> = {
  expiry_warning_days: [1, 365],
  default_min_stock: [0, 100_000],
  auto_lock_minutes: [1, 240],
};

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ setting_key: string; setting_value: string }>('SELECT setting_key, setting_value FROM app_settings');
  const map: Record<string, string> = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value])) };
  return {
    pharmacy_name: map.pharmacy_name,
    expiry_warning_days: Number(map.expiry_warning_days),
    default_min_stock: Number(map.default_min_stock),
    auto_lock_minutes: Number(map.auto_lock_minutes),
    receipt_footer: map.receipt_footer,
    last_backup_at: map.last_backup_at ?? null,
  };
}

export async function writeSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now', 'localtime')`,
    key, value
  );
}

export async function updateSetting(db: SQLiteDatabase, actor: SessionUser, key: keyof typeof DEFAULT_SETTINGS, raw: string) {
  assertCan(actor, 'settings.manage');
  const value = raw.trim();
  if (!(key in DEFAULT_SETTINGS)) throw new AppError(`Unknown setting ${key}.`);
  const range = NUMERIC[key];
  if (range) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < range[0] || n > range[1]) throw new AppError(`Enter a whole number from ${range[0]} to ${range[1]}.`);
  } else if (!value || value.length > 100) {
    throw new AppError('Enter 1–100 characters.');
  }
  await writeSetting(db, key, value);
}
