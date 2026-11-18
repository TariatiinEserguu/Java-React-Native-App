import Ionicons from '@expo/vector-icons/Ionicons';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';
import { loadAsync } from 'expo-font';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Component, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './src/components/Text';
import { PharmacyCross } from './src/components/brand';
import { LanguageSwitch, ThemeToggle } from './src/components/PreferenceControls';
import { ToastProvider } from './src/components/feedback';
import { duration, timing, useAnimatedNumber, useIndicator, usePop, useReducedMotion } from './src/components/motion';
import { focusRing, Icon, IconButton, PressableScale, type IconName, type PressState } from './src/components/ui';
import { DataProvider, ScreenActivity } from './src/db/DataContext';
import { activeDatabaseName, initDatabase } from './src/db/open';
import { I18nProvider, useI18n, type TranslationKey } from './src/i18n';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MedicinesScreen } from './src/screens/MedicinesScreen';
import { MoreScreen } from './src/screens/more/MoreScreen';
import type { Intent, Navigate } from './src/screens/navigation';
import { SellScreen } from './src/screens/SellScreen';
import { roleLabel } from './src/services/permissions';
import { SessionProvider, useSession } from './src/session';
import { makeStyles, ThemeProvider, transition, useTheme } from './src/theme';

type TabScreen = ComponentType<{ onNavigate: Navigate; intent?: Intent | null }>;

const TABS: { key: string; label: TranslationKey; icon: IconName; iconActive: IconName; Screen: TabScreen }[] = [
  { key: 'dashboard', label: 'nav.dashboard', icon: 'grid-outline', iconActive: 'grid', Screen: DashboardScreen },
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
          <StartupBoundary>
            <Suspense fallback={<StartupStatus />}>
              <SQLiteProvider databaseName={activeDatabaseName} onInit={initDatabase} useSuspense>
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
            </Suspense>
          </StartupBoundary>
        </SafeAreaProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <StartupStatus failed /> : this.props.children;
  }
}

function StartupStatus({ failed = false }: { failed?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={[styles.root, styles.startup]} accessibilityLiveRegion="polite">
      <Brand />
      {failed ? <Text style={styles.startupError}>{t('startup.error')}</Text> : <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />}
    </View>
  );
}

/** Holds the screen back for a moment until the icon font and the typeface are ready, so nothing pops in. */
function FontGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Only the four weights the app uses are bundled (imported per weight, not the whole family).
    Promise.all([
      Ionicons.loadFont(),
      loadAsync({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexSans_700Bold }),
    ]).then(
      () => setReady(true),
      () => setReady(true)
    );
  }, []);
  return ready ? <>{children}</> : <StartupStatus />;
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
  const { touch } = useSession();
  const styles = useStyles();
  const wide = width >= WIDE_BREAKPOINT;
  const [active, setActive] = useState(TABS[0].key);
  const [intent, setIntent] = useState<(Intent & { tab: string }) | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.addEventListener('keydown', touch);
    return () => window.removeEventListener('keydown', touch);
  }, [touch]);

  const navigate: Navigate = (tab, value) => {
    setActive(tab);
    if (value) setIntent({ tab, value, id: Date.now() });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: wide ? insets.bottom : 0, paddingLeft: insets.left, paddingRight: insets.right }]} onTouchStart={touch} onPointerDown={touch}>
      {wide ? null : (
        <View style={styles.appBar}>
          <Brand />
          <View style={{ flex: 1 }} />
          <LanguageSwitch />
          <ThemeToggle />
        </View>
      )}

      <View style={styles.body}>
        {wide ? <NavRail active={active} onSelect={setActive} /> : null}

        {/* Screens stay mounted (hidden when inactive) so search text and the cart persist across tabs. */}
        <View style={styles.workspace}>
          {TABS.map(({ key, Screen }) => (
            <TabPane key={key} active={key === active} wide={wide}>
              <ScreenActivity active={key === active}>
                <Screen onNavigate={navigate} intent={intent?.tab === key ? intent : null} />
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
function TabPane({ active, wide, children }: { active: boolean; wide: boolean; children: ReactNode }) {
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
        wide && styles.desktopPane,
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
    <View style={styles.brand}>
      <View style={styles.brandMark}>
        <PharmacyCross size={17} color={colors.onPrimary} />
      </View>
      <Text style={styles.brandText}>PharmaCare</Text>
    </View>
  );
}

function NavRail({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  const { t } = useI18n();
  const { user, logout } = useSession();
  const styles = useStyles();
  const index = TABS.findIndex((tab) => tab.key === active);
  const { offset, target, onItemLayout } = useIndicator(index, 'y');
  return (
    <View style={styles.rail}>
      <View style={styles.railBrand}>
        <Brand />
      </View>
      <View accessibilityRole="tablist" accessibilityLabel={t('nav.main')} style={styles.railMenu}>
        {/* The highlight glides to the selected item. */}
        {target ? <Animated.View pointerEvents="none" style={[styles.railPill, { height: target.height, transform: [{ translateY: offset }] }]} /> : null}
        {TABS.map((tab, i) => (
          <TabButton key={tab.key} tab={tab} focused={tab.key === active} onPress={() => onSelect(tab.key)} layout="rail" onLayout={onItemLayout(i)} />
        ))}
      </View>
      <View style={styles.railFooter}>
        <View style={styles.railPrefs}>
          <LanguageSwitch />
          <ThemeToggle />
        </View>
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
            <IconButton icon="log-out-outline" label={t('common.logout')} onPress={logout} />
          </View>
        ) : null}
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
  const color = focused ? colors.primary : colors.muted;
  // The icon of the newly selected tab gives a small pop.
  const pop = usePop(focused);
  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
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
  workspace: { flex: 1, minWidth: 0 },
  desktopPane: { paddingHorizontal: 16, paddingTop: 6 },
  startup: { alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
  startupError: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 62,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, minHeight: 48, borderRadius: 8 },
  tabPill: { position: 'absolute', width: PILL_WIDTH, height: 28, borderRadius: 14, backgroundColor: colors.primarySoft },
  tabLabel: { fontSize: 11, fontWeight: '500', maxWidth: '100%', paddingHorizontal: 2 },
  rail: { width: 218, paddingHorizontal: 14, paddingVertical: 18, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  railBrand: { paddingHorizontal: 6, paddingTop: 3, paddingBottom: 32 },
  railMenu: { gap: 5, flex: 1 },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, minHeight: 44, borderRadius: 10, ...transition },
  railPill: { position: 'absolute', top: 0, left: 0, right: 0, borderRadius: 10, backgroundColor: colors.primarySoft },
  railLabel: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  railFooter: { gap: 14 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  userName: { fontSize: 13, fontWeight: '600', color: colors.text },
  userRole: { fontSize: 12, color: colors.muted },
  railPrefs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
}));
