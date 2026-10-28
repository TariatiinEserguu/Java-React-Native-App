import { useState, type ComponentType } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Icon, ListItem, ScreenHeader, screen, type IconName } from '../../components/ui';
import { useI18n, type TranslationKey } from '../../i18n';
import { can, roleLabel, type Permission } from '../../services/permissions';
import { useSession, useUser } from '../../session';
import { makeStyles } from '../../theme';
import { DatabaseScreen } from '../database/DatabaseScreen';
import { OrdersScreen } from './OrdersScreen';
import { CategoriesScreen, CustomersScreen, StaffScreen, SuppliersScreen } from './PeopleScreens';
import { ReportsScreen } from './ReportsScreen';
import { SettingsScreen } from './SettingsScreen';

type Page = { key: string; title: TranslationKey; description: TranslationKey; icon: IconName; Screen: ComponentType; permission?: Permission };

// Screens that don't fit in the five-tab bar (docs/05-ui-ux.md §5.1).
const PAGES: Page[] = [
  { key: 'orders', title: 'more.orders', description: 'more.orders.desc', icon: 'receipt-outline', Screen: OrdersScreen },
  { key: 'customers', title: 'more.customers', description: 'more.customers.desc', icon: 'people-outline', Screen: CustomersScreen },
  { key: 'suppliers', title: 'more.suppliers', description: 'more.suppliers.desc', icon: 'bus-outline', Screen: SuppliersScreen, permission: 'suppliers.write' },
  { key: 'categories', title: 'more.categories', description: 'more.categories.desc', icon: 'pricetags-outline', Screen: CategoriesScreen, permission: 'categories.write' },
  { key: 'reports', title: 'more.reports', description: 'more.reports.desc', icon: 'bar-chart-outline', Screen: ReportsScreen, permission: 'reports.view' },
  { key: 'staff', title: 'more.staff', description: 'more.staff.desc', icon: 'key-outline', Screen: StaffScreen, permission: 'users.manage' },
  { key: 'settings', title: 'more.settings', description: 'more.settings.desc', icon: 'settings-outline', Screen: SettingsScreen },
  { key: 'sql', title: 'more.sql', description: 'more.sql.desc', icon: 'terminal-outline', Screen: DatabaseScreen, permission: 'sql.console' },
];

export function MoreScreen() {
  const user = useUser();
  const { logout } = useSession();
  const { t } = useI18n();
  const styles = useStyles();
  const [open, setOpen] = useState<string | null>(null);
  const pages = PAGES.filter((p) => !p.permission || can(user, p.permission));
  const page = pages.find((p) => p.key === open);

  const back = <Button title={t('nav.more')} variant="ghost" small icon="chevron-back" onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start' }} />;

  if (page) {
    // The SQL console brings its own header and scroll view.
    if (page.key === 'sql') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.back}>{back}</View>
          <DatabaseScreen />
        </View>
      );
    }
    return (
      <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
        {back}
        <ScreenHeader title={t(page.title)} subtitle={t(page.description)} />
        <page.Screen />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader title={t('nav.more')} subtitle={`${user.full_name} · ${roleLabel(user.role)}`} />
      {pages.map((p) => (
        <ListItem key={p.key} onPress={() => setOpen(p.key)}>
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Icon name={p.icon} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t(p.title)}</Text>
              <Text style={styles.muted}>{t(p.description)}</Text>
            </View>
            <Icon name="chevron-forward" size={20} />
          </View>
        </ListItem>
      ))}
      <Button title={t('common.logout')} variant="secondary" icon="log-out-outline" onPress={logout} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  back: { paddingHorizontal: 8, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
}));
