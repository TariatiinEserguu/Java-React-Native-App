import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Text } from './Text';
import { LANGUAGES, useI18n, type Language } from '../i18n';
import { makeStyles, useTheme, type ThemeMode } from '../theme';
import { spring, springTo, useAnimatedNumber, useIndicator, useReducedMotion } from './motion';
import { focusRing, Icon, IconButton, type IconName, type PressState } from './ui';

// Language names are always written in their own language, so a user who cannot read the
// current interface language can still find theirs.
const NATIVE_NAMES: Record<Language, { short: string; full: string }> = {
  mn: { short: 'МН', full: 'Монгол' },
  en: { short: 'EN', full: 'English' },
};

/** Pill-shaped radio group whose highlight slides to the chosen option. */
function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  wide,
}: {
  label: string;
  options: { value: T; label: string; a11yLabel: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
  wide?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const active = Math.max(0, options.findIndex((o) => o.value === value));
  const { offset, target, onItemLayout } = useIndicator(active);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {target ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { top: target.y, width: target.width, height: target.height, transform: [{ translateX: offset }] }]}
        />
      ) : null}
      {options.map((option, i) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.a11yLabel}
            accessibilityState={{ checked: isActive }}
            aria-checked={isActive}
            onPress={() => onChange(option.value)}
            onLayout={onItemLayout(i)}
            style={(state: PressState) => [
              styles.option,
              wide && styles.optionFull,
              option.icon && styles.optionWithIcon,
              isActive && !target && styles.optionActive,
              state.hovered && !isActive && { backgroundColor: colors.surface },
              focusRing(colors, state),
            ]}
          >
            {option.icon ? <Icon name={option.icon} size={16} color={isActive ? colors.onPrimary : colors.muted} /> : null}
            <Text style={[styles.text, isActive && styles.textActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LanguageSwitch({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <PillGroup
      label={t('language.label')}
      value={language}
      onChange={setLanguage}
      wide={variant === 'full'}
      options={LANGUAGES.map((code) => ({ value: code, label: NATIVE_NAMES[code][variant === 'full' ? 'full' : 'short'], a11yLabel: NATIVE_NAMES[code].full }))}
    />
  );
}

/** Sun/moon button in the app bar. The icon turns and pops when the theme flips. */
export function ThemeToggle() {
  const { mode, toggle, colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const turn = useAnimatedNumber(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    turn.setValue(0);
    const animation = springTo(turn, 1, spring.pop);
    animation.start();
    return () => animation.stop();
  }, [mode, reduce, turn]);
  const icon: IconName = mode === 'dark' ? 'sunny-outline' : 'moon-outline';
  return (
    <IconButton icon={icon} label={mode === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')} onPress={toggle}>
      <Animated.View
        style={{
          opacity: turn.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [
            { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['-120deg', '0deg'] }) },
            { scale: turn.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
          ],
        }}
      >
        <Icon name={icon} size={20} color={colors.text} />
      </Animated.View>
    </IconButton>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; icon: IconName; label: 'theme.light' | 'theme.dark' }[] = [
  { mode: 'light', icon: 'sunny-outline', label: 'theme.light' },
  { mode: 'dark', icon: 'moon-outline', label: 'theme.dark' },
];

/** Labelled light/dark choice for the settings page (the header uses the compact ThemeToggle). */
export function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();
  return (
    <PillGroup
      label={t('theme.label')}
      value={mode}
      onChange={setMode}
      wide
      options={THEME_OPTIONS.map((o) => ({ value: o.mode, label: t(o.label), a11yLabel: t(o.label), icon: o.icon }))}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  group: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 999, padding: 3, gap: 2 },
  thumb: { position: 'absolute', left: 0, borderRadius: 999, backgroundColor: colors.primary },
  option: { minWidth: 40, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  optionFull: { minWidth: 88, minHeight: 40, paddingHorizontal: 16 },
  optionWithIcon: { flexDirection: 'row', gap: 6 },
  optionActive: { backgroundColor: colors.primary },
  text: { fontSize: 13, fontWeight: '600', color: colors.muted },
  textActive: { color: colors.onPrimary },
}));
