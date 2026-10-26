import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, ErrorBanner, ScreenHeader, SectionTitle, Stat, screen } from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getDashboard } from '../db/repository';
import { daysLabel, dateTime, medicineLabel, money } from '../format';
import { can, ROLE_LABELS } from '../services/permissions';
import { useUser } from '../session';
import { colors } from '../theme';

export function DashboardScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const user = useUser();
  // Cashiers see their own sales (docs/06-business-rules.md §6.3).
  const ownOnly = !can(user, 'orders.viewAll');
  const { data, error } = useDbQuery((db) => getDashboard(db, ownOnly ? user.user_id : null), [ownOnly, user.user_id]);

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader title={`Hello, ${user.full_name.split(' ')[0]}`} subtitle={`${ROLE_LABELS[user.role]} · live figures from the local database`} />
      {error ? <ErrorBanner message={error} /> : null}
      {data ? (
        <>
          <View style={styles.grid}>
            <Stat label={ownOnly ? 'My sales today' : 'Net sales today'} value={money(data.stats.today_net)} note={`${data.stats.today_orders} order(s)`} />
            <Stat label="Sellable units" value={data.stats.sellable_units.toLocaleString()} note={`${data.stats.active_medicines} active medicines`} />
            <Stat label="Low / out of stock" value={String(data.stats.low_stock)} tone={data.stats.low_stock ? 'warning' : undefined} onPress={() => onNavigate('medicines')} />
            <Stat label="Near expiry" value={String(data.stats.near_expiry)} tone={data.stats.near_expiry ? 'warning' : undefined} onPress={() => onNavigate('inventory')} />
            <Stat label="Expired (write off)" value={String(data.stats.expired)} tone={data.stats.expired ? 'danger' : undefined} onPress={() => onNavigate('inventory')} />
            <Stat label="Stock value (cost)" value={money(data.stats.inventory_value)} />
          </View>

          <SectionTitle>Expiry alerts</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data.expiring.length === 0 ? <Text style={styles.muted}>No batches expiring soon.</Text> : null}
            {data.expiring.map((b) => (
              <View key={b.batch_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{medicineLabel(b)}</Text>
                  <Text style={styles.muted}>
                    Batch {b.batch_number} · {b.quantity_remaining} left · {b.expiry_date} ({daysLabel(b.days_to_expiry)})
                  </Text>
                </View>
                <Badge label={b.batch_state === 'EXPIRED' ? 'Expired' : 'Near expiry'} tone={b.batch_state === 'EXPIRED' ? 'danger' : 'warning'} />
              </View>
            ))}
          </Card>

          <SectionTitle>Low stock</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data.lowStock.length === 0 ? <Text style={styles.muted}>Everything is above its minimum level.</Text> : null}
            {data.lowStock.map((m) => (
              <View key={m.medicine_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{medicineLabel(m)}</Text>
                  <Text style={styles.muted}>
                    {m.generic_name} · min {m.min_stock_level}
                  </Text>
                </View>
                <Badge label={m.stock_state === 'OUT' ? 'Out of stock' : `${m.sellable_stock} left`} tone={m.stock_state === 'OUT' ? 'danger' : 'warning'} />
              </View>
            ))}
          </Card>

          <SectionTitle>{ownOnly ? 'My recent sales' : 'Recent sales'}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data.recent.length === 0 ? <Text style={styles.muted}>No sales yet.</Text> : null}
            {data.recent.map((o) => (
              <View key={o.order_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{o.order_number}</Text>
                  <Text style={styles.muted}>
                    {dateTime(o.created_at)} · {o.customer_name ?? 'Walk-in'} · {o.staff_name}
                  </Text>
                </View>
                <Text style={styles.amount}>{money(o.total_amount - o.refunded_amount)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 12, color: colors.muted, paddingVertical: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
