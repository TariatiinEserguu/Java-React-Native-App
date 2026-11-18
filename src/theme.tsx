import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

import { readPreference, writePreference } from './preferences';

export type ThemeMode = 'light' | 'dark';

/**
 * Every colour in the app comes from one of these tokens; screens never hardcode a hex value.
 *
 * The palette is a pharmacy counter's: the green of the pharmacy cross for the brand and the main
 * action, a cool clinical grey-white ground, and colour for status only where something needs
 * attention (amber: low or expiring soon, red: out or expired). Prescription-only medicines carry
 * their own violet, so "Rx" never reads as a warning.
 */
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
  /** Prescription-only marker. */
  rx: string;
  rxSoft: string;
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
  /** Highlight on the code background (full table scans in a query plan). */
  codeWarning: string;
};

const light: Palette = {
  bg: '#F5F7F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF2F3',
  border: '#DFE7E9',
  borderStrong: '#A0B0B3',
  text: '#172C31',
  muted: '#53686D',
  primary: '#126C60',
  primaryPressed: '#0B544A',
  primarySoft: '#E1F3EE',
  onPrimary: '#FFFFFF',
  danger: '#C42B2B',
  dangerSoft: '#FCEBEA',
  success: '#126C60',
  successSoft: '#E1F3EE',
  warning: '#A85006',
  warningSoft: '#FDF0DF',
  info: '#2F5BB7',
  infoSoft: '#E8EEFA',
  rx: '#6A3FB5',
  rxSoft: '#F0EAFA',
  neutralSoft: '#EDF2F3',
  disabledBg: '#E9EEF0',
  disabledText: '#687B80',
  focusRing: '#126C60',
  overlay: 'rgba(16, 26, 21, 0.45)',
  toastSuccess: '#1B2420',
  toastDanger: '#1B2420',
  onToast: '#FFFFFF',
  codeBg: '#17201C',
  codeText: '#E3E9E6',
  codePlaceholder: '#7F8B85',
  codeWarning: '#FBBF24',
};

const dark: Palette = {
  bg: '#101A1D',
  surface: '#172327',
  surfaceAlt: '#203135',
  border: '#2A3A3E',
  borderStrong: '#50666B',
  text: '#ECF4F4',
  muted: '#A3B6B8',
  primary: '#6CD4BE',
  primaryPressed: '#92E4D3',
  primarySoft: '#193B37',
  onPrimary: '#102D29',
  danger: '#F47C7C',
  dangerSoft: '#341A1A',
  success: '#6CD4BE',
  successSoft: '#193B37',
  warning: '#F2B54C',
  warningSoft: '#33260F',
  info: '#93AEF2',
  infoSoft: '#18223A',
  rx: '#BDA4F5',
  rxSoft: '#251C3A',
  neutralSoft: '#203135',
  disabledBg: '#203135',
  disabledText: '#91A4A8',
  focusRing: '#92E4D3',
  overlay: 'rgba(0, 0, 0, 0.62)',
  toastSuccess: '#E8EEEB',
  toastDanger: '#E8EEEB',
  onToast: '#0E1512',
  codeBg: '#09100D',
  codeText: '#E3E9E6',
  codePlaceholder: '#74817B',
  codeWarning: '#FBBF24',
};

export const palettes: Record<ThemeMode, Palette> = { light, dark };

export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * IBM Plex Sans in four weights. Chosen for the counter: I, l and 1 and 0 and O are unmistakable
 * (drug names and lot numbers), it covers Mongolian Cyrillic (Ө, Ү) and the tögrög sign, and its
 * figures are tabular, so prices line up. Loaded in App.tsx before the first screen.
 */
export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

/** The font file for a weight (custom fonts select weight by family name, not fontWeight). */
export function fontForWeight(weight: string | number | undefined) {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight === undefined ? 400 : Number(weight);
  if (w >= 700) return fonts.bold;
  if (w >= 600) return fonts.semibold;
  if (w >= 500) return fonts.medium;
  return fonts.regular;
}

/** Shared scales so spacing, corners and type stay consistent across screens. */
/** Buttons, inputs, chips' inner corners. */
export const radius = 10;
/** Grouped lists, panels, sheets and dialogs. */
export const radiusLg = 16;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const fontSize = { caption: 12, small: 13, body: 15, lead: 17, title: 24, display: 30 } as const;

/**
 * Web-only CSS transition so hover/focus colour changes ease instead of snapping. Ignored on native.
 * Opacity and transform are left out: those are driven frame by frame by the motion system
 * (src/components/motion.tsx), and a CSS transition on top would make them lag.
 */
export const transition: object =
  Platform.OS === 'web' ? { transitionProperty: 'background-color, border-color, color, box-shadow', transitionDuration: '140ms', transitionTimingFunction: 'ease-out' } : {};

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

