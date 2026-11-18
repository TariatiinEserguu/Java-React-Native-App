import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrate } from './migrations';
import { DATABASE_NAME } from './schema';

export const demoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
export const activeDatabaseName = demoMode ? 'pharmacare-demo.db' : DATABASE_NAME;

/** Write-ahead logging is used where the storage supports it (Android and iOS, not the browser). */
export const walSupported = Platform.OS !== 'web';

/** SQLiteProvider's onInit: tune the connection, then bring the schema up to date. */
export async function initDatabase(db: SQLiteDatabase) {
  await migrate(db, { wal: walSupported, seed: demoMode });
}
