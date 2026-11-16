import { ScrollView, Text, View } from 'react-native';

import { Enter } from '../components/motion';
import { Badge, Card, EmptyState, ErrorBanner, LoadingState, ScreenHeader, SectionTitle, Stat, screen } from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getDashboard } from '../db/repository';
import { daysLabel, dateTime, formatNumber, medicineLabel, money, shortDate } from '../format';
import { useI18n } from '../i18n';
import { can, roleLabel } from '../services/permissions';
import { useUser } from '../session';
import { makeStyles } from '../theme';

export function DashboardScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const user = useUser();
  const { t, tn } = useI18n();
  const styles = useStyles();
  // Cashiers see their own sales (docs/06-business-rules.md §6.3).
  const ownOnly = !can(user, 'orders.viewAll');
  const { data, error } = useDbQuery((db) => getDashboard(db, ownOnly ? user.user_id : null), [ownOnly, user.user_id]);

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader
        title={t('dashboard.greeting', { name: user.full_name.split(' ')[0] })}
        subtitle={`${roleLabel(user.role)} · ${t('dashboard.subtitle')}`}
      />
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState /> : null}
      {data ? (
        <>
          {/* Figures count up from their last value, so a new sale visibly adds to today's total. */}
          <View style={styles.grid}>
            <Stat
              index={0}
              label={ownOnly ? t('dashboard.mySalesToday') : t('dashboard.netSalesToday')}
              count={data.stats.today_net}
              format={money}
              note={tn('count.orders', data.stats.today_orders)}
              icon="cash-outline"
            />
            <Stat
              index={1}
              label={t('dashboard.sellableUnits')}
              count={data.stats.sellable_units}
              format={formatNumber}
              note={tn('count.activeMedicines', data.stats.active_medicines)}
              icon="layers-outline"
            />
            <Stat index={2} icon="trending-down-outline" label={t('dashboard.lowStock')} count={data.stats.low_stock} tone={data.stats.low_stock ? 'warning' : undefined} onPress={() => onNavigate('medicines')} />
            <Stat index={3} icon="time-outline" label={t('dashboard.nearExpiry')} count={data.stats.near_expiry} tone={data.stats.near_expiry ? 'warning' : undefined} onPress={() => onNavigate('inventory')} />
            <Stat index={4} icon="warning-outline" label={t('dashboard.expired')} count={data.stats.expired} tone={data.stats.expired ? 'danger' : undefined} onPress={() => onNavigate('inventory')} />
            <Stat index={5} icon="wallet-outline" label={t('dashboard.stockValue')} count={data.stats.inventory_value} format={money} />
          </View>

          <SectionTitle>{t('dashboard.expiryAlerts')}</SectionTitle>
          <Enter index={6}>
            <Card style={{ paddingVertical: 4 }}>
              {data.expiring.length === 0 ? <EmptyState icon="checkmark-circle-outline" text={t('dashboard.noExpiring')} /> : null}
              {data.expiring.map((b) => (
                <View key={b.batch_id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{medicineLabel(b)}</Text>
                    <Text style={styles.muted}>
                      {t('batch.line', { batch: b.batch_number, left: b.quantity_remaining, date: shortDate(b.expiry_date), days: daysLabel(b.days_to_expiry) })}
                    </Text>
                  </View>
                  <Badge label={b.batch_state === 'EXPIRED' ? t('batch.EXPIRED') : t('batch.NEAR_EXPIRY')} tone={b.batch_state === 'EXPIRED' ? 'danger' : 'warning'} />
                </View>
              ))}
            </Card>
          </Enter>

          <SectionTitle>{t('dashboard.lowStockTitle')}</SectionTitle>
          <Enter index={7}>
            <Card style={{ paddingVertical: 4 }}>
              {data.lowStock.length === 0 ? <EmptyState icon="checkmark-circle-outline" text={t('dashboard.noLowStock')} /> : null}
              {data.lowStock.map((m) => (
                <View key={m.medicine_id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{medicineLabel(m)}</Text>
                    <Text style={styles.muted}>
                      {m.generic_name} · {t('medicine.minShort', { min: m.min_stock_level })}
                    </Text>
                  </View>
                  <Badge label={m.stock_state === 'OUT' ? t('stock.OUT') : t('stock.left', { count: m.sellable_stock })} tone={m.stock_state === 'OUT' ? 'danger' : 'warning'} />
                </View>
              ))}
            </Card>
          </Enter>

          <SectionTitle>{ownOnly ? t('dashboard.myRecentSales') : t('dashboard.recentSales')}</SectionTitle>
          <Enter index={8}>
            <Card style={{ paddingVertical: 4 }}>
              {data.recent.length === 0 ? <EmptyState icon="receipt-outline" text={t('dashboard.noSales')} /> : null}
              {data.recent.map((o) => (
                <View key={o.order_id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{o.order_number}</Text>
                    <Text style={styles.muted}>
                      {dateTime(o.created_at)} · {o.customer_name ?? t('common.walkIn')} · {o.staff_name}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{money(o.total_amount - o.refunded_amount)}</Text>
                </View>
              ))}
            </Card>
          </Enter>
        </>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  muted: { fontSize: 12, color: colors.muted, paddingVertical: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
}));
