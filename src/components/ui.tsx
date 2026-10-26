import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radius } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = buttonPalette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const buttonPalette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, error ? styles.inputError : null, input.style]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.input, styles.search]}
    />
  );
}

const badgeTones = {
  neutral: { bg: '#EEF0F4', fg: colors.muted },
  info: { bg: colors.infoSoft, fg: colors.info },
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const t = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
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
  return (
    <View style={styles.segment}>
      {options.map(([key, label]) => (
        <Pressable
          key={key}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          style={[styles.segmentItem, value === key && styles.segmentActive]}
        >
          <Text numberOfLines={1} style={[styles.segmentText, value === key && styles.segmentTextActive]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stat({ label, value, note, tone, onPress }: { label: string; value: string; note?: string; tone?: BadgeTone; onPress?: () => void }) {
  const color = tone ? badgeTones[tone].fg : colors.text;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.card, styles.stat, pressed && styles.pressed]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
    </Pressable>
  );
}

export function ToggleField({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={[styles.field, styles.toggleRow]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

/** Tappable list item card. */
export function ListItem({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, styles.listItem, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.kvStrong]}>{value}</Text>
    </View>
  );
}

/** Content container for every tab's top-level ScrollView. */
export const screen = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 960, alignSelf: 'center' },
});

export const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  buttonSmall: { paddingHorizontal: 10, paddingVertical: 6, minHeight: 32 },
  buttonText: { fontWeight: '600', fontSize: 15 },
  buttonTextSmall: { fontSize: 13 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius + 2,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 4 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  search: { marginBottom: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 24 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: radius, padding: 12, marginBottom: 12 },
  errorBannerText: { color: colors.danger },
  segment: { flexDirection: 'row', backgroundColor: '#E3E9E9', borderRadius: 10, padding: 3, marginBottom: 12 },
  segmentItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontWeight: '600', fontSize: 13, color: colors.muted },
  segmentTextActive: { color: colors.text },
  stat: { flexGrow: 1, flexBasis: 150 },
  statLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginVertical: 4, fontVariant: ['tabular-nums'] },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listItem: { paddingVertical: 12, marginBottom: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  kvLabel: { color: colors.muted, fontSize: 14 },
  kvValue: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  kvStrong: { fontWeight: '700', fontSize: 16 },
});
