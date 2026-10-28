import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { readPreference, writePreference } from './preferences';

export type ThemeMode = 'light' | 'dark';

/** Every colour in the app comes from one of these tokens; screens never hardcode a hex value. */
export type Palette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  neutralSoft: string;
  disabledBg: string;
  disabledText: string;
  focusRing: string;
  overlay: string;
  toastSuccess: string;
  toastDanger: string;
  onToast: string;
  codeBg: string;
  codeText: string;
  codePlaceholder: string;
};

const light: Palette = {
  bg: '#F4F7F7',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF1F1',
  border: '#DCE4E4',
  borderStrong: '#7B9092',
  text: '#14282A',
  muted: '#556B6D',
  primary: '#0F766E',
  primaryPressed: '#0B5F58',
  primarySoft: '#E1F1EF',
  onPrimary: '#FFFFFF',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  success: '#067647',
  successSoft: '#E3F5EC',
  warning: '#B54708',
  warningSoft: '#FEF1DE',
  info: '#2A55A8',
  infoSoft: '#E8EEFB',
  neutralSoft: '#ECEFF1',
  disabledBg: '#E6ECEC',
  disabledText: '#7C8D8F',
  focusRing: '#0F766E',
  overlay: 'rgba(15, 30, 32, 0.45)',
  toastSuccess: '#067647',
  toastDanger: '#B42318',
  onToast: '#FFFFFF',
  codeBg: '#10222A',
  codeText: '#E2E8F0',
  codePlaceholder: '#7E919A',
};

const dark: Palette = {
  bg: '#0E1618',
  surface: '#152123',
  surfaceAlt: '#1C2C2F',
  border: '#2A3C3F',
  borderStrong: '#5F7A7D',
  text: '#E6EEEE',
  muted: '#9AB0B2',
  primary: '#3DBBAE',
  primaryPressed: '#5ACDC1',
  primarySoft: '#17383A',
  onPrimary: '#06201D',
  danger: '#F4766B',
  dangerSoft: '#3A1D1B',
  success: '#4CCB8F',
  successSoft: '#15321F',
  warning: '#F2B24A',
  warningSoft: '#3A2C10',
  info: '#8DAEF2',
  infoSoft: '#1B2A47',
  neutralSoft: '#243336',
  disabledBg: '#203033',
  disabledText: '#6B8083',
  focusRing: '#6FD6CB',
  overlay: 'rgba(0, 0, 0, 0.6)',
  toastSuccess: '#0B6B46',
  toastDanger: '#A8281D',
  onToast: '#FFFFFF',
  codeBg: '#0A1215',
  codeText: '#DCE6EA',
  codePlaceholder: '#6F848C',
};

export const palettes: Record<ThemeMode, Palette> = { light, dark };

export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Shared scales so spacing, corners and type stay consistent across screens. */
export const radius = 10;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const fontSize = { caption: 12, small: 13, body: 15, lead: 16, title: 22, display: 28 } as const;

const STORAGE_KEY = 'pharmacare.theme';

function isMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

/** Saved choice first; otherwise the device setting; otherwise light. */
function initialExplicitMode(): ThemeMode | null {
  const saved = readPreference(STORAGE_KEY);
  return isMode(saved) ? saved : null;
}

type ThemeValue = { mode: ThemeMode; colors: Palette; setMode: (mode: ThemeMode) => void; toggle: () => void };

const ThemeContext = createContext<ThemeValue>({ mode: 'light', colors: light, setMode: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // Read synchronously so the first frame is already in the right theme.
  const [explicit, setExplicit] = useState<ThemeMode | null>(initialExplicitMode);
  const mode: ThemeMode = explicit ?? (system === 'dark' ? 'dark' : 'light');

  const setMode = useCallback((next: ThemeMode) => {
    setExplicit(next);
    writePreference(STORAGE_KEY, next);
  }, []);
  const toggle = useCallback(() => setMode(mode === 'dark' ? 'light' : 'dark'), [mode, setMode]);

  useEffect(() => {
    // On web the page background and native controls (scrollbars, autofill) follow the theme too.
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.backgroundColor = palettes[mode].bg;
    root.style.colorScheme = mode;
    root.dataset.theme = mode;
  }, [mode]);

  const value = useMemo(() => ({ mode, colors: palettes[mode], setMode, toggle }), [mode, setMode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

type Styles = Parameters<typeof StyleSheet.create>[0];

/**
 * Theme-aware replacement for `StyleSheet.create`: `const useStyles = makeStyles((colors) => ({ ... }))`,
 * then `const styles = useStyles()` inside the component. Styles are rebuilt only when the theme changes.
 */
export function makeStyles<S extends Styles>(factory: (colors: Palette) => S & Styles) {
  return function useStyles(): Readonly<S> {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

