/**
 * expo-sqlite wraps SQLite errors like:
 *   "Call to function 'NativeStatement.runAsync' has been rejected.\n→ Caused by: Error code 19: UNIQUE constraint failed: products.sku"
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
  [/UNIQUE constraint failed: products\.sku/i, 'A product with this SKU already exists.'],
  [/UNIQUE constraint failed: customers\.email/i, 'A customer with this email already exists.'],
  [/UNIQUE constraint failed: categories\.name/i, 'A category with this name already exists.'],
  [/FOREIGN KEY constraint failed/i, 'This record is referenced by other records (for example orders), so it cannot be deleted.'],
  [/CHECK constraint failed/i, 'A value is outside the allowed range.'],
];

/** For form/CRUD actions: map common constraint errors to plain language. */
export function friendlyError(error: unknown): string {
  const message = sqliteMessage(error);
  for (const [pattern, text] of FRIENDLY) {
    if (pattern.test(message)) return text;
  }
  return message;
}
