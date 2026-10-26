import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormModal } from '../../components/FormModal';
import { useSubmit } from '../../components/hooks';
import { Sheet } from '../../components/Sheet';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Field, KeyValue, ListItem, SearchBar, SectionTitle, ToggleField, type BadgeTone } from '../../components/ui';
import { useDbQuery } from '../../db/DataContext';
import { getOrderDetail, listOrders, type OrderLine, type OrderStatus } from '../../db/repository';
import { dateTime, money } from '../../format';
import { can } from '../../services/permissions';
import { refundOrder } from '../../services/sales';
import { useUser } from '../../session';
import { colors } from '../../theme';

export const orderTone: Record<OrderStatus, BadgeTone> = { PENDING: 'warning', COMPLETED: 'success', CANCELLED: 'neutral', REFUNDED: 'danger' };

const STATUSES: (OrderStatus | 'all')[] = ['all', 'COMPLETED', 'REFUNDED', 'PENDING', 'CANCELLED'];
const PERIODS: [number | null, string][] = [
  [1, 'Today'],
  [7, '7 days'],
  [30, '30 days'],
  [null, 'All time'],
];

export function OrdersScreen() {
  const user = useUser();
  const ownOnly = !can(user, 'orders.viewAll');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [days, setDays] = useState<number | null>(30);
  const [search, setSearch] = useState('');
  const { data: orders, error } = useDbQuery(
    (db) => listOrders(db, { status, days, search, userId: ownOnly ? user.user_id : null }),
    [status, days, search, ownOnly, user.user_id]
  );
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search order number or customer…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map(([d, label]) => (
          <Chip key={label} label={label} active={days === d} onPress={() => setDays(d)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STATUSES.map((s) => (
          <Chip key={s} label={s.toLowerCase()} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </ScrollView>
      {ownOnly ? <Text style={[styles.muted, { marginBottom: 8 }]}>Showing your own sales.</Text> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {orders?.length === 0 ? <EmptyState text="No orders in this view." /> : null}
      {orders?.map((o) => (
        <ListItem key={o.order_id} onPress={() => setSelected(o.order_id)}>
          <View style={styles.top}>
            <Text style={styles.name}>{o.order_number}</Text>
            <View style={{ flex: 1 }} />
            <Badge label={o.status === 'COMPLETED' && o.refunded_amount ? 'Part refunded' : o.status.toLowerCase()} tone={o.refunded_amount ? 'warning' : orderTone[o.status]} />
          </View>
          <View style={styles.top}>
            <Text style={styles.muted}>
              {dateTime(o.created_at)} · {o.customer_name ?? 'Walk-in'} · {o.item_count} item(s) · {o.staff_name}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.amount}>{money(o.total_amount - o.refunded_amount)}</Text>
          </View>
        </ListItem>
      ))}
      <OrderDetail orderId={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function OrderDetail({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const user = useUser();
  const { data } = useDbQuery((db) => (orderId === null ? Promise.resolve(null) : getOrderDetail(db, orderId)), [orderId]);
  const [refunding, setRefunding] = useState(false);
  const order = data?.order;
  const canRefund = can(user, 'sales.refund') && order?.status === 'COMPLETED';

  return (
    <Sheet
      visible={orderId !== null && !!order}
      title={order?.order_number ?? ''}
      subtitle={order ? `${order.status.toLowerCase()} · ${dateTime(order.completed_at ?? order.created_at)}` : undefined}
      onClose={onClose}
      footer={canRefund ? <Button title="Refund items" variant="danger" onPress={() => setRefunding(true)} style={{ flex: 1 }} /> : undefined}
    >
      {order && data ? (
        <>
          <Card>
            <KeyValue label="Customer" value={order.customer_name ?? 'Walk-in'} />
            <KeyValue label="Served by" value={order.staff_name} />
            <KeyValue label="Payment" value={`${order.payment_method ?? '—'} · ${order.payment_status.replace('_', ' ').toLowerCase()}`} />
            <KeyValue label="Subtotal" value={money(order.subtotal)} />
            {order.discount_amount ? <KeyValue label="Discount" value={`−${money(order.discount_amount)}`} /> : null}
            <KeyValue label="Total paid" value={money(order.total_amount)} strong />
            {order.refunded_amount ? <KeyValue label="Refunded" value={`−${money(order.refunded_amount)}`} /> : null}
            {order.notes ? <Text style={[styles.muted, { marginTop: 6 }]}>{order.notes}</Text> : null}
          </Card>
          <SectionTitle>Items</SectionTitle>
          {data.lines.map((l) => (
            <Card key={l.order_item_id} style={{ marginBottom: 6, paddingVertical: 10 }}>
              <View style={styles.top}>
                <Text style={styles.name}>
                  {l.label} × {l.quantity}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.amount}>{money(l.line_total)}</Text>
              </View>
              <Text style={styles.muted}>
                {money(l.unit_price)} each · batches: {l.batches ?? '—'}
                {l.quantity_returned ? ` · ${l.quantity_returned} returned` : ''}
                {l.prescriber_name ? ` · Rx by ${l.prescriber_name}` : ''}
              </Text>
            </Card>
          ))}
          {refunding ? <RefundForm orderId={order.order_id} lines={data.lines} onClose={() => setRefunding(false)} /> : null}
        </>
      ) : null}
    </Sheet>
  );
}

function RefundForm({ orderId, lines, onClose }: { orderId: number; lines: OrderLine[]; onClose: () => void }) {
  const db = useSQLiteContext();
  const user = useUser();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const { error, saving, submit } = useSubmit();

  const save = async () => {
    const done = await submit(() =>
      refundOrder(db, user, {
        order_id: orderId,
        reason,
        restock,
        lines: lines.map((l) => ({ order_item_id: l.order_item_id, quantity: Number(qty[l.order_item_id] || 0) })),
      })
    );
    if (done) onClose();
  };

  return (
    <FormModal visible title="Refund" submitLabel="Refund" onClose={onClose} onSubmit={save} submitting={saving} error={error}>
      {lines.map((l) => {
        const open = l.quantity - l.quantity_returned;
        return (
          <Field
            key={l.order_item_id}
            label={`${l.label} (up to ${open})`}
            value={qty[l.order_item_id] ?? ''}
            onChangeText={(v) => setQty((q) => ({ ...q, [l.order_item_id]: v }))}
            keyboardType="number-pad"
            placeholder="0"
            editable={open > 0}
          />
        );
      })}
      <Field label="Reason (required)" value={reason} onChangeText={setReason} placeholder="Wrong item, unopened, …" />
      <ToggleField label="Put back on the shelf" value={restock} onChange={setRestock} hint="Turn off if the returned items can't be resold — they will be written off." />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
