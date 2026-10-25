import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmAction, useToast } from '../components/feedback';
import { FormModal } from '../components/FormModal';
import { SelectField } from '../components/SelectField';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Field, ScreenHeader, screen, type BadgeTone } from '../components/ui';
import { useDataChange, useDbQuery } from '../db/DataContext';
import { friendlyError } from '../db/errors';
import {
  createOrder,
  deleteOrder,
  listCustomers,
  listOrders,
  listProducts,
  NEXT_STATUSES,
  ORDER_STATUSES,
  setOrderStatus,
  type Order,
  type OrderStatus,
} from '../db/repository';
import { money, shortDate } from '../format';
import { colors } from '../theme';
import { parseQuantity } from '../validation';

const statusTone: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
};

const actionLabel: Record<OrderStatus, string> = {
  pending: 'Pending',
  shipped: 'Mark shipped',
  delivered: 'Mark delivered',
  cancelled: 'Cancel',
};

type OrderForm = { customer_id: number | null; product_id: number | null; quantity: string };
const emptyForm: OrderForm = { customer_id: null, product_id: null, quantity: '1' };

export function OrdersScreen() {
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const toast = useToast();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const { data: orders, error } = useDbQuery((db) => listOrders(db, filter), [filter]);
  const { data: customers } = useDbQuery((db) => listCustomers(db));
  const { data: products } = useDbQuery((db) => listProducts(db));

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof OrderForm, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const product = products?.find((p) => p.id === form.product_id);
  const quantity = parseQuantity(form.quantity);

  const openNew = () => {
    setForm(emptyForm);
    setErrors({});
    setSaveError(null);
    setCreating(true);
  };

  const save = async () => {
    const next: typeof errors = {};
    if (form.customer_id === null) next.customer_id = 'Choose a customer.';
    if (form.product_id === null) next.product_id = 'Choose a product.';
    if (quantity === null) next.quantity = 'Enter a whole number greater than 0.';
    else if (product && quantity > product.quantity) next.quantity = `Only ${product.quantity} in stock.`;
    setErrors(next);
    if (Object.keys(next).length || quantity === null) return;

    setSaving(true);
    setSaveError(null);
    try {
      await createOrder(db, { customer_id: form.customer_id!, product_id: form.product_id!, quantity });
      notifyChange();
      toast('Order created and stock updated');
      setCreating(false);
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (order: Order, status: OrderStatus) => {
    if (status === 'cancelled' && !(await confirmAction('Cancel order?', `Order #${order.id} will be cancelled and its stock returned.`, 'Cancel order'))) {
      return;
    }
    try {
      await setOrderStatus(db, order, status);
      notifyChange();
      toast(`Order #${order.id} is now ${status}`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const remove = async (order: Order) => {
    if (!(await confirmAction('Delete order?', `Order #${order.id} will be permanently removed.`))) return;
    try {
      await deleteOrder(db, order);
      notifyChange();
      toast(`Deleted order #${order.id}`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.content}>
      <ScreenHeader
        title="Orders"
        subtitle={orders ? `${orders.length} order(s)` : undefined}
        action={<Button title="+ New order" onPress={openNew} />}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(['all', ...ORDER_STATUSES] as const).map((s) => (
          <Chip key={s} label={s} active={filter === s} onPress={() => setFilter(s)} />
        ))}
      </ScrollView>
      {error ? <ErrorBanner message={error} /> : null}
      {orders?.length === 0 ? <EmptyState text="No orders in this view." /> : null}

      <View style={{ gap: 8 }}>
        {orders?.map((o) => (
          <Card key={o.id}>
            <View style={styles.top}>
              <Text style={styles.id}>#{o.id}</Text>
              <Text style={styles.date}>{shortDate(o.created_at)}</Text>
              <View style={{ flex: 1 }} />
              <Badge label={o.status} tone={statusTone[o.status]} />
            </View>
            <Text style={styles.line}>
              {o.customer_name} · {o.product_name} × {o.quantity}
            </Text>
            <View style={styles.bottom}>
              <Text style={styles.total}>{money(o.total)}</Text>
              <View style={{ flex: 1 }} />
              {NEXT_STATUSES[o.status].map((s) => (
                <Button
                  key={s}
                  small
                  title={actionLabel[s]}
                  variant={s === 'cancelled' ? 'secondary' : 'primary'}
                  onPress={() => changeStatus(o, s)}
                />
              ))}
              <Button small title="Delete" variant="danger" onPress={() => remove(o)} />
            </View>
          </Card>
        ))}
      </View>

      <FormModal
        visible={creating}
        title="New order"
        submitLabel="Create order"
        onClose={() => setCreating(false)}
        onSubmit={save}
        submitting={saving}
        error={saveError}
      >
        <SelectField
          label="Customer"
          value={form.customer_id}
          onChange={(customer_id) => setForm((f) => ({ ...f, customer_id }))}
          error={errors.customer_id}
          options={(customers ?? []).map((c) => ({ value: c.id, label: c.name, detail: c.email }))}
        />
        <SelectField
          label="Product"
          value={form.product_id}
          onChange={(product_id) => setForm((f) => ({ ...f, product_id }))}
          error={errors.product_id}
          options={(products ?? []).map((p) => ({
            value: p.id,
            label: p.name,
            detail: `${money(p.price)} · ${p.quantity} in stock`,
            disabled: p.quantity === 0,
          }))}
        />
        <Field
          label="Quantity"
          value={form.quantity}
          onChangeText={(q) => setForm((f) => ({ ...f, quantity: q }))}
          error={errors.quantity}
          keyboardType="number-pad"
          hint={product ? `${product.quantity} available` : undefined}
        />
        <Card style={styles.summary}>
          <Text style={styles.summaryLabel}>Order total</Text>
          <Text style={styles.summaryValue}>{product && quantity ? money(product.price * quantity) : '—'}</Text>
        </Card>
      </FormModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 8, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  id: { fontSize: 15, fontWeight: '700', color: colors.text },
  date: { fontSize: 13, color: colors.muted },
  line: { fontSize: 15, color: colors.text, marginVertical: 8 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  total: { fontSize: 16, fontWeight: '700', color: colors.text },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  summaryLabel: { color: colors.primary, fontWeight: '600' },
  summaryValue: { color: colors.primary, fontWeight: '700', fontSize: 18 },
});
