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
  bg: '#F8F8F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F1F3',
  border: '#E6E6EA',
  borderStrong: '#A3A5AF',
  text: '#0E0F13',
  muted: '#5E6069',
  primary: '#0F766E',
  primaryPressed: '#0B5F58',
  primarySoft: '#E3F3F0',
  onPrimary: '#FFFFFF',
  danger: '#B42318',
  dangerSoft: '#FDEDEB',
  success: '#067647',
  successSoft: '#E4F5EC',
  warning: '#B54708',
  warningSoft: '#FEF2E0',
  info: '#3451B2',
  infoSoft: '#EAEEFB',
  neutralSoft: '#EEEEF1',
  disabledBg: '#EDEDF0',
  disabledText: '#80828C',
  focusRing: '#0F766E',
  overlay: 'rgba(10, 11, 15, 0.48)',
  toastSuccess: '#0E0F13',
  toastDanger: '#0E0F13',
  onToast: '#FFFFFF',
  codeBg: '#0E0F13',
  codeText: '#E4E4E7',
  codePlaceholder: '#7D7F89',
};

const dark: Palette = {
  bg: '#09090B',
  surface: '#111114',
  surfaceAlt: '#1A1A1E',
  border: '#232328',
  borderStrong: '#4A4A53',
  text: '#F4F4F5',
  muted: '#A0A0AB',
  primary: '#2DD4BF',
  primaryPressed: '#5EEAD4',
  primarySoft: '#10292A',
  onPrimary: '#04201C',
  danger: '#F87171',
  dangerSoft: '#2B1618',
  success: '#4ADE80',
  successSoft: '#0F2A1B',
  warning: '#FBBF24',
  warningSoft: '#2B200B',
  info: '#93A8F5',
  infoSoft: '#141C34',
  neutralSoft: '#202026',
  disabledBg: '#1A1A1E',
  disabledText: '#6B6B75',
  focusRing: '#5EEAD4',
  overlay: 'rgba(0, 0, 0, 0.66)',
  toastSuccess: '#F4F4F5',
  toastDanger: '#F4F4F5',
  onToast: '#09090B',
  codeBg: '#060608',
  codeText: '#E4E4E7',
  codePlaceholder: '#71717A',
};

export const palettes: Record<ThemeMode, Palette> = { light, dark };

export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Shared scales so spacing, corners and type stay consistent across screens. */
export const radius = 8;
/** Cards, sheets and dialogs. */
export const radiusLg = 12;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const fontSize = { caption: 12, small: 13, body: 14, lead: 16, title: 22, display: 28 } as const;

/** Web-only CSS transition so hover/focus changes ease instead of snapping. Ignored on native. */
export const transition: object =
  Platform.OS === 'web' ? { transitionProperty: 'background-color, border-color, color, opacity, transform, box-shadow', transitionDuration: '120ms', transitionTimingFunction: 'ease-out' } : {};

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

