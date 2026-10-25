import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DataTable } from '../components/DataTable';
import { Badge, Card, ErrorBanner, ScreenHeader, SectionTitle, screen } from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getDashboard, LOW_STOCK_THRESHOLD } from '../db/repository';
import { DATABASE_NAME } from '../db/schema';
import { money, shortDate } from '../format';
import { colors } from '../theme';

export function HomeScreen() {
  const { data, error } = useDbQuery(getDashboard);

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader title="Overview" subtitle={`Live figures from the local SQLite file "${DATABASE_NAME}"`} />
      {error ? <ErrorBanner message={error} /> : null}
      {data ? (
        <>
          <View style={styles.grid}>
            <Stat label="Products" value={String(data.stats.products)} />
            <Stat label="Customers" value={String(data.stats.customers)} />
            <Stat label="Orders" value={String(data.stats.orders)} note={`${data.stats.pending} pending`} />
            <Stat label="Revenue" value={money(data.stats.revenue)} note="excl. cancelled" />
            <Stat label="Stock value" value={money(data.stats.inventoryValue)} />
          </View>

          <SectionTitle>Low stock (≤ {LOW_STOCK_THRESHOLD})</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data.lowStock.length === 0 ? (
              <Text style={styles.muted}>All products are well stocked.</Text>
            ) : (
              data.lowStock.map((p) => (
                <View key={p.id} style={styles.lowRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.muted}>{p.sku}</Text>
                  </View>
                  <Badge label={p.quantity === 0 ? 'Out of stock' : `${p.quantity} left`} tone={p.quantity === 0 ? 'danger' : 'warning'} />
                </View>
              ))
            )}
          </Card>

          <SectionTitle>Recent orders</SectionTitle>
          <DataTable
            columns={['#', 'Date', 'Customer', 'Product', 'Qty', 'Total', 'Status']}
            rows={data.recentOrders.map((o) => [
              o.id,
              shortDate(o.created_at),
              o.customer_name,
              o.product_name,
              o.quantity,
              money(o.total),
              o.status,
            ])}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {note ? <Text style={styles.muted}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: 150 },
  statLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginVertical: 4 },
  lowRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  muted: { fontSize: 12, color: colors.muted, paddingVertical: 2 },
});
