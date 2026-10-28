import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useToast } from '../../components/feedback';
import { FormModal } from '../../components/FormModal';
import { useSubmit } from '../../components/hooks';
import { Sheet } from '../../components/Sheet';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Field, KeyValue, ListItem, LoadingState, SearchBar, SectionTitle, ToggleField, type BadgeTone } from '../../components/ui';
import { useDbQuery } from '../../db/DataContext';
import { getOrderDetail, listOrders, type OrderLine, type OrderStatus } from '../../db/repository';
import { dateTime, money } from '../../format';
import { useI18n, type TranslationKey } from '../../i18n';
import { can } from '../../services/permissions';
import { refundOrder } from '../../services/sales';
import { useUser } from '../../session';
import { makeStyles } from '../../theme';

export const orderTone: Record<OrderStatus, BadgeTone> = { PENDING: 'warning', COMPLETED: 'success', CANCELLED: 'neutral', REFUNDED: 'danger' };

const STATUSES: (OrderStatus | 'all')[] = ['all', 'COMPLETED', 'REFUNDED', 'PENDING', 'CANCELLED'];
const PERIODS: [number | null, TranslationKey][] = [
  [1, 'period.today'],
  [7, 'period.7d'],
  [30, 'period.30d'],
  [null, 'period.all'],
];

export function OrdersScreen() {
  const { t, tn } = useI18n();
  const styles = useStyles();
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
      <SearchBar value={search} onChangeText={setSearch} placeholder={t('orders.search')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map(([d, label]) => (
          <Chip key={d ?? 'all'} label={t(label)} active={days === d} onPress={() => setDays(d)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {STATUSES.map((s) => (
          <Chip key={s} label={s === 'all' ? t('common.all') : t(`order.${s}`)} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </ScrollView>
      {ownOnly ? <Text style={[styles.muted, { marginBottom: 8 }]}>{t('orders.ownOnly')}</Text> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {!orders && !error ? <LoadingState /> : null}
      {orders?.length === 0 ? <EmptyState icon="receipt-outline" text={t('orders.empty')} hint={t('orders.emptyHint')} /> : null}
      {orders?.map((o) => (
        <ListItem key={o.order_id} onPress={() => setSelected(o.order_id)}>
          <View style={styles.top}>
            <Text style={styles.name}>{o.order_number}</Text>
            <View style={{ flex: 1 }} />
            <Badge label={o.status === 'COMPLETED' && o.refunded_amount ? t('order.partRefunded') : t(`order.${o.status}`)} tone={o.refunded_amount ? 'warning' : orderTone[o.status]} />
          </View>
          <View style={styles.top}>
            <Text style={styles.muted}>
              {dateTime(o.created_at)} · {o.customer_name ?? t('common.walkIn')} · {tn('count.items', o.item_count)} · {o.staff_name}
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
  const { t } = useI18n();
  const styles = useStyles();
  const user = useUser();
  const { data } = useDbQuery((db) => (orderId === null ? Promise.resolve(null) : getOrderDetail(db, orderId)), [orderId]);
  const [refunding, setRefunding] = useState(false);
  const order = data?.order;
  const canRefund = can(user, 'sales.refund') && order?.status === 'COMPLETED';

  return (
    <Sheet
      visible={orderId !== null && !!order}
      title={order?.order_number ?? ''}
      subtitle={order ? `${t(`order.${order.status}`)} · ${dateTime(order.completed_at ?? order.created_at)}` : undefined}
      onClose={onClose}
      footer={canRefund ? <Button title={t('orders.refundItems')} variant="danger" onPress={() => setRefunding(true)} style={{ flex: 1 }} /> : undefined}
    >
      {order && data ? (
        <>
          <Card>
            <KeyValue label={t('field.customer')} value={order.customer_name ?? t('common.walkIn')} />
            <KeyValue label={t('orders.servedBy')} value={order.staff_name} />
            <KeyValue
              label={t('field.payment')}
              value={`${order.payment_method ? t(`payment.${order.payment_method as 'CASH'}`) : '—'} · ${t(`paymentStatus.${order.payment_status as 'PAID'}`)}`}
            />
            <KeyValue label={t('common.subtotal')} value={money(order.subtotal)} />
            {order.discount_amount ? <KeyValue label={t('field.discount')} value={`−${money(order.discount_amount)}`} /> : null}
            <KeyValue label={t('orders.totalPaid')} value={money(order.total_amount)} strong />
            {order.refunded_amount ? <KeyValue label={t('orders.refunded')} value={`−${money(order.refunded_amount)}`} /> : null}
            {order.notes ? <Text style={[styles.muted, { marginTop: 6 }]}>{order.notes}</Text> : null}
          </Card>
          <SectionTitle>{t('orders.items')}</SectionTitle>
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
                {money(l.unit_price)} {t('sell.each')} · {t('orders.batches', { batches: l.batches ?? '—' })}
                {l.quantity_returned ? ` · ${t('orders.returned', { count: l.quantity_returned })}` : ''}
                {l.prescriber_name ? ` · ${t('orders.rxBy', { name: l.prescriber_name })}` : ''}
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
  const { t } = useI18n();
  const toast = useToast();
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
    if (done) {
      onClose();
      toast(t('orders.refundDone'));
    }
  };

  return (
    <FormModal visible title={t('orders.refundTitle')} submitLabel={t('orders.refund')} onClose={onClose} onSubmit={save} submitting={saving} error={error}>
      {lines.map((l) => {
        const open = l.quantity - l.quantity_returned;
        return (
          <Field
            key={l.order_item_id}
            label={t('orders.refundQty', { label: l.label, max: open })}
            value={qty[l.order_item_id] ?? ''}
            onChangeText={(v) => setQty((q) => ({ ...q, [l.order_item_id]: v }))}
            keyboardType="number-pad"
            placeholder="0"
            editable={open > 0}
          />
        );
      })}
      <Field label={t('field.reasonRequired')} value={reason} onChangeText={setReason} placeholder={t('orders.reasonPlaceholder')} />
      <ToggleField label={t('orders.restock')} value={restock} onChange={setRestock} hint={t('orders.restockHint')} />
    </FormModal>
  );
}

const useStyles = makeStyles((colors) => ({
  chips: { gap: 8, paddingBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
}));
