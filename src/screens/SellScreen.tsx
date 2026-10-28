import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '../components/feedback';
import { FormModal } from '../components/FormModal';
import { useSubmit } from '../components/hooks';
import { SelectField } from '../components/SelectField';
import { Sheet } from '../components/Sheet';
import { Badge, Button, Card, Chip, EmptyState, Field, focusRing, KeyValue, LoadingState, ScreenHeader, SearchBar, SectionTitle, screen, type PressState } from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getOrderDetail, listCustomers, listMedicines, type Medicine } from '../db/repository';
import { dateTime, medicineLabel, money, todayIso } from '../format';
import { useI18n } from '../i18n';
import { can, CASHIER_MAX_DISCOUNT_PERCENT } from '../services/permissions';
import { checkout, PAYMENT_METHODS, recordPrescription, type CheckoutResult, type PaymentMethod } from '../services/sales';
import { getSettings } from '../services/settings';
import { useUser } from '../session';
import { makeStyles, useTheme } from '../theme';

type Line = { medicine: Medicine; quantity: number; prescription_id: number | null; prescription_label: string | null };

export function SellScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data: medicines } = useDbQuery((db) => listMedicines(db, { search }), [search]);
  const { data: customers } = useDbQuery((db) => listCustomers(db));

  const [cart, setCart] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [confirming, setConfirming] = useState(false);
  const [rxFor, setRxFor] = useState<Medicine | null>(null);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const { error, saving, submit, reset } = useSubmit();

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.medicine.selling_price, 0);
  const discountValue = Number(discount.replace(/[\s,]/g, '')) || 0;
  const total = Math.max(subtotal - discountValue, 0);

  const add = (m: Medicine) => {
    const existing = cart.find((l) => l.medicine.medicine_id === m.medicine_id);
    if (existing) return changeQty(m.medicine_id, existing.quantity + 1);
    if (m.requires_prescription) {
      if (!can(user, 'sales.prescription')) return toast(t('sell.rxAskPharmacist', { name: medicineLabel(m) }), 'error');
      return setRxFor(m);
    }
    setCart((c) => [...c, { medicine: m, quantity: 1, prescription_id: null, prescription_label: null }]);
  };

  const changeQty = (medicineId: number, quantity: number) => {
    setCart((c) =>
      c.flatMap((l) => {
        if (l.medicine.medicine_id !== medicineId) return [l];
        if (quantity <= 0) return [];
        if (quantity > l.medicine.sellable_stock) {
          toast(t('sales.onlyAvailable', { count: l.medicine.sellable_stock, name: medicineLabel(l.medicine) }), 'error');
          return [l];
        }
        return [{ ...l, quantity }];
      })
    );
  };

  const openCheckout = () => {
    reset();
    setConfirming(true);
  };

  const confirm = async () => {
    const result = await submit(() =>
      checkout(db, user, {
        customer_id: customerId,
        payment_method: payment,
        discount_amount: discountValue,
        lines: cart.map((l) => ({ medicine_id: l.medicine.medicine_id, quantity: l.quantity, prescription_id: l.prescription_id })),
      })
    );
    if (result) {
      setConfirming(false);
      setCart([]);
      setDiscount('');
      setCustomerId(null);
      setPayment('CASH');
      setReceipt(result);
      toast(t('sell.saleCompleted'));
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={t('sell.title')} subtitle={t('sell.subtitle')} />
      <SearchBar value={search} onChangeText={setSearch} placeholder={t('sell.search')} />
      <Card style={{ paddingVertical: 4 }}>
        {!medicines ? <LoadingState /> : null}
        {medicines?.length === 0 ? <EmptyState icon="search-outline" text={t('medicines.empty')} hint={t('medicines.emptyHint')} /> : null}
        {medicines?.slice(0, search ? 30 : 8).map((m) => {
          const inCart = cart.find((l) => l.medicine.medicine_id === m.medicine_id)?.quantity ?? 0;
          const out = m.sellable_stock - inCart <= 0;
          return (
            <View key={m.medicine_id} style={styles.result}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowGap}>
                  <Text style={styles.name}>{medicineLabel(m)}</Text>
                  {m.requires_prescription ? <Badge label={t('medicine.rx')} tone="info" /> : null}
                </View>
                <Text style={styles.muted}>
                  {money(m.selling_price)} · {m.unit} · {t('stock.available', { count: m.sellable_stock })}
                </Text>
              </View>
              <Button title={out ? t('stock.OUT') : t('common.add')} icon={out ? undefined : 'add'} small disabled={out} onPress={() => add(m)} />
            </View>
          );
        })}
        {!search && (medicines?.length ?? 0) > 8 ? <Text style={styles.more}>{t('sell.typeToSearch', { count: medicines?.length ?? 0 })}</Text> : null}
      </Card>

      <SectionTitle right={cart.length ? <Button title={t('sell.clearCart')} variant="ghost" small onPress={() => setCart([])} /> : undefined}>
        {t('sell.cart', { count: cart.reduce((s, l) => s + l.quantity, 0) })}
      </SectionTitle>
      <Card>
        {cart.length === 0 ? <EmptyState icon="cart-outline" text={t('sales.cartEmpty')} hint={t('sell.cartHint')} /> : null}
        {cart.map((l) => (
          <View key={l.medicine.medicine_id} style={styles.cartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{medicineLabel(l.medicine)}</Text>
              <Text style={styles.muted}>
                {money(l.medicine.selling_price)} {t('sell.each')}{l.prescription_label ? ` · ${t('sell.rxLabel', { label: l.prescription_label })}` : ''}
              </Text>
            </View>
            <View style={styles.stepper}>
              <StepButton label="−" onPress={() => changeQty(l.medicine.medicine_id, l.quantity - 1)} />
              <Text style={styles.qty}>{l.quantity}</Text>
              <StepButton label="+" onPress={() => changeQty(l.medicine.medicine_id, l.quantity + 1)} />
            </View>
            <Text style={styles.lineTotal}>{money(l.quantity * l.medicine.selling_price)}</Text>
          </View>
        ))}
        {cart.length ? (
          <View style={styles.totals}>
            <KeyValue label={t('common.subtotal')} value={money(subtotal)} strong />
          </View>
        ) : null}
      </Card>
      <Button title={t('sell.checkout')} icon="card-outline" onPress={openCheckout} disabled={cart.length === 0} style={{ marginTop: 12 }} />

      <FormModal visible={confirming} title={t('sell.checkout')} submitLabel={t('sell.confirm', { total: money(total) })} onClose={() => setConfirming(false)} onSubmit={confirm} submitting={saving} error={error}>
        <SelectField
          label={t('field.customer')}
          value={customerId ?? 0}
          onChange={(v) => setCustomerId(v || null)}
          options={[{ value: 0, label: t('common.walkInCustomer') }, ...(customers ?? []).map((c) => ({ value: c.customer_id, label: c.full_name, detail: c.phone ?? undefined }))]}
        />
        <Field
          label={t('field.discountMnt')}
          value={discount}
          onChangeText={setDiscount}
          keyboardType="number-pad"
          placeholder="0"
          hint={can(user, 'sales.unlimitedDiscount') ? undefined : t('sell.discountHint', { percent: CASHIER_MAX_DISCOUNT_PERCENT })}
        />
        <Text style={styles.label}>{t('field.paymentMethod')}</Text>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((p) => (
            <Chip key={p} label={t(`payment.${p}`)} active={payment === p} onPress={() => setPayment(p)} />
          ))}
        </View>
        <Card style={{ marginTop: 12 }}>
          {cart.map((l) => (
            <KeyValue key={l.medicine.medicine_id} label={`${medicineLabel(l.medicine)} × ${l.quantity}`} value={money(l.quantity * l.medicine.selling_price)} />
          ))}
          <KeyValue label={t('common.subtotal')} value={money(subtotal)} />
          {discountValue ? <KeyValue label={t('field.discount')} value={`−${money(discountValue)}`} /> : null}
          <KeyValue label={t('common.total')} value={money(total)} strong />
        </Card>
      </FormModal>

      <PrescriptionForm
        medicine={rxFor}
        customerId={customerId}
        onClose={() => setRxFor(null)}
        onSaved={(id, label) => {
          if (rxFor) setCart((c) => [...c, { medicine: rxFor, quantity: 1, prescription_id: id, prescription_label: label }]);
          setRxFor(null);
        }}
      />

      <Receipt result={receipt} onClose={() => setReceipt(null)} />
    </ScrollView>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? t('sell.increase') : t('sell.decrease')}
      onPress={onPress}
      style={(state: PressState) => [styles.step, state.hovered && { backgroundColor: colors.surfaceAlt }, state.pressed && { opacity: 0.6 }, focusRing(colors, state)]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

function PrescriptionForm({
  medicine,
  customerId,
  onClose,
  onSaved,
}: {
  medicine: Medicine | null;
  customerId: number | null;
  onClose: () => void;
  onSaved: (id: number, label: string) => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const [form, setForm] = useState({ patient_name: '', prescriber_name: '', prescription_number: '', issue_date: todayIso() });
  const { errors, error, saving, submit } = useSubmit();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const id = await submit(() => recordPrescription(db, user, { ...form, customer_id: customerId }));
    if (id) {
      onSaved(id, `${form.prescriber_name}${form.prescription_number ? ` #${form.prescription_number}` : ''}`);
      setForm({ patient_name: '', prescriber_name: '', prescription_number: '', issue_date: todayIso() });
    }
  };

  return (
    <FormModal visible={!!medicine} title={t('rx.title')} submitLabel={t('rx.submit')} onClose={onClose} onSubmit={save} submitting={saving} error={error}>
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        {t('rx.intro', { name: medicine ? medicineLabel(medicine) : '', user: user.full_name })}
      </Text>
      <Field label={t('field.patientName')} value={form.patient_name} onChangeText={set('patient_name')} error={errors.patient_name} />
      <Field label={t('rx.prescriber')} value={form.prescriber_name} onChangeText={set('prescriber_name')} error={errors.prescriber_name} />
      <Field label={t('rx.number')} value={form.prescription_number} onChangeText={set('prescription_number')} error={errors.prescription_number} />
      <Field label={t('field.issueDate')} value={form.issue_date} onChangeText={set('issue_date')} error={errors.issue_date} placeholder={t('common.datePlaceholder')} />
    </FormModal>
  );
}

function Receipt({ result, onClose }: { result: CheckoutResult | null; onClose: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const { data } = useDbQuery(
    async (db) => (result ? { detail: await getOrderDetail(db, result.order_id), settings: await getSettings(db) } : null),
    [result?.order_id]
  );
  const detail = data?.detail;
  return (
    <Sheet visible={!!result} title={t('sell.saleComplete')} subtitle={result?.order_number} onClose={onClose} footer={<Button title={t('sell.newSale')} onPress={onClose} style={{ flex: 1 }} />}>
      {detail ? (
        <Card>
          <Text style={styles.receiptTitle}>{data?.settings.pharmacy_name}</Text>
          <Text style={styles.receiptMeta}>
            {detail.order.order_number} · {dateTime(detail.order.completed_at)}
          </Text>
          <Text style={styles.receiptMeta}>
            {t('receipt.servedBy', { name: detail.order.staff_name })} · {detail.order.customer_name ?? t('common.walkIn')}
          </Text>
          <View style={styles.divider} />
          {detail.lines.map((l) => (
            <KeyValue key={l.order_item_id} label={`${l.label} × ${l.quantity}`} value={money(l.line_total)} />
          ))}
          <View style={styles.divider} />
          <KeyValue label={t('common.subtotal')} value={money(detail.order.subtotal)} />
          {detail.order.discount_amount ? <KeyValue label={t('field.discount')} value={`−${money(detail.order.discount_amount)}`} /> : null}
          <KeyValue label={t('receipt.paid', { method: t(`payment.${detail.order.payment_method as PaymentMethod}`) })} value={money(detail.order.total_amount)} strong />
          <Text style={styles.receiptFooter}>{data?.settings.receipt_footer}</Text>
        </Card>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted },
  more: { textAlign: 'center', color: colors.muted, paddingVertical: 10, fontSize: 13 },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stepText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  qty: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text },
  lineTotal: { minWidth: 76, textAlign: 'right', fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  totals: { paddingTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  receiptTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', color: colors.text },
  receiptMeta: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  receiptFooter: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
}));
