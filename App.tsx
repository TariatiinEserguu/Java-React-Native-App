import Ionicons from '@expo/vector-icons/Ionicons';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageSwitch, ThemeToggle } from './src/components/PreferenceControls';
import { ToastProvider } from './src/components/feedback';
import { duration, timing, useAnimatedNumber, useIndicator, usePop, useReducedMotion } from './src/components/motion';
import { focusRing, Icon, PressableScale, type IconName, type PressState } from './src/components/ui';
import { DataProvider, ScreenActivity } from './src/db/DataContext';
import { initDatabase } from './src/db/open';
import { DATABASE_NAME } from './src/db/schema';
import { I18nProvider, useI18n, type TranslationKey } from './src/i18n';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MedicinesScreen } from './src/screens/MedicinesScreen';
import { MoreScreen } from './src/screens/more/MoreScreen';
import { SellScreen } from './src/screens/SellScreen';
import { roleLabel } from './src/services/permissions';
import { SessionProvider, useSession } from './src/session';
import { makeStyles, ThemeProvider, transition, useTheme } from './src/theme';

type TabScreen = ComponentType<{ onNavigate: (tab: string) => void }>;

const TABS: { key: string; label: TranslationKey; icon: IconName; iconActive: IconName; Screen: TabScreen }[] = [
  { key: 'dashboard', label: 'nav.dashboard', icon: 'speedometer-outline', iconActive: 'speedometer', Screen: DashboardScreen },
  { key: 'medicines', label: 'nav.medicines', icon: 'medkit-outline', iconActive: 'medkit', Screen: MedicinesScreen },
  { key: 'sell', label: 'nav.sell', icon: 'cart-outline', iconActive: 'cart', Screen: SellScreen },
  { key: 'inventory', label: 'nav.inventory', icon: 'cube-outline', iconActive: 'cube', Screen: InventoryScreen },
  { key: 'more', label: 'nav.more', icon: 'ellipsis-horizontal-circle-outline', iconActive: 'ellipsis-horizontal-circle', Screen: MoreScreen },
];

/** Side navigation instead of a bottom bar once there is room for it (tablet landscape, desktop web). */
const WIDE_BREAKPOINT = 900;

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <SafeAreaProvider>
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} onError={(e) => console.error('Database failed to open', e)}>
            <DataProvider>
              <ToastProvider>
                <SessionProvider>
                  <FontGate>
                    <Root />
                  </FontGate>
                </SessionProvider>
              </ToastProvider>
            </DataProvider>
          </SQLiteProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

/** Holds the screen back for a moment until the icon font is ready, so icons never pop in as blanks. */
function FontGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Ionicons.loadFont().then(
      () => setReady(true),
      () => setReady(true)
    );
  }, []);
  return ready ? <>{children}</> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />;
}

function Root() {
  const insets = useSafeAreaInsets();
  const { mode } = useTheme();
  const styles = useStyles();
  const { user } = useSession();
  const statusBar = <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />;
  if (!user) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {statusBar}
        <LoginScreen />
      </View>
    );
  }
  // Keyed by user so a new login starts with fresh screens (no cart or form left from the last user).
  return (
    <>
      {statusBar}
      <Shell key={user.user_id} />
    </>
  );
}

function Shell() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const { user, touch } = useSession();
  const styles = useStyles();
  const wide = width >= WIDE_BREAKPOINT;
  const [active, setActive] = useState(TABS[0].key);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} onTouchStart={touch} onPointerDown={touch}>
      {wide ? null : (
        <View style={styles.appBar}>
          <Brand />
          <View style={{ flex: 1 }} />
          {user && width >= 480 ? <Text style={styles.appBadge}>{roleLabel(user.role)}</Text> : null}
          <LanguageSwitch />
          <ThemeToggle />
        </View>
      )}

      <View style={styles.body}>
        {wide ? <NavRail active={active} onSelect={setActive} /> : null}

        {/* Screens stay mounted (hidden when inactive) so search text and the cart persist across tabs. */}
        <View style={{ flex: 1 }}>
          {TABS.map(({ key, Screen }) => (
            <TabPane key={key} active={key === active}>
              <ScreenActivity active={key === active}>
                <Screen onNavigate={setActive} />
              </ScreenActivity>
            </TabPane>
          ))}
        </View>
      </View>

      {wide ? null : <BottomTabs active={active} onSelect={setActive} bottomInset={insets.bottom} />}
    </View>
  );
}

/** A tab's screen. Coming into view it fades in and settles up from a few pixels below. */
function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  const styles = useStyles();
  const reduce = useReducedMotion();
  const shown = useAnimatedNumber(active ? 0 : 1);
  useEffect(() => {
    if (!active) return;
    shown.setValue(0);
    const animation = timing(shown, 1, reduce ? { duration: duration.fast } : {});
    animation.start();
    return () => animation.stop();
  }, [active, reduce, shown]);
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        !active && styles.hidden,
        { opacity: shown, transform: reduce ? [] : [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const PILL_WIDTH = 56;

/** Phone tab bar. A soft pill slides behind the icon of the selected tab. */
function BottomTabs({ active, onSelect, bottomInset }: { active: string; onSelect: (key: string) => void; bottomInset: number }) {
  const { t } = useI18n();
  const styles = useStyles();
  const index = TABS.findIndex((tab) => tab.key === active);
  const { offset, target, onItemLayout } = useIndicator(index);
  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('nav.main')} style={[styles.tabBar, { paddingBottom: Math.max(bottomInset, 6) }]}>
      {target ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.tabPill, { top: target.y + 1, left: (target.width - PILL_WIDTH) / 2, transform: [{ translateX: offset }] }]}
        />
      ) : null}
      {TABS.map((tab, i) => (
        <TabButton key={tab.key} tab={tab} focused={tab.key === active} onPress={() => onSelect(tab.key)} layout="bottom" onLayout={onItemLayout(i)} />
      ))}
    </View>
  );
}

function Brand() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.brand} accessibilityRole="header">
      <View style={styles.brandMark}>
        <Icon name="medical" size={15} color={colors.onPrimary} />
      </View>
      <Text style={styles.brandText}>PharmaCare</Text>
    </View>
  );
}

function NavRail({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  const { t } = useI18n();
  const { user } = useSession();
  const styles = useStyles();
  const index = TABS.findIndex((tab) => tab.key === active);
  const { offset, target, onItemLayout } = useIndicator(index, 'y');
  return (
    <View style={styles.rail}>
      <View style={styles.railBrand}>
        <Brand />
      </View>
      <View accessibilityRole="tablist" accessibilityLabel={t('nav.main')} style={{ gap: 2, flex: 1 }}>
        {/* The highlight glides to the selected item. */}
        {target ? <Animated.View pointerEvents="none" style={[styles.railPill, { height: target.height, transform: [{ translateY: offset }] }]} /> : null}
        {TABS.map((tab, i) => (
          <TabButton key={tab.key} tab={tab} focused={tab.key === active} onPress={() => onSelect(tab.key)} layout="rail" onLayout={onItemLayout(i)} />
        ))}
      </View>
      <View style={styles.railFooter}>
        {user ? (
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.full_name.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.userName}>
                {user.full_name}
              </Text>
              <Text numberOfLines={1} style={styles.userRole}>
                {roleLabel(user.role)}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.railPrefs}>
          <LanguageSwitch />
          <ThemeToggle />
        </View>
      </View>
    </View>
  );
}

function TabButton({
  tab,
  focused,
  onPress,
  layout,
  onLayout,
}: {
  tab: (typeof TABS)[number];
  focused: boolean;
  onPress: () => void;
  layout: 'bottom' | 'rail';
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const rail = layout === 'rail';
  const color = rail ? (focused ? colors.text : colors.muted) : focused ? colors.primary : colors.muted;
  // The icon of the newly selected tab gives a small pop.
  const pop = usePop(focused);
  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={t(tab.label)}
      onPress={onPress}
      onLayout={onLayout}
      pressScale={rail ? 0.98 : 0.92}
      style={(state: PressState) => [
        rail ? styles.railItem : styles.tab,
        rail && state.hovered && !focused && { backgroundColor: colors.surfaceAlt + '99' },
        focusRing(colors, state),
      ]}
    >
      <Animated.View style={focused ? pop : null}>
        <Icon name={focused ? tab.iconActive : tab.icon} size={rail ? 20 : 22} color={color} />
      </Animated.View>
      <Text numberOfLines={1} style={[rail ? styles.railLabel : styles.tabLabel, { color }, focused && { fontWeight: '600' }]}>
        {t(tab.label)}
      </Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, flexDirection: 'row' },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 52,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 26, height: 26, borderRadius: 7, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  appBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, minHeight: 48, borderRadius: 8 },
  tabPill: { position: 'absolute', width: PILL_WIDTH, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 11, fontWeight: '500', maxWidth: '100%', paddingHorizontal: 2 },
  rail: { width: 232, padding: 12, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  railBrand: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 18 },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 38, borderRadius: 8, ...transition },
  railPill: { position: 'absolute', top: 0, left: 0, right: 0, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  railLabel: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  railFooter: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  userName: { fontSize: 13, fontWeight: '600', color: colors.text },
  userRole: { fontSize: 12, color: colors.muted },
  railPrefs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
}));
