import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Animated, FlatList, Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '../components/Text';
import { useToast } from '../components/feedback';
import { FormModal } from '../components/FormModal';
import { FormGlyph } from '../components/brand';
import { animateNextLayout, Enter, usePop, usePresence } from '../components/motion';
import { useSubmit } from '../components/hooks';
import { SelectField } from '../components/SelectField';
import { Sheet } from '../components/Sheet';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Field, focusRing, Icon, KeyValue, LoadingState, PressableScale, ScreenHeader, SearchBar, Segmented, screen, type PressState } from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getOrderDetail, listCustomers, listMedicines, type Medicine } from '../db/repository';
import { dateTime, medicineLabel, money, todayIso } from '../format';
import { useI18n } from '../i18n';
import { can, CASHIER_MAX_DISCOUNT_PERCENT } from '../services/permissions';
import { checkout, PAYMENT_METHODS, recordPrescription, type CheckoutResult, type PaymentMethod } from '../services/sales';
import { getSettings } from '../services/settings';
import { useUser } from '../session';
import { makeStyles, radius, radiusLg, useTheme } from '../theme';

type Line = { medicine: Medicine; quantity: number; prescription_id: number | null; prescription_label: string | null };

export function SellScreen() {
  const { t, tn } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const compact = width < 440;
  const db = useSQLiteContext();
  const user = useUser();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data: medicines, error: catalogError } = useDbQuery((db) => listMedicines(db, { search }), [search]);
  const { data: customers } = useDbQuery((db) => listCustomers(db));

  const [pane, setPane] = useState<'catalog' | 'cart'>('catalog');
  const [cart, setCart] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('CASH');
  const [confirming, setConfirming] = useState(false);
  const [rxFor, setRxFor] = useState<Medicine | null>(null);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const { errors, error, saving, submit, reset } = useSubmit();
  const checkoutPending = useRef(false);

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.medicine.selling_price, 0);
  const discountValue = Number(discount.replace(/[\s,₮]/g, ''));
  const displayDiscount = Number.isInteger(discountValue) && discountValue > 0 ? discountValue : 0;
  const total = Math.max(subtotal - displayDiscount, 0);

  const add = (m: Medicine) => {
    const existing = cart.find((l) => l.medicine.medicine_id === m.medicine_id);
    if (existing) return changeQty(m.medicine_id, existing.quantity + 1);
    if (m.requires_prescription) {
      if (!can(user, 'sales.prescription')) return toast(t('sell.rxAskPharmacist', { name: medicineLabel(m) }), 'error');
      return setRxFor(m);
    }
    animateNextLayout();
    setCart((c) => [...c, { medicine: m, quantity: 1, prescription_id: null, prescription_label: null }]);
  };

  const changeQty = (medicineId: number, quantity: number) => {
    if (quantity <= 0) animateNextLayout();
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

  const clearCart = () => {
    animateNextLayout();
    setCart([]);
  };

  const openCheckout = () => {
    reset();
    setConfirming(true);
  };

  const confirm = async () => {
    if (checkoutPending.current) return;
    checkoutPending.current = true;
    try {
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
        setPane('catalog');
        setReceipt(result);
        toast(t('sell.saleCompleted'));
      }
    } finally {
      checkoutPending.current = false;
    }
  };

  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  const products = (
    <View style={[styles.panel, styles.catalog]}>
      <View style={styles.catalogHead}>
        {wide ? (
          <View style={styles.panelHeading}>
            <Icon name="medkit-outline" size={20} color={colors.primary} />
            <Text accessibilityRole="header" style={styles.panelTitle}>{t('sell.catalog')}</Text>
            {medicines ? <Text style={styles.muted}>{tn('count.medicines', medicines.length)}</Text> : null}
          </View>
        ) : null}
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('sell.search')} />
        {catalogError ? <ErrorBanner message={catalogError} /> : null}
      </View>
      <FlatList
        data={medicines}
        keyExtractor={(medicine) => String(medicine.medicine_id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.results, !wide && cart.length > 0 && styles.barSpace]}
        ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
        ListEmptyComponent={medicines
          ? <EmptyState icon="search-outline" text={t('medicines.empty')} hint={t('medicines.emptyHint')} />
          : !catalogError ? <LoadingState rows={4} /> : undefined}
        renderItem={({ item: m }) => {
          const inCart = cart.find((line) => line.medicine.medicine_id === m.medicine_id)?.quantity ?? 0;
          const left = m.sellable_stock - inCart;
          return (
            <View style={styles.result}>
              <FormGlyph form={m.dosage_form} size={36} rx={!!m.requires_prescription} />
              <View style={styles.productInfo}>
                <View style={styles.rowGap}>
                  <Text style={styles.name}>{medicineLabel(m)}</Text>
                  {m.requires_prescription ? <Badge label={t('medicine.rx')} tone="rx" /> : null}
                </View>
                <View style={styles.productMeta}>
                  {compact ? <Text style={styles.price}>{money(m.selling_price)}</Text> : null}
                  <Text style={styles.muted}>{left > 0 ? t('stock.available', { count: left }) : t('stock.OUT')}</Text>
                </View>
                {compact && inCart > 0 ? <Text style={styles.inCart}>{t('sell.inCart', { count: inCart })}</Text> : null}
              </View>
              {!compact ? (
                <View style={styles.priceCol}>
                  <Text style={styles.price}>{money(m.selling_price)}</Text>
                  {inCart > 0 ? <Text style={styles.inCart}>{t('sell.inCart', { count: inCart })}</Text> : null}
                </View>
              ) : null}
              <Button title={t('common.add')} icon="add" small variant={inCart ? 'secondary' : 'primary'} disabled={left <= 0} onPress={() => add(m)} style={styles.addButton} />
            </View>
          );
        }}
      />
    </View>
  );

  const cartList = (
    <View style={[styles.panel, styles.cartColumn, !wide && styles.mobileCart]}>
      {wide || cart.length > 0 ? (
        <View style={[styles.cartHead, styles.rowDividerBottom]}>
          {wide ? <Icon name="cart-outline" size={22} color={colors.primary} /> : null}
          {wide ? <Text accessibilityRole="header" style={styles.panelTitle}>{t('sell.cart', { count: itemCount })}</Text> : <View style={{ flex: 1 }} />}
          {cart.length > 0 ? <Button title={t('sell.clearCart')} variant="ghost" icon="trash-outline" small onPress={clearCart} /> : null}
        </View>
      ) : null}
      <ScrollView contentContainerStyle={!wide && cart.length > 0 && styles.barSpace} keyboardShouldPersistTaps="handled">
        {cart.length === 0 ? (
          <EmptyState icon="cart-outline" text={t('sales.cartEmpty')} hint={t('sell.cartHint')} />
        ) : cart.map((l, i) => (
          <Enter key={l.medicine.medicine_id} offset={-6} style={[styles.cartRow, i > 0 && styles.rowDivider]}>
            <View style={styles.cartProduct}>
              <Text style={styles.name}>{medicineLabel(l.medicine)}</Text>
              <Text style={styles.muted}>
                {money(l.medicine.selling_price)} {t('sell.each')}
                {l.prescription_label ? ` · ${t('sell.rxLabel', { label: l.prescription_label })}` : ''}
              </Text>
            </View>
            <View style={styles.cartLineActions}>
              <View style={styles.stepper}>
                <StepButton label="−" onPress={() => changeQty(l.medicine.medicine_id, l.quantity - 1)} />
                <Quantity value={l.quantity} />
                <StepButton label="+" onPress={() => changeQty(l.medicine.medicine_id, l.quantity + 1)} />
              </View>
              <Text style={styles.lineTotal}>{money(l.quantity * l.medicine.selling_price)}</Text>
            </View>
          </Enter>
        ))}
      </ScrollView>
      {wide ? (
        <View style={[styles.cartFooter, styles.rowDivider]}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>{t('common.subtotal')}</Text>
            <Text style={styles.footerTotal}>{money(subtotal)}</Text>
          </View>
          <Button title={t('sell.checkout')} icon="card-outline" onPress={openCheckout} disabled={cart.length === 0} />
        </View>
      ) : null}
    </View>
  );

  const dialogs = (
    <>
      <FormModal
        visible={confirming}
        title={t('sell.checkout')}
        submitLabel={t('sell.confirm', { total: money(total) })}
        onClose={() => { if (!checkoutPending.current) setConfirming(false); }}
        onSubmit={confirm}
        submitting={saving}
        error={error}
      >
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
          error={errors.discount_amount}
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
          {displayDiscount ? <KeyValue label={t('field.discount')} value={`−${money(displayDiscount)}`} /> : null}
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
    </>
  );

  return (
    <View style={[screen.content, styles.workspace]}>
      <ScreenHeader title={t('sell.title')} subtitle={wide ? t('sell.subtitle') : undefined} />
      {wide ? <View style={styles.split}>{products}{cartList}</View> : (
        <>
          <Segmented options={[
            ['catalog', t('sell.catalog')],
            ['cart', t('sell.cart', { count: itemCount })],
          ]} value={pane} onChange={setPane} />
          <View style={[styles.pane, pane !== 'catalog' && styles.hidden]}>{products}</View>
          <View style={[styles.pane, pane !== 'cart' && styles.hidden]}>{cartList}</View>
          <CheckoutBar visible={cart.length > 0} count={itemCount} subtotal={subtotal} onPress={openCheckout} />
        </>
      )}
      {dialogs}
    </View>
  );
}

/** The phone's pinned checkout bar: item count and subtotal, one tap to pay. Slides up with the first item. */
function CheckoutBar({ visible, count, subtotal, onPress }: { visible: boolean; count: number; subtotal: number; onPress: () => void }) {
  const { t, tn } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  const { mounted, progress, reduce } = usePresence(visible, 'spring');
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.barWrap, { opacity: progress, transform: reduce ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }] }]}
    >
      <PressableScale accessibilityRole="button" accessibilityLabel={`${t('sell.checkout')}, ${money(subtotal)}`} onPress={onPress} pressScale={0.98} style={styles.bar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.barCount}>{tn('sell.cartBar', count)}</Text>
          <Text style={styles.barTotal}>{money(subtotal)}</Text>
        </View>
        <View style={styles.barAction}>
          <Text style={styles.barActionText}>{t('sell.checkout')}</Text>
          <Icon name="arrow-forward" size={18} color={colors.onPrimary} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/** Cart quantity; pops briefly when it changes. */
function Quantity({ value }: { value: number }) {
  const styles = useStyles();
  const pop = usePop(value);
  return (
    <Animated.View style={pop}>
      <Text style={styles.qty}>{value}</Text>
    </Animated.View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? t('sell.increase') : t('sell.decrease')}
      onPress={onPress}
      pressScale={0.85}
      style={(state: PressState) => [styles.step, state.hovered && { backgroundColor: colors.surfaceAlt }, state.pressed && { backgroundColor: colors.surfaceAlt }, focusRing(colors, state)]}
    >
      <Text style={styles.stepText}>{label}</Text>
    </PressableScale>
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
  const { data, error } = useDbQuery(
    async (db) => (result ? { detail: await getOrderDetail(db, result.order_id), settings: await getSettings(db) } : null),
    [result?.order_id]
  );
  const detail = data?.detail;
  return (
    <Sheet visible={!!result} title={t('sell.saleComplete')} subtitle={result?.order_number} onClose={onClose} footer={<Button title={t('sell.newSale')} onPress={onClose} style={{ flex: 1 }} />}>
      {error ? <ErrorBanner message={error} /> : null}
      {!detail && !error ? <LoadingState rows={1} /> : null}
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
  workspace: { flex: 1, minHeight: 0, paddingBottom: 16 },
  split: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 18 },
  pane: { flex: 1, minHeight: 0 },
  hidden: { display: 'none' },
  panel: { borderWidth: 1, borderColor: colors.border, borderRadius: radiusLg, backgroundColor: colors.surface, overflow: 'hidden' },
  catalog: { flex: 1, minWidth: 0, minHeight: 0 },
  catalogHead: { paddingHorizontal: 14, paddingTop: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  panelHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  panelTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  results: { paddingHorizontal: 12, paddingBottom: 8 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, minHeight: 64 },
  productInfo: { flex: 1, minWidth: 0, gap: 3 },
  productMeta: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted },
  priceCol: { alignItems: 'flex-end', gap: 2 },
  price: { fontSize: 15, fontWeight: '600', color: colors.text },
  inCart: { fontSize: 12, fontWeight: '600', color: colors.primary },
  addButton: { minHeight: 40 },
  cartColumn: { width: 360, minHeight: 0 },
  mobileCart: { width: '100%', flex: 1 },
  cartHead: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  cartRow: { gap: 8, paddingHorizontal: 14, paddingVertical: 11 },
  cartProduct: { gap: 2 },
  cartLineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  rowDividerBottom: { borderBottomWidth: 1, borderBottomColor: colors.border },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius, backgroundColor: colors.surfaceAlt },
  step: { width: 44, height: 40, borderRadius: radius, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '600', color: colors.primary },
  qty: { minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.text },
  lineTotal: { textAlign: 'right', fontSize: 16, fontWeight: '600', color: colors.text },
  subtotalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  subtotalLabel: { fontSize: 14, color: colors.muted },
  footerTotal: { fontSize: 22, fontWeight: '600', color: colors.text, letterSpacing: -0.4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  receiptTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', color: colors.text },
  receiptMeta: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  receiptFooter: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  cartFooter: { padding: 14, gap: 12, backgroundColor: colors.surfaceAlt },
  barSpace: { paddingBottom: 86 },
  barWrap: { position: 'absolute', left: 22, right: 22, bottom: 22 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radiusLg,
    backgroundColor: colors.primary,
    elevation: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 30px rgba(10, 60, 35, 0.28)', cursor: 'pointer' } as object) : null),
  },
  barCount: { fontSize: 12, color: colors.onPrimary, opacity: 0.85 },
  barTotal: { fontSize: 19, fontWeight: '600', color: colors.onPrimary },
  barAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barActionText: { fontSize: 15, fontWeight: '600', color: colors.onPrimary },
}));
