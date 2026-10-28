import { Pressable, Text, View } from 'react-native';

import { LANGUAGES, useI18n, type Language } from '../i18n';
import { makeStyles, useTheme, type ThemeMode } from '../theme';
import { focusRing, Icon, IconButton, type IconName, type PressState } from './ui';

// Language names are always written in their own language, so a user who cannot read the
// current interface language can still find theirs.
const NATIVE_NAMES: Record<Language, { short: string; full: string }> = {
  mn: { short: 'МН', full: 'Монгол' },
  en: { short: 'EN', full: 'English' },
};

export function LanguageSwitch({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const { language, setLanguage, t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language.label')} style={styles.group}>
      {LANGUAGES.map((code) => {
        const active = code === language;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityLabel={NATIVE_NAMES[code].full}
            accessibilityState={{ checked: active }}
            onPress={() => setLanguage(code)}
            style={(state: PressState) => [
              styles.option,
              variant === 'full' && styles.optionFull,
              active && styles.optionActive,
              state.hovered && !active && { backgroundColor: colors.surface },
              focusRing(colors, state),
            ]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{NATIVE_NAMES[code][variant === 'full' ? 'full' : 'short']}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <IconButton
      icon={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
      label={mode === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
      onPress={toggle}
    />
  );
}

const THEME_OPTIONS: { mode: ThemeMode; icon: IconName; label: 'theme.light' | 'theme.dark' }[] = [
  { mode: 'light', icon: 'sunny-outline', label: 'theme.light' },
  { mode: 'dark', icon: 'moon-outline', label: 'theme.dark' },
];

/** Labelled light/dark choice for the settings page (the header uses the compact ThemeToggle). */
export function ThemeSwitch() {
  const { mode, setMode, colors } = useTheme();
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('theme.label')} style={styles.group}>
      {THEME_OPTIONS.map((option) => {
        const active = option.mode === mode;
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="radio"
            accessibilityLabel={t(option.label)}
            accessibilityState={{ checked: active }}
            onPress={() => setMode(option.mode)}
            style={(state: PressState) => [
              styles.option,
              styles.optionFull,
              styles.optionWithIcon,
              active && styles.optionActive,
              state.hovered && !active && { backgroundColor: colors.surface },
              focusRing(colors, state),
            ]}
          >
            <Icon name={option.icon} size={16} color={active ? colors.onPrimary : colors.muted} />
            <Text style={[styles.text, active && styles.textActive]}>{t(option.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  group: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 999, padding: 3, gap: 2 },
  option: { minWidth: 40, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  optionFull: { minWidth: 88, minHeight: 40, paddingHorizontal: 16 },
  optionWithIcon: { flexDirection: 'row', gap: 6 },
  optionActive: { backgroundColor: colors.primary },
  text: { fontSize: 13, fontWeight: '600', color: colors.muted },
  textActive: { color: colors.onPrimary },
}));
