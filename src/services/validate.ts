import { AppError } from './permissions';

// Field validation shared by every service (docs/06-business-rules.md §6.2).
// Services throw ValidationError with per-field messages; forms show them next to the fields.

export class ValidationError extends AppError {
  constructor(readonly fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? 'Invalid input.');
  }
}

export class Checker {
  readonly errors: Record<string, string> = {};

  fail(field: string, message: string) {
    this.errors[field] ??= message;
  }

  text(field: string, value: string | null | undefined, label: string, min = 1, max = 100): string {
    const v = (value ?? '').trim();
    if (!v) this.fail(field, `${label} is required.`);
    else if (v.length < min || v.length > max) this.fail(field, `${label} must be ${min}–${max} characters.`);
    return v;
  }

  optionalText(field: string, value: string | null | undefined, max = 200): string | null {
    const v = (value ?? '').trim();
    if (v.length > max) this.fail(field, `Must be ${max} characters or fewer.`);
    return v || null;
  }

  /** Whole number (MNT amounts, quantities). Accepts "12,500" and "12 500". */
  int(field: string, value: string | number | null | undefined, label: string, { min = 0, max = 10_000_000 } = {}): number {
    const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[\s,₮]/g, ''));
    if (String(value ?? '').trim() === '' || !Number.isInteger(n)) this.fail(field, `${label} must be a whole number.`);
    else if (n < min || n > max) this.fail(field, `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`);
    return n;
  }

  date(field: string, value: string | null | undefined, label: string): string {
    const v = (value ?? '').trim();
    if (!isIsoDate(v)) this.fail(field, `${label} must be a real date in YYYY-MM-DD format.`);
    return v;
  }

  phone(field: string, value: string | null | undefined): string | null {
    const v = (value ?? '').trim();
    if (v && !/^[+\d][\d\s()-]{5,19}$/.test(v)) this.fail(field, 'Use 6–20 digits, spaces, dashes and an optional leading +.');
    return v || null;
  }

  email(field: string, value: string | null | undefined): string | null {
    const v = (value ?? '').trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) this.fail(field, 'Enter a valid email address.');
    return v || null;
  }

  oneOf<T extends string>(field: string, value: string | null | undefined, allowed: readonly T[], label: string): T {
    if (!allowed.includes(value as T)) this.fail(field, `Choose a ${label}.`);
    return value as T;
  }

  done() {
    if (Object.keys(this.errors).length) throw new ValidationError(this.errors);
  }
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
