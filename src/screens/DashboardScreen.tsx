import { ScrollView, useWindowDimensions, View } from 'react-native';

import { FormGlyph } from '../components/brand';
import { Enter } from '../components/motion';
import { Text } from '../components/Text';
import { Button, CountUp, EmptyState, ErrorBanner, Icon, ListGroup, ListItem, LoadingState, ScreenHeader, SectionTitle, StockMeter, screen, type IconName } from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getDashboard } from '../db/repository';
import { daysLabel, formatNumber, longDate, medicineLabel, money, shortDate, timeOfDay } from '../format';
import { useI18n } from '../i18n';
import { can } from '../services/permissions';
import { getSettings } from '../services/settings';
import { useUser } from '../session';
import { makeStyles, radius, radiusLg, useTheme } from '../theme';
import type { Navigate } from './navigation';

type Attention = { key: string; icon: IconName; tone: 'danger' | 'warning'; count: number; title: string; hint: string; go: () => void };

/**
 * "Today": the day's takings, the jobs that need doing (expired stock, stock about to expire,
 * medicines below their reorder level) and the latest sales. Status colour appears only on items
 * that need action.
 */
export function DashboardScreen({ onNavigate }: { onNavigate: Navigate }) {
  const user = useUser();
  const { t, tn } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const wide = useWindowDimensions().width >= 640;
  // Cashiers see their own sales (docs/06-business-rules.md §6.3).
  const ownOnly = !can(user, 'orders.viewAll');
  const { data, error } = useDbQuery(
    async (db) => ({ ...(await getDashboard(db, ownOnly ? user.user_id : null)), settings: await getSettings(db) }),
    [ownOnly, user.user_id]
  );

  const stats = data?.stats;
  const attention: Attention[] = stats
    ? [
        {
          key: 'expired',
          icon: 'alert-circle-outline' as IconName,
          tone: 'danger' as const,
          count: stats.expired,
          title: t('dashboard.attention.expired'),
          hint: t('dashboard.attention.expiredHint'),
          go: () => onNavigate('inventory', 'expired'),
        },
        {
          key: 'near',
          icon: 'time-outline' as IconName,
          tone: 'warning' as const,
          count: stats.near_expiry,
          title: t('dashboard.attention.near', { days: data.settings.expiry_warning_days }),
          hint: t('dashboard.attention.nearHint'),
          go: () => onNavigate('inventory', 'near'),
        },
        {
          key: 'low',
          icon: 'trending-down-outline' as IconName,
          tone: 'warning' as const,
          count: stats.low_stock,
          title: t('dashboard.attention.low'),
          hint: t('dashboard.attention.lowHint'),
          go: () => onNavigate('medicines', 'low'),
        },
      ].filter((a) => a.count > 0)
    : [];

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader title={t('dashboard.title')} subtitle={longDate()} />
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState rows={3} /> : null}
      {data && stats ? (
        <>
          <Enter>
            <View style={[styles.takings, wide && styles.takingsWide]}>
              <View style={styles.takingsMain}>
                <Text style={styles.takingsLabel}>{ownOnly ? t('dashboard.mySalesToday') : t('dashboard.netSalesToday')}</Text>
                {/* Counts up from its last value, so a new sale visibly adds to the day. */}
                <CountUp value={stats.today_net} format={money} style={styles.takingsValue} />
                <Text style={styles.takingsNote}>
                  {tn('count.orders', stats.today_orders)}
                  {stats.today_orders > 0 ? `, ${t('dashboard.average', { amount: money(stats.today_net / stats.today_orders) })}` : ''}
                </Text>
              </View>
              <View style={[styles.figures, wide && styles.figuresWide]}>
                <View style={styles.figure}>
                  <Text style={styles.figureLabel}>{t('dashboard.sellableUnits')}</Text>
                  <Text style={styles.figureValue}>{formatNumber(stats.sellable_units)}</Text>
                </View>
                <View style={styles.figure}>
                  <Text style={styles.figureLabel}>{t('dashboard.stockValue')}</Text>
                  <Text style={styles.figureValue}>{money(stats.inventory_value)}</Text>
                </View>
              </View>
            </View>
          </Enter>

          <View style={styles.actions}>
            <Button title={t('dashboard.newSale')} icon="cart-outline" onPress={() => onNavigate('sell')} style={[styles.action, !wide && styles.actionFull]} />
            {can(user, 'stock.receive') ? (
              <Button title={t('dashboard.receiveStock')} icon="download-outline" variant="secondary" onPress={() => onNavigate('inventory', 'receive')} style={styles.action} />
            ) : null}
            <Button title={t('dashboard.findMedicine')} icon="search-outline" variant="secondary" onPress={() => onNavigate('medicines')} style={styles.action} />
          </View>

          <SectionTitle>{t('dashboard.attention')}</SectionTitle>
          <ListGroup>
            {attention.length === 0 ? (
              <ListItem index={0}>
                <View style={styles.attnRow}>
                  <View style={[styles.attnMark, { backgroundColor: colors.primarySoft }]}>
                    <Icon name="checkmark" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attnTitle}>{t('dashboard.attention.none')}</Text>
                    <Text style={styles.attnHint}>{t('dashboard.attention.noneHint')}</Text>
                  </View>
                </View>
              </ListItem>
            ) : null}
            {attention.map((a, i) => {
              const tone = a.tone === 'danger' ? colors.danger : colors.warning;
              return (
                <ListItem key={a.key} index={i} onPress={a.go}>
                  <View style={styles.attnRow}>
                    <View style={[styles.attnMark, { backgroundColor: a.tone === 'danger' ? colors.dangerSoft : colors.warningSoft }]}>
                      <Icon name={a.icon} size={18} color={tone} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attnTitle}>{a.title}</Text>
                      <Text style={styles.attnHint}>{a.hint}</Text>
                    </View>
                    <Text style={[styles.attnCount, { color: tone }]}>{a.count}</Text>
                    <Icon name="chevron-forward" size={18} />
                  </View>
                </ListItem>
              );
            })}
          </ListGroup>

          <SectionTitle>{t('dashboard.expiryAlerts')}</SectionTitle>
          {data.expiring.length === 0 ? (
            <EmptyState icon="calendar-outline" text={t('dashboard.noExpiring')} />
          ) : (
            <ListGroup>
              {data.expiring.map((b, i) => {
                const expired = b.batch_state === 'EXPIRED';
                return (
                  <ListItem key={b.batch_id} index={i} onPress={() => onNavigate('inventory', expired ? 'expired' : 'near')}>
                    <View style={styles.line}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {medicineLabel(b)}
                        </Text>
                        <Text style={styles.muted}>
                          {t('medicine.lot', { batch: b.batch_number })}, {t('stock.left', { count: b.quantity_remaining })}
                        </Text>
                      </View>
                      <View style={styles.right}>
                        <Text style={[styles.date, { color: expired ? colors.danger : colors.warning }]}>{shortDate(b.expiry_date)}</Text>
                        <Text style={[styles.muted, { color: expired ? colors.danger : colors.muted }]}>{daysLabel(b.days_to_expiry)}</Text>
                      </View>
                    </View>
                  </ListItem>
                );
              })}
            </ListGroup>
          )}

          <SectionTitle>{t('dashboard.lowStockTitle')}</SectionTitle>
          {data.lowStock.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" text={t('dashboard.noLowStock')} />
          ) : (
            <ListGroup>
              {data.lowStock.map((m, i) => (
                <ListItem key={m.medicine_id} index={i} onPress={() => onNavigate('medicines', 'low')}>
                  <View style={styles.line}>
                    <FormGlyph form={m.dosage_form} size={36} rx={!!m.requires_prescription} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {medicineLabel(m)}
                      </Text>
                      <Text style={styles.muted}>{t('medicine.minShort', { min: m.min_stock_level })}</Text>
                    </View>
                    <View style={styles.right}>
                      <Text style={[styles.stockText, { color: m.stock_state === 'OUT' ? colors.danger : colors.warning }]}>
                        {m.stock_state === 'OUT' ? t('stock.OUT') : t('stock.left', { count: m.sellable_stock })}
                      </Text>
                      <StockMeter stock={m.sellable_stock} min={m.min_stock_level} state={m.stock_state} />
                    </View>
                  </View>
                </ListItem>
              ))}
            </ListGroup>
          )}

          <SectionTitle>{ownOnly ? t('dashboard.myRecentSales') : t('dashboard.recentSales')}</SectionTitle>
          {data.recent.length === 0 ? (
            <EmptyState icon="receipt-outline" text={t('dashboard.noSales')} />
          ) : (
            <ListGroup>
              {data.recent.map((o, i) => (
                <ListItem key={o.order_id} index={i}>
                  <View style={styles.line}>
                    <Text style={styles.time}>{timeOfDay(o.created_at)}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name}>{o.order_number}</Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {shortDate(o.created_at)}, {o.customer_name ?? t('common.walkIn')}
                      </Text>
                    </View>
                    <Text style={styles.amount}>{money(o.total_amount - o.refunded_amount)}</Text>
                  </View>
                </ListItem>
              ))}
            </ListGroup>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  takings: { backgroundColor: colors.surface, borderRadius: radiusLg, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 16 },
  takingsWide: { flexDirection: 'row', alignItems: 'flex-end' },
  takingsMain: { flex: 1, gap: 2 },
  takingsLabel: { fontSize: 13, fontWeight: '500', color: colors.muted },
  takingsValue: { fontSize: 34, fontWeight: '600', color: colors.text, letterSpacing: -0.8, lineHeight: 42 },
  takingsNote: { fontSize: 13, color: colors.muted },
  figures: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  figuresWide: { borderTopWidth: 0, paddingTop: 0, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 18 },
  figure: { flex: 1, minWidth: 120, gap: 2 },
  figureLabel: { fontSize: 12, color: colors.muted },
  figureValue: { fontSize: 17, fontWeight: '600', color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: { flexGrow: 1, flexBasis: 140 },
  actionFull: { flexBasis: '100%' },
  attnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attnMark: { width: 36, height: 36, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
  attnTitle: { fontSize: 15, fontWeight: '500', color: colors.text },
  attnHint: { fontSize: 13, color: colors.muted, marginTop: 1 },
  attnCount: { fontSize: 20, fontWeight: '600', minWidth: 28, textAlign: 'right' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 4 },
  date: { fontSize: 14, fontWeight: '600' },
  stockText: { fontSize: 13, fontWeight: '600' },
  time: { fontSize: 13, fontWeight: '500', color: colors.muted, width: 44 },
  amount: { fontSize: 15, fontWeight: '600', color: colors.text },
}));
