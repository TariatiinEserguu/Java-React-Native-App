import { useState, type ComponentType } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ListItem, ScreenHeader, screen } from '../../components/ui';
import { can, ROLE_LABELS, type Permission } from '../../services/permissions';
import { useSession, useUser } from '../../session';
import { colors } from '../../theme';
import { DatabaseScreen } from '../database/DatabaseScreen';
import { OrdersScreen } from './OrdersScreen';
import { CategoriesScreen, CustomersScreen, StaffScreen, SuppliersScreen } from './PeopleScreens';
import { ReportsScreen } from './ReportsScreen';
import { SettingsScreen } from './SettingsScreen';

type Page = { key: string; title: string; description: string; icon: string; Screen: ComponentType; permission?: Permission };

// Screens that don't fit in the five-tab bar (docs/05-ui-ux.md §5.1).
const PAGES: Page[] = [
  { key: 'orders', title: 'Orders', description: 'Sales history, receipts and refunds', icon: '🧾', Screen: OrdersScreen },
  { key: 'customers', title: 'Customers', description: 'Customer records and their orders', icon: '👥', Screen: CustomersScreen },
  { key: 'suppliers', title: 'Suppliers', description: 'Wholesalers and distributors', icon: '🚚', Screen: SuppliersScreen, permission: 'suppliers.write' },
  { key: 'categories', title: 'Categories', description: 'Medicine groups', icon: '🗂', Screen: CategoriesScreen, permission: 'categories.write' },
  { key: 'reports', title: 'Reports', description: 'Sales, stock, expiry and profit', icon: '📊', Screen: ReportsScreen, permission: 'reports.view' },
  { key: 'staff', title: 'Staff accounts', description: 'Users, roles and passwords', icon: '🔑', Screen: StaffScreen, permission: 'users.manage' },
  { key: 'settings', title: 'Settings & backup', description: 'Thresholds, backup, password, integrity check', icon: '⚙️', Screen: SettingsScreen },
  { key: 'sql', title: 'SQL console', description: 'Run SQL and browse tables (developer tool)', icon: '⛁', Screen: DatabaseScreen, permission: 'sql.console' },
];

export function MoreScreen() {
  const user = useUser();
  const { logout } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const pages = PAGES.filter((p) => !p.permission || can(user, p.permission));
  const page = pages.find((p) => p.key === open);

  if (page) {
    // The SQL console brings its own header and scroll view.
    if (page.key === 'sql') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.back}>
            <Button title="‹ More" variant="ghost" small onPress={() => setOpen(null)} />
          </View>
          <DatabaseScreen />
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
        <Button title="‹ More" variant="ghost" small onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start', marginLeft: -10 }} />
        <ScreenHeader title={page.title} subtitle={page.description} />
        <page.Screen />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader title="More" subtitle={`${user.full_name} · ${ROLE_LABELS[user.role]}`} />
      {pages.map((p) => (
        <ListItem key={p.key} onPress={() => setOpen(p.key)}>
          <View style={styles.row}>
            <Text style={styles.icon}>{p.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.muted}>{p.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </ListItem>
      ))}
      <Button title="Log out" variant="secondary" onPress={logout} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: 6, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 22, width: 30, textAlign: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  chevron: { fontSize: 24, color: colors.muted },
});
