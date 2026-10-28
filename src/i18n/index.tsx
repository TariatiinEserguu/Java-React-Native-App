import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { readPreference, writePreference } from '../preferences';
import { getLanguage, isLanguage, setLanguage, subscribeLanguage, t, tn, getLocale, DEFAULT_LANGUAGE, type Language } from './core';

export { t, tn, tryT, getLanguage, getLocale, LANGUAGES, type Language, type TranslationKey } from './core';

const STORAGE_KEY = 'pharmacare.language';

// Applied at import time (before the first render) so the saved language is already active on screen one.
const saved = readPreference(STORAGE_KEY);
setLanguage(isLanguage(saved) ? saved : DEFAULT_LANGUAGE);

type I18nValue = {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: typeof t;
  tn: typeof tn;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);

  const change = useCallback((next: Language) => {
    setLanguage(next);
    writePreference(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    // Keeps the browser's accessibility/spell-check language and document title in step with the UI.
    if (typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nValue>(() => ({ language, locale: getLocale(language), setLanguage: change, t, tn }), [language, change]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>.');
  return value;
}
