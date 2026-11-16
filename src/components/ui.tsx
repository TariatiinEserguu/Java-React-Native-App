import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Switch,
  TextInput,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { useI18n } from '../i18n';
import { fonts, fontSize, makeStyles, radius, radiusLg, space, transition, useTheme, type Palette } from '../theme';
import { nativeDriver, spring, springTo, useAnimatedNumber, useCountUp, useEnterStyle, useIndicator, useReducedMotion } from './motion';

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

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer', ...transition } as ViewStyle) : null;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type AnimatedStyle = Record<string, unknown> | null | undefined;

/**
 * Pressable that dips slightly when pressed and springs back on release. Hover, focus and press
 * state are tracked here (Animated can't take a style function) and handed to `style`/`children`.
 * `enter` is an optional entrance style from useEnterStyle; its transform is combined with the scale.
 */
export function PressableScale({
  style,
  children,
  pressScale = 0.97,
  enter,
  disabled,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressState) => ReactNode);
  pressScale?: number;
  enter?: AnimatedStyle;
}) {
  const reduce = useReducedMotion();
  const scale = useAnimatedNumber(1);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const state: PressState = { pressed, hovered, focused };
  const animate = !reduce && !disabled && pressScale !== 1;

  const enterTransform = (enter?.transform as object[] | undefined) ?? [];
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        if (animate) springTo(scale, pressScale, spring.press).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (animate) springTo(scale, 1, spring.press).start();
        else scale.setValue(1);
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        setHovered(true);
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        setHovered(false);
        onHoverOut?.(e);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[typeof style === 'function' ? style(state) : style, enter ? { opacity: enter.opacity as number } : null, { transform: [...enterTransform, { scale }] }]}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}

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
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      accessibilityLabel={title}
      onPress={onPress}
      disabled={inactive}
      pressScale={small ? 0.95 : 0.97}
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
    </PressableScale>
  );
}

const buttonPalette = (c: Palette): Record<ButtonVariant, { bg: string; hover: string; pressed: string; fg: string; border: string }> => ({
  primary: { bg: c.primary, hover: c.primaryPressed, pressed: c.primaryPressed, fg: c.onPrimary, border: c.primary },
  secondary: { bg: c.surface, hover: c.surfaceAlt, pressed: c.surfaceAlt, fg: c.text, border: c.border },
  danger: { bg: c.dangerSoft, hover: c.dangerSoft, pressed: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
  ghost: { bg: 'transparent', hover: c.surfaceAlt, pressed: c.surfaceAlt, fg: c.text, border: 'transparent' },
});

/**
 * Compact icon-only control (theme toggle, close). The label is required for screen readers and
 * tooltips. `children` replaces the icon (e.g. an animated one).
 */
export function IconButton({ icon, label, onPress, active, children }: { icon: IconName; label: string; onPress: () => void; active?: boolean; children?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      // @ts-expect-error `title` is a web-only tooltip prop that react-native-web forwards to the DOM.
      title={label}
      onPress={onPress}
      hitSlop={6}
      pressScale={0.88}
      style={(state: PressState) => [
        styles.iconButton,
        (state.hovered || state.pressed || active) && { backgroundColor: colors.surfaceAlt },
        webPointer,
        focusRing(colors, state),
      ]}
    >
      {children ?? <Icon name={icon} size={20} color={colors.text} />}
    </PressableScale>
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
          focused && styles.inputFocused,
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
    <View style={[styles.searchWrap, focused && styles.inputFocused]}>
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
  rx: { bg: c.rxSoft, fg: c.rx },
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
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      pressScale={0.94}
      style={(state: PressState) => [
        styles.chip,
        state.hovered && !active && { backgroundColor: colors.surfaceAlt },
        active && styles.chipActive,
        webPointer,
        focusRing(colors, state),
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

export function EmptyState({ text, hint, icon = 'file-tray-outline' }: { text: string; hint?: string; icon?: IconName }) {
  const styles = useStyles();
  const enter = useEnterStyle({ offset: 6 });
  return (
    <Animated.View style={[styles.empty, enter]}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={22} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </Animated.View>
  );
}

/** Pulsing placeholder block; the pulse is skipped when the OS asks for reduced motion. */
export function Skeleton({ width = '100%', height = 14, style }: { width?: ViewStyle['width']; height?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: nativeDriver }),
        Animated.timing(pulse, { toValue: 0.55, duration: 800, useNativeDriver: nativeDriver }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  return <Animated.View style={[{ width, height, borderRadius: 6, backgroundColor: colors.surfaceAlt, opacity: reduce ? 0.8 : pulse }, style]} />;
}

/** Skeleton rows while data loads; announces itself as busy to screen readers. */
export function LoadingState({ text, rows = 4 }: { text?: string; rows?: number }) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={text ?? t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.loadingRow}>
          <Skeleton width={`${70 - (i % 3) * 12}%`} height={14} />
          <Skeleton width={`${40 - (i % 2) * 10}%`} height={11} />
        </View>
      ))}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const enter = useEnterStyle({ offset: -6 });
  return (
    <Animated.View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.errorBanner, enter]}>
      <Icon name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.errorBannerText}>{message}</Text>
    </Animated.View>
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
  const active = Math.max(0, options.findIndex(([key]) => key === value));
  const { offset, target, onItemLayout } = useIndicator(active);
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {/* The thumb slides between segments; until they are measured the active one draws its own background. */}
      {target ? <Animated.View pointerEvents="none" style={[styles.segmentThumb, { top: target.y, width: target.width, height: target.height, transform: [{ translateX: offset }] }]} /> : null}
      {options.map(([key, label], i) => (
        <Pressable
          key={key}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          onLayout={onItemLayout(i)}
          style={(state: PressState) => [styles.segmentItem, value === key && !target && styles.segmentActive, webPointer, focusRing(colors, state)]}
        >
          <Text numberOfLines={2} style={[styles.segmentText, value === key && styles.segmentTextActive]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Animated figure: counts from its previous value to `value`, formatted on every frame. */
export function CountUp({ value, format = String, style }: { value: number; format?: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const shown = useCountUp(value);
  // Screen readers get the final figure, not the frames in between.
  return (
    <Text style={style} accessibilityLabel={format(value)}>
      {format(shown)}
    </Text>
  );
}

export function Stat({
  label,
  value,
  count,
  format,
  note,
  tone,
  icon,
  onPress,
  index,
}: {
  label: string;
  /** Static text, or pass `count` (+ `format`) to have the number count up. */
  value?: string;
  count?: number;
  format?: (n: number) => string;
  note?: string;
  tone?: BadgeTone;
  icon?: IconName;
  onPress?: () => void;
  /** Position in a group of stats, for a staggered entrance. */
  index?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const enter = useEnterStyle({ index: index ?? 0, offset: 12 });
  const valueStyle = [styles.statValue, { color: toneColor(colors, tone) }];
  const content = (
    <>
      <View style={styles.statHead}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <Icon name={icon} size={16} color={tone ? toneColor(colors, tone) : colors.muted} /> : null}
      </View>
      {count !== undefined ? <CountUp value={count} format={format} style={valueStyle} /> : <Text style={valueStyle}>{value}</Text>}
      {note ? <Text style={styles.hint}>{note}</Text> : null}
    </>
  );
  if (!onPress) return <Animated.View style={[styles.card, styles.stat, enter]}>{content}</Animated.View>;
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      enter={enter}
      style={(state: PressState) => [
        styles.card,
        styles.stat,
        state.hovered && { borderColor: colors.borderStrong },
        state.pressed && { backgroundColor: colors.surfaceAlt },
        webPointer,
        focusRing(colors, state),
      ]}
    >
      {content}
    </PressableScale>
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

const InGroup = createContext(false);

/**
 * A grouped list: one panel, rows separated by hairlines, the way stock and catalogue lists read in
 * pharmacy systems. ListItems inside it render as rows instead of separate cards.
 */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View style={[styles.group, style]}>
      <InGroup.Provider value>{children}</InGroup.Provider>
    </View>
  );
}

/**
 * Tappable list row (inside a ListGroup) or card (on its own). Pass `index` to fade the rows of a
 * list in one after another; it also tells rows after the first to draw their divider.
 */
export function ListItem({ children, onPress, style, index }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; index?: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const grouped = useContext(InGroup);
  const enter = useEnterStyle({ index, enabled: index !== undefined, offset: grouped ? 4 : 10 });
  const base = [grouped ? styles.row : [styles.card, styles.listItem], grouped && (index ?? 0) > 0 && styles.rowDivider];
  // A row without an action is plain content. (A disabled pressable would mark everything inside it,
  // buttons included, as unavailable to screen readers.)
  if (!onPress) return <Animated.View style={[base, style, enter]}>{children}</Animated.View>;
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      pressScale={grouped ? 1 : 0.985}
      enter={enter}
      style={(state: PressState) => [
        base,
        state.hovered && { backgroundColor: colors.surfaceAlt },
        !grouped && state.hovered && { borderColor: colors.borderStrong },
        state.pressed && { backgroundColor: colors.surfaceAlt },
        webPointer,
        focusRing(colors, state),
        style,
      ]}
    >
      {children}
    </PressableScale>
  );
}

/**
 * Sellable stock against the reorder level. Only a shortage is coloured: a full bar of plain grey
 * means "fine", amber means at or below the minimum, an empty red track means out of stock.
 */
export function StockMeter({ stock, min, state }: { stock: number; min: number; state: 'OK' | 'LOW' | 'OUT' }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const full = Math.max(min * 3, 1);
  const ratio = Math.max(0, Math.min(1, stock / full));
  const color = state === 'OUT' ? colors.danger : state === 'LOW' ? colors.warning : colors.borderStrong;
  return (
    <View style={[styles.meter, state === 'OUT' && { backgroundColor: colors.dangerSoft }]} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ width: `${Math.max(ratio * 100, state === 'OUT' ? 0 : 6)}%`, height: '100%', borderRadius: 2, backgroundColor: color }} />
    </View>
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
    paddingVertical: 9,
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
  iconButton: { width: 36, height: 36, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.lg },
  title: { fontSize: fontSize.title, fontWeight: '600', color: colors.text, letterSpacing: -0.3, lineHeight: 30 },
  subtitle: { fontSize: fontSize.small, color: colors.muted, marginTop: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: space.sm, minHeight: 28 },
  sectionTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text, flexShrink: 1 },
  field: { marginBottom: space.md },
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.body,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  inputError: { borderColor: colors.danger },
  inputFocused: { borderColor: colors.primary, ...(Platform.OS === 'web' ? ({ boxShadow: `0 0 0 3px ${colors.primarySoft}` } as object) : null) },
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
  searchInput: { flex: 1, fontSize: fontSize.body, fontFamily: fonts.regular, color: colors.text, paddingVertical: 10, minWidth: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start', flexShrink: 1 },
  badgeText: { fontSize: fontSize.caption, fontWeight: '600' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 34,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: fontSize.small, color: colors.text },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: space.lg },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyText: { textAlign: 'center', color: colors.text, fontSize: fontSize.body, fontWeight: '600' },
  emptyHint: { textAlign: 'center', color: colors.muted, fontSize: fontSize.small },
  loading: { gap: 10 },
  loadingRow: { gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radiusLg, padding: 16 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, backgroundColor: colors.dangerSoft, borderRadius: radius, borderWidth: 1, borderColor: colors.danger + '33', padding: space.md, marginBottom: space.md },
  errorBannerText: { color: colors.danger, flex: 1, fontSize: fontSize.small },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius + 2, padding: 3, marginBottom: space.md },
  segmentItem: { flex: 1, paddingVertical: 7, paddingHorizontal: 6, borderRadius: radius, alignItems: 'center', justifyContent: 'center', minHeight: 38 },
  segmentActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segmentThumb: {
    position: 'absolute',
    left: 0,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } as object) : null),
  },
  segmentText: { fontWeight: '600', fontSize: fontSize.small, color: colors.muted, textAlign: 'center' },
  segmentTextActive: { color: colors.text },
  stat: { flexGrow: 1, flexBasis: 160 },
  statHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statLabel: { fontSize: fontSize.small, color: colors.muted, fontWeight: '500', flexShrink: 1 },
  statValue: { fontSize: 24, fontWeight: '600', color: colors.text, marginTop: 8, marginBottom: 2, letterSpacing: -0.4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  listItem: { paddingVertical: space.md, marginBottom: space.sm },
  group: { backgroundColor: colors.surface, borderRadius: radiusLg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { paddingHorizontal: space.lg, paddingVertical: 12, backgroundColor: colors.surface },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  meter: { width: 48, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 4 },
  kvLabel: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  kvValue: { color: colors.text, fontSize: 14, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  kvStrong: { fontWeight: '700', fontSize: fontSize.lead },
}));
