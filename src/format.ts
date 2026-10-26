/** Whole Mongolian tögrög: 12500 → "12,500₮". */
export function money(value: number) {
  return `${Math.round(value).toLocaleString('en-US')}₮`;
}

/** The database stores local times as "YYYY-MM-DD HH:MM:SS" and dates as "YYYY-MM-DD". */
function parseSqliteDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = value.length > 10 ? value.slice(11).split(':').map(Number) : [];
  const date = new Date(y, m - 1, d, hh, mm, ss);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shortDate(value: string | null) {
  if (!value) return '—';
  return parseSqliteDate(value)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? value;
}

export function dateTime(value: string | null) {
  if (!value) return '—';
  return (
    parseSqliteDate(value)?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) ?? value
  );
}

/** Helper text for expiry dates: "in 23 days", "expired 3 days ago". */
export function daysLabel(days: number) {
  if (days === 0) return 'expires today';
  if (days < 0) return `expired ${-days} day${days === -1 ? '' : 's'} ago`;
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Uint8Array) return `<BLOB ${value.length} bytes>`;
  return String(value);
}

export function medicineLabel(m: { brand_name: string; strength: string | null }) {
  return m.strength ? `${m.brand_name} ${m.strength}` : m.brand_name;
}
