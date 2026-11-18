import { useState, type ComponentType } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '../../components/Text';
import { Enter } from '../../components/motion';
import { Button, Icon, PressableScale, ScreenHeader, focusRing, screen, type IconName } from '../../components/ui';
import { useI18n, type TranslationKey } from '../../i18n';
import { can, roleLabel, type Permission } from '../../services/permissions';
import { useSession, useUser } from '../../session';
import { makeStyles, radius, radiusLg, useTheme } from '../../theme';
import { DatabaseScreen } from '../database/DatabaseScreen';
import { useIntent, type Intent } from '../navigation';
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

export function MoreScreen({ intent }: { intent?: Intent | null }) {
  const user = useUser();
  const { logout } = useSession();
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<string | null>(null);
  const pages = PAGES.filter((p) => !p.permission || can(user, p.permission));
  useIntent(intent, (value) => {
    if (pages.some((p) => p.key === value)) setOpen(value);
  });
  const page = pages.find((p) => p.key === open);

  const back = <Button title={t('nav.more')} variant="ghost" small icon="chevron-back" onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start' }} />;

  if (page) {
    // The SQL console brings its own header and scroll view.
    if (page.key === 'sql') {
      return (
        <Enter key={page.key} style={{ flex: 1 }}>
          <View style={styles.back}>{back}</View>
          <DatabaseScreen />
        </Enter>
      );
    }
    return (
      <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
        <Enter key={page.key}>
          {back}
          <ScreenHeader title={t(page.title)} subtitle={t(page.description)} />
          <page.Screen />
        </Enter>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader title={t('more.workspace')} />
      <View style={styles.grid}>
        {pages.map((p, i) => (
          <Enter key={p.key} index={i} style={[styles.cell, width >= 1260 ? styles.cellThird : width >= 660 ? styles.cellHalf : null]}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t(p.title)}
              accessibilityHint={t(p.description)}
              onPress={() => setOpen(p.key)}
              pressScale={0.985}
              style={(state) => [styles.tile, (state.hovered || state.pressed) && styles.tileActive, focusRing(colors, state)]}
            >
              <View style={styles.iconWrap}><Icon name={p.icon} size={22} color={colors.primary} /></View>
              <View style={styles.tileCopy}>
                <Text style={styles.title}>{t(p.title)}</Text>
                <Text style={styles.muted}>{t(p.description)}</Text>
              </View>
              <Icon name="chevron-forward" size={17} />
            </PressableScale>
          </Enter>
        ))}
      </View>
      <View style={styles.account}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.full_name.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.title}>{user.full_name}</Text>
          <Text style={styles.muted}>{roleLabel(user.role)}</Text>
        </View>
        <Button title={t('common.logout')} variant="secondary" icon="log-out-outline" onPress={logout} />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  back: { paddingHorizontal: 8, paddingTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  cell: { width: '100%', paddingHorizontal: 6, marginBottom: 12 },
  cellHalf: { width: '50%' },
  cellThird: { width: '33.333%' },
  tile: { flex: 1, minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radiusLg, backgroundColor: colors.surface, cursor: 'pointer' },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileCopy: { flex: 1, gap: 3 },
  iconWrap: { width: 42, height: 42, borderRadius: radius, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, lineHeight: 18, color: colors.muted },
  account: { marginTop: 12, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radiusLg, backgroundColor: colors.surface },
  accountCopy: { flex: 1, gap: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.primary },
}));
