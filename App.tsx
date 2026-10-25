import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToastProvider } from './src/components/feedback';
import { DataProvider } from './src/db/DataContext';
import { DATABASE_NAME, migrate } from './src/db/schema';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { DatabaseScreen } from './src/screens/database/DatabaseScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { ProductsScreen } from './src/screens/ProductsScreen';
import { colors } from './src/theme';

const TABS: { key: string; label: string; icon: string; Screen: ComponentType }[] = [
  { key: 'home', label: 'Overview', icon: '◎', Screen: HomeScreen },
  { key: 'products', label: 'Products', icon: '▦', Screen: ProductsScreen },
  { key: 'customers', label: 'Customers', icon: '☺', Screen: CustomersScreen },
  { key: 'orders', label: 'Orders', icon: '☰', Screen: OrdersScreen },
  { key: 'database', label: 'Database', icon: '⛁', Screen: DatabaseScreen },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} onError={(e) => console.error('Database failed to open', e)}>
        <DataProvider>
          <ToastProvider>
            <Shell />
          </ToastProvider>
        </DataProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(TABS[0].key);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>Inventory Manager</Text>
        <Text style={styles.appBadge}>SQLite prototype</Text>
      </View>

      {/* Screens stay mounted (hidden when inactive) so search text and editor state persist across tabs. */}
      <View style={{ flex: 1 }}>
        {TABS.map(({ key, Screen }) => (
          <View key={key} style={[StyleSheet.absoluteFill, key !== active && styles.hidden]}>
            <Screen />
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
  appTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
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
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  tabIcon: { fontSize: 18, color: colors.muted },
  tabLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  tabFocused: { color: colors.primary },
});
