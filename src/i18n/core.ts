// Framework-free translation core. Services, validators and screens all call the same `t()`,
// so a message is produced in whichever language is active at that moment. React components
// subscribe through useI18n() (see ./index.tsx) so they re-render when the language changes.

import { en, type TranslationKey } from './locales/en';
import { mn } from './locales/mn';

export type Language = 'mn' | 'en';
export const LANGUAGES: readonly Language[] = ['mn', 'en'];
export const DEFAULT_LANGUAGE: Language = 'mn';

export type { TranslationKey };
type Params = Record<string, string | number>;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, mn };

// Plural families are stored as `<base>_one` / `<base>_other` (Mongolian uses the same text for both).
export type PluralKey = TranslationKey extends infer K ? (K extends `${infer B}_other` ? B : never) : never;

let current: Language = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

export function isLanguage(value: unknown): value is Language {
  return value === 'mn' || value === 'en';
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language) {
  if (language === current) return;
  current = language;
  listeners.forEach((l) => l());
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** BCP 47 locale for Intl formatting. */
export function getLocale(language: Language = current) {
  return language === 'mn' ? 'mn-MN' : 'en-US';
}

function interpolate(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function t(key: TranslationKey, params?: Params): string {
  return interpolate(dictionaries[current][key] ?? dictionaries.en[key] ?? key, params);
}

/** Plural-aware lookup: `tn('days', 3)` resolves `days_other` ({count} is filled in automatically). */
export function tn(base: PluralKey, count: number, params?: Params): string {
  const key = `${base}_${count === 1 ? 'one' : 'other'}` as TranslationKey;
  return t(key, { count, ...params });
}

/** For dynamic keys built from data (enum values, report columns). Returns null when no entry exists. */
export function tryT(key: string, params?: Params): string | null {
  return key in dictionaries.en ? t(key as TranslationKey, params) : null;
}
