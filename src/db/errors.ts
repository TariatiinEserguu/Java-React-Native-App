/**
 * expo-sqlite wraps SQLite errors like:
 *   "Call to function 'NativeStatement.runAsync' has been rejected.\n→ Caused by: Error code 19: UNIQUE constraint failed: users.username"
 * This extracts the SQLite part so it can be shown to the user.
 */
export function sqliteMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const caused = raw.split(/Caused by:\s*/).pop() ?? raw;
  return caused
    .replace(/^Error code\s*:?\s*\d+\s*:?\s*/i, '')
    .replace(/^Error:\s*/, '')
    .trim();
}

const FRIENDLY: [RegExp, string][] = [
  [/UNIQUE constraint failed: users\.username/i, 'This username is already taken.'],
  [/UNIQUE constraint failed: categories\.category_name/i, 'A category with this name already exists.'],
  [/UNIQUE constraint failed: suppliers\.supplier_name/i, 'A supplier with this name already exists.'],
  [/UNIQUE constraint failed: medicines\.barcode/i, 'Another medicine already uses this barcode.'],
  [/UNIQUE constraint failed: medicines\.brand_name/i, 'This medicine (same name, strength, form and unit) already exists.'],
  [/UNIQUE constraint failed: medicine_batches/i, 'This batch number is already recorded for this medicine and supplier.'],
  [/UNIQUE constraint failed: customers\.phone/i, 'A customer with this phone number already exists.'],
  [/CHECK constraint failed: .*quantity_remaining/i, 'Not enough stock in this batch for that change.'],
  [/CHECK constraint failed: .*expiry_date/i, 'Expiry date must be a valid date after the received date.'],
  [/FOREIGN KEY constraint failed/i, 'This record is used by other records (for example orders), so it cannot be removed.'],
  [/CHECK constraint failed/i, 'A value is outside the allowed range.'],
];

/** For form/CRUD actions: map common constraint errors to plain language. Trigger messages pass through. */
export function friendlyError(error: unknown): string {
  const message = sqliteMessage(error);
  for (const [pattern, text] of FRIENDLY) {
    if (pattern.test(message)) return text;
  }
  return message;
}
