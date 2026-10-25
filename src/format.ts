export function money(value: number) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** SQLite datetime('now') values are UTC "YYYY-MM-DD HH:MM:SS". */
function parseSqliteDate(value: string) {
  const date = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shortDate(value: string) {
  return parseSqliteDate(value)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? value;
}

export function dateTime(value: string) {
  return (
    parseSqliteDate(value)?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? value
  );
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Uint8Array) return `<BLOB ${value.length} bytes>`;
  return String(value);
}
