import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { FormGlyph } from '../components/brand';
import { Text } from '../components/Text';
import {
  Badge, Button, CountUp, EmptyState, ErrorBanner, Icon, ListGroup, ListItem,
  LoadingState, StockMeter, screen, type IconName,
} from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getDashboard } from '../db/repository';
import { dateTime, daysLabel, formatNumber, longDate, medicineLabel, money, shortDate } from '../format';
import { useI18n } from '../i18n';
import { can } from '../services/permissions';
import { getSettings } from '../services/settings';
import { useUser } from '../session';
import { makeStyles, radius, radiusLg, useTheme } from '../theme';
import { orderTone } from './more/OrdersScreen';
import type { Navigate } from './navigation';

type Attention = {
  key: string;
  icon: IconName;
  tone: 'danger' | 'warning';
  count: number;
  title: string;
  hint: string;
  go: () => void;
};

export function DashboardScreen({ onNavigate }: { onNavigate: Navigate }) {
  const user = useUser();
  const { t, tn } = useI18n();
  const styles = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 600;
  const wide = width >= 1140 && fontScale <= 1.2;
  const stackMetrics = width < 355 || fontScale > 1.5;
  // Cashiers see their own sales (docs/06-business-rules.md §6.3).
  const ownOnly = !can(user, 'orders.viewAll');
  const { data, error } = useDbQuery(
    async (db) => ({ ...(await getDashboard(db, ownOnly ? user.user_id : null)), settings: await getSettings(db) }),
    [ownOnly, user.user_id]
  );
  const stats = data?.stats;
  const attention: Attention[] = data
    ? [
        {
          key: 'expired',
          icon: 'alert-circle-outline' as const,
          tone: 'danger' as const,
          count: data.stats.expired,
          title: t('dashboard.attention.expired'),
          hint: t('dashboard.attention.expiredHint'),
          go: () => onNavigate('inventory', 'expired'),
        },
        {
          key: 'near',
          icon: 'time-outline' as const,
          tone: 'warning' as const,
          count: data.stats.near_expiry,
          title: t('dashboard.attention.near', { days: data.settings.expiry_warning_days }),
          hint: t('dashboard.attention.nearHint'),
          go: () => onNavigate('inventory', 'near'),
        },
        {
          key: 'low',
          icon: 'trending-down-outline' as const,
          tone: 'warning' as const,
          count: data.stats.low_stock,
          title: t('dashboard.attention.low'),
          hint: t('dashboard.attention.lowHint'),
          go: () => onNavigate('medicines', 'low'),
        },
      ].filter((item) => item.count > 0)
    : [];

  const newSale = <Button title={t('dashboard.newSale')} icon="add-outline" onPress={() => onNavigate('sell')} style={compact && styles.compactAction} />;

  return (
    <ScrollView contentContainerStyle={[screen.content, styles.content, compact && styles.contentCompact]}>
      <View style={[styles.header, wide && styles.headerWide]}>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>
            {t('dashboard.title')}
          </Text>
          <View style={styles.dateLine}>
            <Icon name="calendar-outline" size={16} />
            <Text style={styles.dateText}>{longDate()}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          {compact ? newSale : null}
          {can(user, 'stock.receive') ? (
            <Button
              title={t('dashboard.receiveStock')}
              icon="download-outline"
              variant="secondary"
              onPress={() => onNavigate('inventory', 'receive')}
              style={compact && styles.compactAction}
            />
          ) : null}
          <Button
            title={t('dashboard.findMedicine')}
            icon="search-outline"
            variant="secondary"
            onPress={() => onNavigate('medicines')}
            style={compact && styles.compactAction}
          />
          {compact ? null : newSale}
        </View>
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState rows={3} /> : null}
      {data && stats ? (
        <>
          <View style={[styles.metricGrid, wide && styles.metricGridWide]}>
            <View style={[styles.metricPair, stackMetrics && styles.metricGridStack]}>
              <Metric
                icon="wallet-outline"
                label={ownOnly ? t('dashboard.mySalesToday') : t('dashboard.netSalesToday')}
                value={stats.today_net}
                format={money}
                featured
                stacked={stackMetrics}
              />
              <Metric
                icon="receipt-outline"
                label={ownOnly ? t('dashboard.myOrdersToday') : t('dashboard.ordersToday')}
                value={stats.today_orders}
                note={stats.today_orders > 0 ? t('dashboard.average', { amount: money(stats.today_net / stats.today_orders) }) : undefined}
                stacked={stackMetrics}
              />
            </View>
            <View style={[styles.metricPair, stackMetrics && styles.metricGridStack]}>
              <Metric
                icon="cube-outline"
                label={t('dashboard.sellableUnits')}
                value={stats.sellable_units}
                note={tn('count.activeMedicines', stats.active_medicines)}
                stacked={stackMetrics}
              />
              <Metric icon="layers-outline" label={t('dashboard.stockValue')} value={stats.inventory_value} format={money} stacked={stackMetrics} />
            </View>
          </View>

          <DashboardPanels data={data} attention={attention} ownOnly={ownOnly} onNavigate={onNavigate} wide={wide} />
        </>
      ) : null}
    </ScrollView>
  );
}

function DashboardPanels({
  data, attention, ownOnly, onNavigate, wide,
}: {
  data: Awaited<ReturnType<typeof getDashboard>>;
  attention: Attention[];
  ownOnly: boolean;
  onNavigate: Navigate;
  wide: boolean;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();

  const recentPanel = (
    <Panel
      title={ownOnly ? t('dashboard.myRecentSales') : t('dashboard.recentSales')}
      action={<Button title={t('dashboard.viewOrders')} icon="arrow-forward-outline" variant="ghost" small onPress={() => onNavigate('more', 'orders')} />}
    >
      {data.recent.length === 0 ? (
        <EmptyState icon="receipt-outline" text={t('dashboard.noSales')} />
      ) : (
        data.recent.map((order, index) => (
          <ListItem key={order.order_id} index={index + 1} style={styles.panelRow}>
            <View style={styles.line}>
              <View style={styles.mark}>
                <Icon name="receipt-outline" size={17} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name}>{order.order_number}</Text>
                <Text style={styles.muted}>{order.customer_name ?? t('common.walkIn')} · {dateTime(order.created_at)}</Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.amount}>{money(order.total_amount - order.refunded_amount)}</Text>
                <Badge
                  label={order.status === 'COMPLETED' && order.refunded_amount ? t('order.partRefunded') : t(`order.${order.status}`)}
                  tone={order.refunded_amount ? 'warning' : orderTone[order.status]}
                />
              </View>
            </View>
          </ListItem>
        ))
      )}
    </Panel>
  );

  const stockPanel = (
    <Panel title={t('dashboard.lowStockTitle')}>
      {data.lowStock.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" text={t('dashboard.noLowStock')} />
      ) : (
        data.lowStock.map((medicine, index) => (
          <ListItem key={medicine.medicine_id} index={index + 1} onPress={() => onNavigate('medicines', 'low')} style={styles.panelRow}>
            <View style={styles.line}>
              <FormGlyph form={medicine.dosage_form} size={36} rx={!!medicine.requires_prescription} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{medicineLabel(medicine)}</Text>
                <Text style={styles.muted}>{t('medicine.minShort', { min: medicine.min_stock_level })}</Text>
              </View>
              <View style={styles.right}>
                <Text style={[styles.stockText, { color: medicine.stock_state === 'OUT' ? colors.danger : colors.warning }]}>
                  {medicine.stock_state === 'OUT' ? t('stock.OUT') : t('stock.left', { count: medicine.sellable_stock })}
                </Text>
                <StockMeter stock={medicine.sellable_stock} min={medicine.min_stock_level} state={medicine.stock_state} />
              </View>
            </View>
          </ListItem>
        ))
      )}
    </Panel>
  );

  const attentionPanel = (
    <Panel title={t('dashboard.attention')}>
      {attention.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          text={t('dashboard.attention.none')}
          hint={t('dashboard.attention.noneHint')}
        />
      ) : (
        attention.map((item, index) => {
          const tone = item.tone === 'danger' ? colors.danger : colors.warning;
          const soft = item.tone === 'danger' ? colors.dangerSoft : colors.warningSoft;
          return (
            <ListItem key={item.key} index={index + 1} onPress={item.go} style={styles.panelRow}>
              <View style={styles.line}>
                <View style={[styles.mark, { backgroundColor: soft }]}>
                  <Icon name={item.icon} size={18} color={tone} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{item.title}</Text>
                  <Text style={styles.muted}>{item.hint}</Text>
                </View>
                <View style={[styles.countBadge, { backgroundColor: soft }]}>
                  <Text style={[styles.count, { color: tone }]}>{formatNumber(item.count)}</Text>
                </View>
                <Icon name="chevron-forward" size={16} />
              </View>
            </ListItem>
          );
        })
      )}
    </Panel>
  );

  const expiryPanel = (
    <Panel title={t('dashboard.expiryAlerts')}>
      {data.expiring.length === 0 ? (
        <EmptyState icon="calendar-outline" text={t('dashboard.noExpiring')} />
      ) : (
        data.expiring.map((batch, index) => {
          const expired = batch.batch_state === 'EXPIRED';
          return (
            <ListItem key={batch.batch_id} index={index + 1} onPress={() => onNavigate('inventory', expired ? 'expired' : 'near')} style={styles.panelRow}>
              <View style={styles.line}>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{medicineLabel(batch)}</Text>
                  <Text style={styles.muted}>
                    {t('medicine.lot', { batch: batch.batch_number })} · {t('stock.left', { count: batch.quantity_remaining })}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.stockText}>{shortDate(batch.expiry_date)}</Text>
                  <Text style={[styles.muted, { color: expired ? colors.danger : colors.warning }]}>{daysLabel(batch.days_to_expiry)}</Text>
                </View>
              </View>
            </ListItem>
          );
        })
      )}
    </Panel>
  );

  if (!wide) {
    return (
      <View style={styles.column}>
        {attentionPanel}
        {recentPanel}
        {stockPanel}
        {expiryPanel}
      </View>
    );
  }

  return (
    <View style={styles.panelGrid}>
      <View style={[styles.column, styles.columnPrimary]}>
        {recentPanel}
        {stockPanel}
      </View>
      <View style={[styles.column, styles.columnSecondary]}>
        {attentionPanel}
        {expiryPanel}
      </View>
    </View>
  );
}

function Metric({
  icon, label, value, format = formatNumber, note, featured = false, stacked,
}: {
  icon: IconName;
  label: string;
  value: number;
  format?: (value: number) => string;
  note?: string;
  featured?: boolean;
  stacked: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View style={[styles.metric, featured && styles.metricFeatured, stacked && styles.metricStacked]}>
      <View style={[styles.metricIcon, featured && styles.metricIconFeatured, stacked && styles.metricIconStacked]}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={stacked && styles.rowText}>
        <Text style={styles.metricLabel}>{label}</Text>
        <CountUp value={value} format={format} style={[styles.metricValue, featured && styles.metricValueFeatured]} />
        {note ? <Text style={styles.metricNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const styles = useStyles();
  return (
    <ListGroup>
      <View style={styles.panelHeader}>
        <Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </ListGroup>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingTop: 28, gap: 22 },
  contentCompact: { paddingTop: 16, gap: 16 },
  header: { gap: 16 },
  headerWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 },
  headerText: { flexShrink: 1, gap: 5 },
  title: { fontSize: 36, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2, color: colors.text },
  titleCompact: { fontSize: 29, lineHeight: 36, letterSpacing: -0.8 },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateText: { flexShrink: 1, fontSize: 14, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  compactAction: { flexGrow: 1 },
  metricGrid: { gap: 12 },
  metricGridWide: { flexDirection: 'row', gap: 14 },
  metricGridStack: { flexDirection: 'column' },
  metricPair: { flex: 1, flexDirection: 'row', gap: 12, minWidth: 0 },
  metric: {
    flex: 1, minWidth: 0, padding: 15, minHeight: 146, borderWidth: 1, borderColor: colors.border,
    borderRadius: radiusLg, backgroundColor: colors.surface,
  },
  metricFeatured: { backgroundColor: colors.primarySoft, borderColor: colors.primary + '2B' },
  metricStacked: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 86, paddingVertical: 10 },
  metricIcon: {
    width: 36, height: 36, borderRadius: radius, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  metricIconFeatured: { backgroundColor: colors.surface },
  metricIconStacked: { marginBottom: 0 },
  metricLabel: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  metricValue: {
    color: colors.text, fontSize: 27, fontWeight: '700', lineHeight: 37, letterSpacing: -0.55,
    fontVariant: ['tabular-nums'],
  },
  metricValueFeatured: { color: colors.primary },
  metricNote: { color: colors.muted, fontSize: 12, marginTop: 1 },
  panelGrid: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  column: { gap: 16, minWidth: 0 },
  columnPrimary: { flex: 1.28 },
  columnSecondary: { flex: 1 },
  panelHeader: {
    paddingHorizontal: 16, minHeight: 54, paddingVertical: 9, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', alignContent: 'center', gap: 8, flexWrap: 'wrap',
  },
  panelTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 },
  panelRow: { paddingVertical: 12, paddingHorizontal: 15 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 34, height: 34, borderRadius: radius, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text },
  muted: { fontSize: 12, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4, flexShrink: 1 },
  countBadge: { minWidth: 26, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 999, alignItems: 'center' },
  count: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stockText: { fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'right' },
  amount: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right' },
}));
