import Ionicons from '@expo/vector-icons/Ionicons';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageSwitch, ThemeToggle } from './src/components/PreferenceControls';
import { ToastProvider } from './src/components/feedback';
import { focusRing, Icon, type IconName, type PressState } from './src/components/ui';
import { DataProvider } from './src/db/DataContext';
import { DATABASE_NAME, migrate } from './src/db/schema';
import { I18nProvider, useI18n, type TranslationKey } from './src/i18n';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MedicinesScreen } from './src/screens/MedicinesScreen';
import { MoreScreen } from './src/screens/more/MoreScreen';
import { SellScreen } from './src/screens/SellScreen';
import { roleLabel } from './src/services/permissions';
import { SessionProvider, useSession } from './src/session';
import { makeStyles, ThemeProvider, useTheme } from './src/theme';

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
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} onError={(e) => console.error('Database failed to open', e)}>
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
  const { colors } = useTheme();
  const styles = useStyles();
  const wide = width >= WIDE_BREAKPOINT;
  const [active, setActive] = useState(TABS[0].key);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} onTouchStart={touch} onPointerDown={touch}>
      <View style={styles.appBar}>
        <View style={styles.brand} accessibilityRole="header">
          <Icon name="medkit" size={22} color={colors.primary} />
          <Text style={styles.brandText}>PharmaCare</Text>
        </View>
        <View style={{ flex: 1 }} />
        {user && width >= 480 ? <Text style={styles.appBadge}>{roleLabel(user.role)}</Text> : null}
        <LanguageSwitch />
        <ThemeToggle />
      </View>

      <View style={styles.body}>
        {wide ? <NavRail active={active} onSelect={setActive} /> : null}

        {/* Screens stay mounted (hidden when inactive) so search text and the cart persist across tabs. */}
        <View style={{ flex: 1 }}>
          {TABS.map(({ key, Screen }) => (
            <View key={key} style={[StyleSheet.absoluteFill, key !== active && styles.hidden]}>
              <Screen onNavigate={setActive} />
            </View>
          ))}
        </View>
      </View>

      {wide ? null : (
        <View accessibilityRole="tablist" accessibilityLabel={t('nav.main')} style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
          {TABS.map((tab) => (
            <TabButton key={tab.key} tab={tab} focused={tab.key === active} onPress={() => setActive(tab.key)} layout="bottom" />
          ))}
        </View>
      )}
    </View>
  );
}

function NavRail({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('nav.main')} style={styles.rail}>
      {TABS.map((tab) => (
        <TabButton key={tab.key} tab={tab} focused={tab.key === active} onPress={() => onSelect(tab.key)} layout="rail" />
      ))}
    </View>
  );
}

function TabButton({ tab, focused, onPress, layout }: { tab: (typeof TABS)[number]; focused: boolean; onPress: () => void; layout: 'bottom' | 'rail' }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const rail = layout === 'rail';
  const color = focused ? colors.primary : colors.muted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={t(tab.label)}
      onPress={onPress}
      style={(state: PressState) => [
        rail ? styles.railItem : styles.tab,
        rail && focused && { backgroundColor: colors.primarySoft },
        rail && state.hovered && !focused && { backgroundColor: colors.surfaceAlt },
        focusRing(colors, state),
      ]}
    >
      <Icon name={focused ? tab.iconActive : tab.icon} size={rail ? 20 : 22} color={color} />
      <Text numberOfLines={1} style={[rail ? styles.railLabel : styles.tabLabel, { color }, focused && { fontWeight: '700' }]}>
        {t(tab.label)}
      </Text>
    </Pressable>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 17, fontWeight: '700', color: colors.primary },
  appBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
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
  tabLabel: { fontSize: 11, fontWeight: '600', maxWidth: '100%', paddingHorizontal: 2 },
  rail: { width: 220, padding: 12, gap: 4, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, borderRadius: 10 },
  railLabel: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
}));
