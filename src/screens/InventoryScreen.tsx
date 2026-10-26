import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmAction } from '../components/feedback';
import { FormModal } from '../components/FormModal';
import { useAction, useSubmit } from '../components/hooks';
import { SelectField } from '../components/SelectField';
import { Sheet } from '../components/Sheet';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Field,
  KeyValue,
  ListItem,
  ScreenHeader,
  SearchBar,
  SectionTitle,
  Segmented,
  screen,
  type BadgeTone,
} from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getBatch, listBatches, listMedicines, listMovements, listSuppliers, type Batch, type BatchState, type BatchView } from '../db/repository';
import { daysLabel, dateTime, medicineLabel, money, todayIso } from '../format';
import { adjustStock, receiveBatch, setBatchActive, writeOffStock } from '../services/inventory';
import { can } from '../services/permissions';
import { useUser } from '../session';
import { colors } from '../theme';

const VIEWS: [BatchView, string][] = [
  ['all', 'All'],
  ['sellable', 'Sellable'],
  ['near', 'Near expiry'],
  ['expired', 'Expired'],
  ['quarantined', 'Quarantined'],
  ['depleted', 'Empty'],
];

export const batchTone: Record<BatchState, BadgeTone> = {
  SELLABLE: 'success',
  NEAR_EXPIRY: 'warning',
  EXPIRED: 'danger',
  QUARANTINED: 'info',
  DEPLETED: 'neutral',
};

export const batchLabel: Record<BatchState, string> = {
  SELLABLE: 'Sellable',
  NEAR_EXPIRY: 'Near expiry',
  EXPIRED: 'Expired',
  QUARANTINED: 'Quarantined',
  DEPLETED: 'Empty',
};

const movementTone = { RECEIPT: 'success', SALE: 'neutral', RETURN: 'info', ADJUSTMENT: 'warning', WRITE_OFF: 'danger' } as const;

const emptyReceive = () => ({
  medicine_id: null as number | null,
  supplier_id: null as number | null,
  batch_number: '',
  quantity: '',
  purchase_price: '',
  expiry_date: '',
  received_date: todayIso(),
});

export function InventoryScreen() {
  const user = useUser();
  const canReceive = can(user, 'stock.receive');
  const [view, setView] = useState<BatchView>('all');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'batches' | 'log'>('batches');
  const { data: batches, error } = useDbQuery((db) => listBatches(db, { search, view }), [search, view]);
  const { data: log } = useDbQuery((db) => listMovements(db, { limit: 100 }), []);
  const [selected, setSelected] = useState<number | null>(null);
  const [receiving, setReceiving] = useState(false);

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Inventory"
        subtitle="Stock by batch and expiry date"
        action={canReceive ? <Button title="+ Receive" onPress={() => setReceiving(true)} /> : undefined}
      />
      <Segmented
        options={[
          ['batches', 'Batches'],
          ['log', 'Movement log'],
        ]}
        value={mode}
        onChange={setMode}
      />
      {error ? <ErrorBanner message={error} /> : null}

      {mode === 'batches' ? (
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search medicine or batch number…" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {VIEWS.map(([key, label]) => (
              <Chip key={key} label={label} active={view === key} onPress={() => setView(key)} />
            ))}
          </ScrollView>
          {batches?.length === 0 ? <EmptyState text="No batches in this view." /> : null}
          {batches?.map((b) => (
            <ListItem key={b.batch_id} onPress={() => setSelected(b.batch_id)}>
              <View style={styles.top}>
                <Text style={styles.name}>{medicineLabel(b)}</Text>
                <View style={{ flex: 1 }} />
                <Badge label={batchLabel[b.batch_state]} tone={batchTone[b.batch_state]} />
              </View>
              <Text style={styles.muted}>
                Batch {b.batch_number} · {b.quantity_remaining}/{b.quantity_received} left · {b.supplier_name ?? 'no supplier'}
              </Text>
              <Text style={[styles.muted, b.days_to_expiry < 0 && { color: colors.danger }]}>
                Expires {b.expiry_date} ({daysLabel(b.days_to_expiry)})
              </Text>
            </ListItem>
          ))}
        </>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {log?.length === 0 ? <EmptyState text="No stock movements yet." /> : null}
          {log?.map((m) => (
            <View key={m.movement_id} style={styles.logRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {m.brand_name} · {m.batch_number}
                </Text>
                <Text style={styles.muted}>
                  {dateTime(m.movement_date)} · {m.user_name}
                  {m.order_number ? ` · ${m.order_number}` : ''}
                  {m.reason ? ` · ${m.reason}` : ''}
                </Text>
              </View>
              <Badge label={`${m.movement_type.replace('_', ' ')} ${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}`} tone={movementTone[m.movement_type]} />
            </View>
          ))}
        </Card>
      )}

      <BatchDetail batchId={selected} onClose={() => setSelected(null)} />
      <ReceiveForm visible={receiving} onClose={() => setReceiving(false)} />
    </ScrollView>
  );
}

function ReceiveForm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const db = useSQLiteContext();
  const user = useUser();
  const { data: medicines } = useDbQuery((db) => listMedicines(db));
  const { data: suppliers } = useDbQuery((db) => listSuppliers(db));
  const [form, setForm] = useState(emptyReceive);
  const { errors, error, saving, submit, reset } = useSubmit();
  const set = <K extends keyof typeof form>(key: K) => (value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const close = () => {
    reset();
    setForm(emptyReceive());
    onClose();
  };

  const save = async () => {
    const id = await submit(() => receiveBatch(db, user, form));
    if (id) close();
  };

  const medicine = medicines?.find((m) => m.medicine_id === form.medicine_id);
  return (
    <FormModal visible={visible} title="Receive stock" submitLabel="Save batch" onClose={close} onSubmit={save} submitting={saving} error={error}>
      <SelectField
        label="Medicine"
        value={form.medicine_id}
        onChange={set('medicine_id')}
        error={errors.medicine_id}
        options={(medicines ?? []).map((m) => ({ value: m.medicine_id, label: medicineLabel(m), detail: `${m.generic_name} · ${m.unit} · ${m.sellable_stock} in stock` }))}
      />
      <SelectField
        label="Supplier"
        value={form.supplier_id ?? 0}
        onChange={(v) => set('supplier_id')(v || null)}
        options={[{ value: 0, label: 'No supplier (opening stock)' }, ...(suppliers ?? []).map((s) => ({ value: s.supplier_id, label: s.supplier_name }))]}
      />
      <Field label="Batch / lot number" value={form.batch_number} onChangeText={set('batch_number')} error={errors.batch_number} autoCapitalize="characters" />
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label={`Quantity${medicine ? ` (${medicine.unit})` : ''}`} value={form.quantity} onChangeText={set('quantity')} error={errors.quantity} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Cost per unit (₮)" value={form.purchase_price} onChangeText={set('purchase_price')} error={errors.purchase_price} keyboardType="number-pad" />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label="Expiry date" value={form.expiry_date} onChangeText={set('expiry_date')} error={errors.expiry_date} placeholder="YYYY-MM-DD" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Received date" value={form.received_date} onChangeText={set('received_date')} error={errors.received_date} placeholder="YYYY-MM-DD" />
        </View>
      </View>
      {medicine && Number(form.purchase_price) > medicine.selling_price ? (
        <Text style={[styles.muted, { color: colors.warning }]}>Cost is higher than the selling price ({money(medicine.selling_price)}).</Text>
      ) : null}
    </FormModal>
  );
}

function BatchDetail({ batchId, onClose }: { batchId: number | null; onClose: () => void }) {
  const db = useSQLiteContext();
  const user = useUser();
  const canAdjust = can(user, 'stock.adjust');
  const { data } = useDbQuery(
    async (db) => {
      if (batchId === null) return null;
      return { batch: (await getBatch(db, batchId)) ?? undefined, movements: await listMovements(db, { batchId }) };
    },
    [batchId]
  );
  const [action, setAction] = useState<'adjust' | 'writeoff' | null>(null);
  const run = useAction();
  const batch: Batch | undefined = data?.batch;

  const toggleQuarantine = async () => {
    if (!batch) return;
    const quarantine = !!batch.is_active;
    if (quarantine && !(await confirmAction('Quarantine batch?', `Batch ${batch.batch_number} will not be sold until it is released.`, 'Quarantine'))) return;
    await run(() => setBatchActive(db, user, batch.batch_id, !quarantine), quarantine ? 'Batch quarantined' : 'Batch released');
  };

  return (
    <Sheet
      visible={batchId !== null && !!batch}
      title={batch ? medicineLabel(batch) : ''}
      subtitle={batch ? `Batch ${batch.batch_number}` : undefined}
      onClose={onClose}
      footer={
        canAdjust && batch ? (
          <>
            <Button title={batch.is_active ? 'Quarantine' : 'Release'} variant="secondary" small onPress={toggleQuarantine} />
            <View style={{ flex: 1 }} />
            <Button title="Adjust" variant="secondary" small onPress={() => setAction('adjust')} />
            <Button title="Write off" variant="danger" small onPress={() => setAction('writeoff')} disabled={batch.quantity_remaining === 0} />
          </>
        ) : undefined
      }
    >
      {batch ? (
        <>
          <Card>
            <KeyValue label="State" value={batchLabel[batch.batch_state]} strong />
            <KeyValue label="Remaining / received" value={`${batch.quantity_remaining} / ${batch.quantity_received}`} />
            <KeyValue label="Expiry" value={`${batch.expiry_date} (${daysLabel(batch.days_to_expiry)})`} />
            <KeyValue label="Received" value={batch.received_date} />
            <KeyValue label="Supplier" value={batch.supplier_name ?? '—'} />
            <KeyValue label="Cost per unit" value={money(batch.purchase_price)} />
            <KeyValue label="Value at cost" value={money(batch.purchase_price * batch.quantity_remaining)} />
          </Card>
          <SectionTitle>Movement history</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data?.movements.map((m) => (
              <View key={m.movement_id} style={styles.logRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{m.movement_type.replace('_', ' ')}</Text>
                  <Text style={styles.muted}>
                    {dateTime(m.movement_date)} · {m.user_name}
                    {m.order_number ? ` · ${m.order_number}` : ''}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </Text>
                </View>
                <Text style={[styles.change, { color: m.quantity_change > 0 ? colors.success : colors.danger }]}>
                  {m.quantity_change > 0 ? '+' : ''}
                  {m.quantity_change}
                </Text>
              </View>
            ))}
          </Card>
          <StockChangeForm key={action ?? 'closed'} batch={batch} kind={action} onClose={() => setAction(null)} />
        </>
      ) : null}
    </Sheet>
  );
}

function StockChangeForm({ batch, kind, onClose }: { batch: Batch; kind: 'adjust' | 'writeoff' | null; onClose: () => void }) {
  const db = useSQLiteContext();
  const user = useUser();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(kind === 'writeoff' && batch.batch_state === 'EXPIRED' ? 'Expired – destroyed' : '');
  const { errors, error, saving, submit, reset } = useSubmit();

  const close = () => {
    reset();
    setQty('');
    setReason('');
    onClose();
  };

  const save = async () => {
    const done = await submit(async () => {
      if (kind === 'adjust') await adjustStock(db, user, { batch_id: batch.batch_id, quantity_change: qty, reason });
      else await writeOffStock(db, user, { batch_id: batch.batch_id, quantity: qty, reason });
      return true;
    });
    if (done) close();
  };

  return (
    <FormModal
      visible={kind !== null}
      title={kind === 'adjust' ? 'Adjust stock' : 'Write off stock'}
      submitLabel={kind === 'adjust' ? 'Save adjustment' : 'Write off'}
      onClose={close}
      onSubmit={save}
      submitting={saving}
      error={error}
    >
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        {batch.quantity_remaining} currently in batch {batch.batch_number}. This adds a new movement; history is never edited.
      </Text>
      <Field
        label={kind === 'adjust' ? 'Change (e.g. -1 or +2)' : 'Quantity to remove'}
        value={qty}
        onChangeText={setQty}
        error={errors.quantity_change ?? errors.quantity}
        keyboardType="numbers-and-punctuation"
        hint={kind === 'writeoff' && batch.batch_state === 'EXPIRED' ? `Remove all ${batch.quantity_remaining} expired units` : undefined}
      />
      <Field label="Reason (required)" value={reason} onChangeText={setReason} error={errors.reason} placeholder="Stock count, damaged, expired…" />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  change: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pair: { flexDirection: 'row', gap: 10 },
});
