import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migrate } from './migrations';

/** Write-ahead logging is used where the storage supports it (Android and iOS, not the browser). */
export const walSupported = Platform.OS !== 'web';

/** SQLiteProvider's onInit: tune the connection, then bring the schema up to date. */
export async function initDatabase(db: SQLiteDatabase) {
  await migrate(db, { wal: walSupported });
}
