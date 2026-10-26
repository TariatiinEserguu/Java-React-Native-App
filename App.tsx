import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToastProvider } from './src/components/feedback';
import { DataProvider } from './src/db/DataContext';
import { DATABASE_NAME, migrate } from './src/db/schema';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MedicinesScreen } from './src/screens/MedicinesScreen';
import { MoreScreen } from './src/screens/more/MoreScreen';
import { SellScreen } from './src/screens/SellScreen';
import { ROLE_LABELS } from './src/services/permissions';
import { SessionProvider, useSession } from './src/session';
import { colors } from './src/theme';

type TabScreen = ComponentType<{ onNavigate: (tab: string) => void }>;

const TABS: { key: string; label: string; icon: string; Screen: TabScreen }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '◎', Screen: DashboardScreen },
  { key: 'medicines', label: 'Medicines', icon: '✚', Screen: MedicinesScreen },
  { key: 'sell', label: 'Sell', icon: '🛒', Screen: SellScreen },
  { key: 'inventory', label: 'Inventory', icon: '▦', Screen: InventoryScreen },
  { key: 'more', label: 'More', icon: '☰', Screen: MoreScreen },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} onError={(e) => console.error('Database failed to open', e)}>
        <DataProvider>
          <ToastProvider>
            <SessionProvider>
              <Root />
            </SessionProvider>
          </ToastProvider>
        </DataProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  if (!user) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LoginScreen />
      </View>
    );
  }
  // Keyed by user so a new login starts with fresh screens (no cart or form left from the last user).
  return <Shell key={user.user_id} />;
}

function Shell() {
  const insets = useSafeAreaInsets();
  const { user, touch } = useSession();
  const [active, setActive] = useState(TABS[0].key);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} onTouchStart={touch}>
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>✚ PharmaCare</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.appBadge}>{user ? ROLE_LABELS[user.role] : ''}</Text>
      </View>

      {/* Screens stay mounted (hidden when inactive) so search text and the cart persist across tabs. */}
      <View style={{ flex: 1 }}>
        {TABS.map(({ key, Screen }) => (
          <View key={key} style={[StyleSheet.absoluteFill, key !== active && styles.hidden]}>
            <Screen onNavigate={setActive} />
          </View>
        ))}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {TABS.map((tab) => {
          const focused = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => setActive(tab.key)}
              style={styles.tab}
            >
              <Text style={[styles.tabIcon, focused && styles.tabFocused]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, focused && styles.tabFocused]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appTitle: { fontSize: 17, fontWeight: '700', color: colors.primary },
  appBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2, minHeight: 44 },
  tabIcon: { fontSize: 18, color: colors.muted },
  tabLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  tabFocused: { color: colors.primary },
});
