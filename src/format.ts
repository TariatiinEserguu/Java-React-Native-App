import { getLanguage, getLocale, t, tn } from './i18n/core';

/** Whole Mongolian tögrög: 12500 → "12,500₮". Grouping follows the active locale; the amount is never altered. */
export function formatNumber(value: number) {
  try {
    return value.toLocaleString(getLocale());
  } catch {
    return value.toLocaleString('en-US');
  }
}

export function money(value: number) {
  return `${formatNumber(Math.round(value))}₮`;
}

/** The database stores local times as "YYYY-MM-DD HH:MM:SS" and dates as "YYYY-MM-DD". */
function parseSqliteDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = value.length > 10 ? value.slice(11).split(':').map(Number) : [];
  const date = new Date(y, m - 1, d, hh, mm, ss);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number) => String(n).padStart(2, '0');

// Mongolian dates are written year-first with the month as an ordinal ("2026 оны 10-р сарын 28").
// Written out here instead of via Intl so every device renders them the same way.
function mongolianDate(d: Date, withYear: boolean) {
  const day = `${d.getMonth() + 1}-р сарын ${d.getDate()}`;
  return withYear ? `${d.getFullYear()} оны ${day}` : day;
}

export function shortDate(value: string | null) {
  if (!value) return '—';
  const date = parseSqliteDate(value);
  if (!date) return value;
  if (getLanguage() === 'mn') return mongolianDate(date, true);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(value: string | null) {
  if (!value) return '—';
  const date = parseSqliteDate(value);
  if (!date) return value;
  if (getLanguage() === 'mn') return `${mongolianDate(date, false)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Helper text for expiry dates: "in 23 days", "expired 3 days ago". */
export function daysLabel(days: number) {
  if (days === 0) return t('days.today');
  if (days < 0) return tn('days.ago', -days);
  return tn('days.in', days);
}

/** Today's local date as YYYY-MM-DD. */
export function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Uint8Array) return `<BLOB ${value.length} bytes>`;
  return String(value);
}

export function medicineLabel(m: { brand_name: string; strength: string | null }) {
  return m.strength ? `${m.brand_name} ${m.strength}` : m.brand_name;
}
