import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '../i18n';
import { fontSize, makeStyles, radius, space, useTheme, type Palette } from '../theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Pressable state on web also reports hover and keyboard focus. */
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

// Pointer clicks also focus elements on web; the ring is only drawn after the user has used the keyboard.
let keyboardNavigation = false;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardNavigation = true;
  }, true);
  window.addEventListener('pointerdown', () => {
    keyboardNavigation = false;
  }, true);
}

/** Visible keyboard focus ring (web) shared by every interactive element. */
export function focusRing(colors: Palette, state: PressState): ViewStyle {
  return state.focused && keyboardNavigation && Platform.OS === 'web'
    ? { outlineWidth: 2, outlineColor: colors.focusRing, outlineStyle: 'solid', outlineOffset: 2 }
    : {};
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  // Icons are decorative; the control or text next to them carries the meaning.
  return <Ionicons name={name} size={size} color={color ?? colors.muted} accessibilityElementsHidden importantForAccessibility="no" aria-hidden />;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const inactive = disabled || loading;
  const palette = buttonPalette(colors)[variant];
  const fg = disabled ? colors.disabledText : palette.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityLabel={title}
      onPress={onPress}
      disabled={inactive}
      style={(state: PressState) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: disabled && variant !== 'ghost' ? colors.disabledBg : state.pressed ? palette.pressed : state.hovered ? palette.hover : palette.bg,
          borderColor: disabled && variant !== 'ghost' ? colors.disabledBg : palette.border,
        },
        !inactive && webPointer,
        focusRing(colors, state),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const buttonPalette = (c: Palette): Record<ButtonVariant, { bg: string; hover: string; pressed: string; fg: string; border: string }> => ({
  primary: { bg: c.primary, hover: c.primaryPressed, pressed: c.primaryPressed, fg: c.onPrimary, border: c.primary },
  secondary: { bg: c.surface, hover: c.surfaceAlt, pressed: c.surfaceAlt, fg: c.text, border: c.borderStrong },
  danger: { bg: c.dangerSoft, hover: c.dangerSoft, pressed: c.dangerSoft, fg: c.danger, border: c.danger },
  ghost: { bg: 'transparent', hover: c.primarySoft, pressed: c.primarySoft, fg: c.primary, border: 'transparent' },
});

/** Compact icon-only control (theme toggle, close). The label is required for screen readers and tooltips. */
export function IconButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // @ts-expect-error `title` is a web-only tooltip prop that react-native-web forwards to the DOM.
      title={label}
      onPress={onPress}
      hitSlop={6}
      style={(state: PressState) => [
        styles.iconButton,
        (state.hovered || state.pressed || active) && { backgroundColor: colors.surfaceAlt },
        webPointer,
        focusRing(colors, state),
      ]}
    >
      <Icon name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionRow}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Field({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && { borderColor: colors.primary, borderWidth: 2, paddingHorizontal: 11, paddingVertical: 9 },
          error ? { borderColor: colors.danger } : null,
          input.editable === false && { backgroundColor: colors.disabledBg, color: colors.disabledText },
          input.style,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.searchWrap, focused && { borderColor: colors.primary }]}>
      <Icon name="search" size={18} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.searchInput}
      />
      {value ? <IconButton icon="close-circle" label={t('common.clearSearch')} onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

const badgeTones = (c: Palette) => ({
  neutral: { bg: c.neutralSoft, fg: c.muted },
  info: { bg: c.infoSoft, fg: c.info },
  primary: { bg: c.primarySoft, fg: c.primary },
  success: { bg: c.successSoft, fg: c.success },
  warning: { bg: c.warningSoft, fg: c.warning },
  danger: { bg: c.dangerSoft, fg: c.danger },
});
export type BadgeTone = keyof ReturnType<typeof badgeTones>;

/** Foreground colour of a tone, for text that sits directly on the page or a card. */
export function toneColor(colors: Palette, tone?: BadgeTone) {
  return tone ? badgeTones(colors)[tone].fg : colors.text;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tones = badgeTones(colors)[tone];
  return (
    <View style={[styles.badge, { backgroundColor: tones.bg }]}>
      <Text style={[styles.badgeText, { color: tones.fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={(state: PressState) => [
        styles.chip,
        state.hovered && !active && { backgroundColor: colors.surfaceAlt },
        active && styles.chipActive,
        webPointer,
        focusRing(colors, state),
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ text, hint, icon = 'file-tray-outline' }: { text: string; hint?: string; icon?: IconName }) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={28} />
      <Text style={styles.emptyText}>{text}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function LoadingState({ text }: { text?: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.empty} accessibilityRole="progressbar" accessibilityLabel={text ?? t('common.loading')}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.emptyHint}>{text ?? t('common.loading')}</Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorBanner}>
      <Icon name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map(([key, label]) => (
        <Pressable
          key={key}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          style={(state: PressState) => [styles.segmentItem, value === key && styles.segmentActive, webPointer, focusRing(colors, state)]}
        >
          <Text numberOfLines={2} style={[styles.segmentText, value === key && styles.segmentTextActive]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stat({ label, value, note, tone, onPress }: { label: string; value: string; note?: string; tone?: BadgeTone; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={(state: PressState) => [
        styles.card,
        styles.stat,
        onPress && state.hovered && { borderColor: colors.borderStrong },
        state.pressed && { backgroundColor: colors.surfaceAlt },
        onPress && webPointer,
        focusRing(colors, state),
      ]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: toneColor(colors, tone) }]}>{value}</Text>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
    </Pressable>
  );
}

export function ToggleField({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.field, styles.toggleRow]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
        thumbColor={Platform.OS === 'android' ? colors.surface : undefined}
        // @ts-expect-error web-only prop of react-native-web's Switch.
        activeThumbColor={colors.surface}
      />
    </View>
  );
}

/** Tappable list item card. */
export function ListItem({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={(state: PressState) => [
        styles.card,
        styles.listItem,
        onPress && state.hovered && { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt },
        state.pressed && { backgroundColor: colors.surfaceAlt },
        onPress && webPointer,
        focusRing(colors, state),
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.kvStrong]}>{value}</Text>
    </View>
  );
}

/** Content container for every tab's top-level ScrollView. */
export const screen = {
  content: { padding: space.lg, paddingBottom: 32, width: '100%', maxWidth: 960, alignSelf: 'center' },
} as const satisfies Record<string, ViewStyle>;

export const useStyles = makeStyles((colors) => ({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonSmall: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 36 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 1 },
  buttonText: { fontWeight: '600', fontSize: fontSize.body, textAlign: 'center', flexShrink: 1 },
  buttonTextSmall: { fontSize: fontSize.small },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius + 2,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.small, color: colors.muted, marginTop: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: space.sm },
  sectionTitle: { fontSize: fontSize.lead, fontWeight: '700', color: colors.text, flexShrink: 1 },
  field: { marginBottom: space.md },
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: fontSize.caption, marginTop: 4 },
  hint: { color: colors.muted, fontSize: fontSize.caption, marginTop: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius,
    paddingLeft: 12,
    paddingRight: 4,
    backgroundColor: colors.surface,
    marginBottom: space.md,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: fontSize.body, color: colors.text, paddingVertical: 10, minWidth: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start', flexShrink: 1 },
  badgeText: { fontSize: fontSize.caption, fontWeight: '600' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.small, color: colors.text },
  chipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: space.lg },
  emptyText: { textAlign: 'center', color: colors.text, fontSize: fontSize.body, fontWeight: '600' },
  emptyHint: { textAlign: 'center', color: colors.muted, fontSize: fontSize.small },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, backgroundColor: colors.dangerSoft, borderRadius: radius, padding: space.md, marginBottom: space.md },
  errorBannerText: { color: colors.danger, flex: 1, fontSize: fontSize.small },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: 3, marginBottom: space.md },
  segmentItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius - 2, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segmentText: { fontWeight: '600', fontSize: fontSize.small, color: colors.muted, textAlign: 'center' },
  segmentTextActive: { color: colors.text },
  stat: { flexGrow: 1, flexBasis: 160 },
  statLabel: { fontSize: fontSize.small, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: fontSize.title, fontWeight: '700', color: colors.text, marginVertical: 4, fontVariant: ['tabular-nums'] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  listItem: { paddingVertical: space.md, marginBottom: space.sm },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 4 },
  kvLabel: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  kvValue: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  kvStrong: { fontWeight: '700', fontSize: fontSize.lead },
}));
