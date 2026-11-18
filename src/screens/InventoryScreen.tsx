import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '../components/Text';
import { confirmAction, useToast } from '../components/feedback';
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
  Icon,
  KeyValue,
  ListGroup,
  ListItem,
  LoadingState,
  ScreenHeader,
  SearchBar,
  SectionTitle,
  Segmented,
  screen,
  type BadgeTone,
} from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { getBatch, listBatches, listMedicines, listMovements, listSuppliers, type Batch, type BatchState, type BatchView, type Medicine } from '../db/repository';
import { daysLabel, dateTime, formatNumber, medicineLabel, money, shortDate, todayIso } from '../format';
import { useI18n, type TranslationKey } from '../i18n';
import { adjustStock, receiveBatch, setBatchActive, writeOffStock } from '../services/inventory';
import { can } from '../services/permissions';
import { useUser } from '../session';
import { makeStyles, useTheme } from '../theme';
import { useIntent, type Intent, type Navigate } from './navigation';

const VIEWS: [BatchView, TranslationKey][] = [
  ['all', 'inventory.view.all'],
  ['sellable', 'inventory.view.sellable'],
  ['near', 'inventory.view.near'],
  ['expired', 'inventory.view.expired'],
  ['quarantined', 'inventory.view.quarantined'],
  ['depleted', 'inventory.view.depleted'],
];

export const batchTone: Record<BatchState, BadgeTone> = {
  SELLABLE: 'success',
  NEAR_EXPIRY: 'warning',
  EXPIRED: 'danger',
  QUARANTINED: 'info',
  DEPLETED: 'neutral',
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

export function InventoryScreen({ intent, onNavigate }: { intent?: Intent | null; onNavigate: Navigate }) {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const user = useUser();
  const canReceive = can(user, 'stock.receive');
  const [view, setView] = useState<BatchView>('all');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'batches' | 'log'>('batches');
  const [tableLayout, setTableLayout] = useState(false);
  const { data: batches, error } = useDbQuery((db) => listBatches(db, { search, view }), [search, view]);
  const { data: log, error: logError } = useDbQuery((db) => listMovements(db, { limit: 100 }), []);
  const { data: medicines, error: medicinesError } = useDbQuery((db) => listMedicines(db));
  const needsMedicine = medicines?.length === 0;
  const filtered = !!search.trim() || view !== 'all';
  const emptyHint = filtered ? 'inventory.adjustFilters' : canReceive ? needsMedicine ? 'inventory.medicineRequired' : 'inventory.emptyHint' : undefined;
  const [selected, setSelected] = useState<number | null>(null);
  const [receiving, setReceiving] = useState(false);
  // From Today: "Expired batches" / "Expiring soon" open the matching view, "Receive stock" the form.
  useIntent(intent, (value) => {
    if (value === 'receive') {
      setMode('batches');
      if (canReceive) setReceiving(true);
      return;
    }
    setMode('batches');
    setView(value === 'expired' ? 'expired' : value === 'near' ? 'near' : 'all');
    setSearch('');
  });
  const shown = mode === 'batches' ? batches?.length : log?.length;

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title={t('inventory.title')}
        subtitle={shown === undefined ? undefined : tn('count.shown', shown)}
        action={canReceive ? (
          needsMedicine
            ? <Button title={t('medicines.title')} icon="medkit-outline" onPress={() => onNavigate('medicines')} />
            : <Button title={t('inventory.receiveTitle')} icon="add" onPress={() => setReceiving(true)} disabled={!medicines} />
        ) : undefined}
      />
      <View onLayout={({ nativeEvent }) => setTableLayout(nativeEvent.layout.width >= 680)}>
        <ListGroup>
          <View style={styles.toolbar}>
            <View style={tableLayout && styles.toolbarWide}>
              <View style={tableLayout && styles.modeField}>
                <Segmented
                  options={[
                    ['batches', t('inventory.tab.batches')],
                    ['log', t('inventory.tab.log')],
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              </View>
              {mode === 'batches' ? (
                <View style={tableLayout && styles.searchField}>
                  <SearchBar value={search} onChangeText={setSearch} placeholder={t('inventory.search')} />
                </View>
              ) : null}
            </View>
            {mode === 'batches' ? (
              <View style={styles.chips}>
                {VIEWS.map(([key, label]) => (
                  <Chip key={key} label={t(label)} active={view === key} onPress={() => setView(key)} />
                ))}
              </View>
            ) : null}
          </View>
          {mode === 'batches' ? (
            <>
              {error || (canReceive && medicinesError) ? <View style={styles.status}><ErrorBanner message={error ?? medicinesError ?? ''} /></View> : null}
              {!batches && !error ? <View style={styles.status}><LoadingState /></View> : null}
              {batches?.length === 0 ? (
                <EmptyState
                  icon="cube-outline"
                  text={t('inventory.empty')}
                  hint={emptyHint ? t(emptyHint) : undefined}
                />
              ) : null}
              {tableLayout && !!batches?.length ? (
                <View style={[styles.batchRow, styles.tableHeading]}>
                  <Text style={[styles.columnHeading, styles.batchCell]}>{t('field.medicine')}</Text>
                  <Text style={[styles.columnHeading, styles.stateCell]}>{t('batch.state')}</Text>
                  <Text style={[styles.columnHeading, styles.expiryCell]}>{t('batch.expiry')}</Text>
                  <Text style={[styles.columnHeading, styles.quantityCell]}>{t('batch.remainingReceived')}</Text>
                  <View style={styles.chevronCell} />
                </View>
              ) : null}
              {batches?.map((b, i) => {
                const expiryColor = b.batch_state === 'EXPIRED' ? colors.danger : b.batch_state === 'NEAR_EXPIRY' ? colors.warning : colors.text;
                const quantity = `${formatNumber(b.quantity_remaining)} / ${formatNumber(b.quantity_received)}`;
                const status = <Badge label={t(`batch.${b.batch_state}`)} tone={b.batch_state === 'SELLABLE' ? 'neutral' : batchTone[b.batch_state]} />;
                return (
                  <ListItem index={i} key={b.batch_id} onPress={() => setSelected(b.batch_id)} style={styles.listItem}>
                    <View style={styles.batchRow}>
                      <View style={[styles.batchRow, styles.batchCell]}>
                        <View style={[styles.batchIcon, !tableLayout && styles.batchIconCompact]}>
                          <Icon name="cube-outline" size={18} color={colors.primary} />
                        </View>
                        <View style={styles.batchCell}>
                          <Text style={styles.name} numberOfLines={tableLayout ? 1 : 2}>{medicineLabel(b)}</Text>
                          <Text style={styles.muted} numberOfLines={1}>
                            {t('medicine.lot', { batch: b.batch_number })} · {b.supplier_name ?? t('common.noSupplier')}
                          </Text>
                          {!tableLayout && b.batch_state !== 'SELLABLE' ? status : null}
                        </View>
                      </View>
                      {tableLayout ? <View style={styles.stateCell}>{status}</View> : null}
                      <View style={tableLayout ? styles.batchRow : styles.right}>
                        <Text style={[styles.expiry, tableLayout && styles.expiryCell, { color: expiryColor }]}>{shortDate(b.expiry_date)}</Text>
                        <Text style={[styles.quantity, tableLayout && styles.quantityCell]}>{quantity}</Text>
                      </View>
                      <View style={styles.chevronCell}><Icon name="chevron-forward" size={16} /></View>
                    </View>
                  </ListItem>
                );
              })}
            </>
          ) : (
            <>
              {logError ? <View style={styles.status}><ErrorBanner message={logError} /></View> : null}
              {!log && !logError ? <View style={styles.status}><LoadingState /></View> : null}
              {log?.length === 0 ? <EmptyState icon="swap-vertical-outline" text={t('inventory.noMovements')} /> : null}
              {log?.map((m, i) => (
                <ListItem key={m.movement_id} index={i} style={styles.listItem}>
                  <View style={styles.batchRow}>
                    <View style={[styles.batchIcon, !tableLayout && styles.batchIconCompact]}>
                      <Icon name="swap-vertical-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.batchCell}>
                      <Text style={styles.name}>{m.brand_name} · {m.batch_number}</Text>
                      <Text style={styles.muted}>
                        {dateTime(m.movement_date)} · {m.user_name}
                        {m.order_number ? ` · ${m.order_number}` : ''}
                        {m.reason ? ` · ${m.reason}` : ''}
                      </Text>
                    </View>
                    <Badge label={`${t(`movement.${m.movement_type}`)} ${m.quantity_change > 0 ? '+' : ''}${formatNumber(m.quantity_change)}`} tone={movementTone[m.movement_type]} />
                  </View>
                </ListItem>
              ))}
            </>
          )}
        </ListGroup>
      </View>

      <BatchDetail batchId={selected} onClose={() => setSelected(null)} />
      <ReceiveForm
        medicines={medicines}
        visible={receiving}
        onClose={() => setReceiving(false)}
        onOpenMedicines={() => onNavigate('medicines')}
      />
    </ScrollView>
  );
}

function ReceiveForm({ medicines, visible, onClose, onOpenMedicines }: {
  medicines?: Medicine[];
  visible: boolean;
  onClose: () => void;
  onOpenMedicines: () => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const db = useSQLiteContext();
  const user = useUser();
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
    if (id) {
      close();
      toast(t('inventory.received'));
    }
  };

  if (medicines?.length === 0) {
    return (
      <Sheet
        visible={visible}
        title={t('inventory.receiveTitle')}
        onClose={close}
        footer={<Button title={t('medicines.title')} icon="medkit-outline" onPress={() => { close(); onOpenMedicines(); }} />}
      >
        <EmptyState icon="medkit-outline" text={t('medicines.noActive')} hint={t('inventory.medicineRequired')} />
      </Sheet>
    );
  }

  const medicine = medicines?.find((m) => m.medicine_id === form.medicine_id);
  return (
    <FormModal visible={visible} title={t('inventory.receiveTitle')} submitLabel={t('inventory.saveBatch')} onClose={close} onSubmit={save} submitting={saving} error={error}>
      <SelectField
        label={t('field.medicine')}
        value={form.medicine_id}
        onChange={set('medicine_id')}
        error={errors.medicine_id}
        options={(medicines ?? []).map((m) => ({ value: m.medicine_id, label: medicineLabel(m), detail: `${m.generic_name} · ${m.unit} · ${t('stock.inStock', { count: m.sellable_stock })}` }))}
      />
      <SelectField
        label={t('field.supplier')}
        value={form.supplier_id ?? 0}
        onChange={(v) => set('supplier_id')(v || null)}
        options={[{ value: 0, label: t('inventory.noSupplierOpening') }, ...(suppliers ?? []).map((s) => ({ value: s.supplier_id, label: s.supplier_name }))]}
      />
      <Field label={t('field.batchLot')} value={form.batch_number} onChangeText={set('batch_number')} error={errors.batch_number} autoCapitalize="characters" />
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label={`${t('field.quantity')}${medicine ? ` (${medicine.unit})` : ''}`} value={form.quantity} onChangeText={set('quantity')} error={errors.quantity} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('field.costPerUnitMnt')} value={form.purchase_price} onChangeText={set('purchase_price')} error={errors.purchase_price} keyboardType="number-pad" />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Field label={t('field.expiryDate')} value={form.expiry_date} onChangeText={set('expiry_date')} error={errors.expiry_date} placeholder={t('common.datePlaceholder')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('field.receivedDate')} value={form.received_date} onChangeText={set('received_date')} error={errors.received_date} placeholder={t('common.datePlaceholder')} />
        </View>
      </View>
      {medicine && Number(form.purchase_price) > medicine.selling_price ? (
        <Text style={[styles.muted, { color: colors.warning }]}>{t('inventory.costHigh', { price: money(medicine.selling_price) })}</Text>
      ) : null}
    </FormModal>
  );
}

function BatchDetail({ batchId, onClose }: { batchId: number | null; onClose: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  const { colors } = useTheme();
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
    if (quarantine && !(await confirmAction(t('batch.quarantineTitle'), t('batch.quarantineBody', { batch: batch.batch_number }), t('batch.quarantine')))) return;
    await run(() => setBatchActive(db, user, batch.batch_id, !quarantine), quarantine ? t('batch.quarantined') : t('batch.released'));
  };

  return (
    <Sheet
      visible={batchId !== null && !!batch}
      title={batch ? medicineLabel(batch) : ''}
      subtitle={batch ? t('batch.number', { batch: batch.batch_number }) : undefined}
      onClose={onClose}
      footer={
        canAdjust && batch ? (
          <>
            <Button title={batch.is_active ? t('batch.quarantine') : t('batch.release')} variant="secondary" small onPress={toggleQuarantine} />
            <View style={{ flex: 1 }} />
            <Button title={t('batch.adjust')} variant="secondary" small onPress={() => setAction('adjust')} />
            <Button title={t('batch.writeOff')} variant="danger" small onPress={() => setAction('writeoff')} disabled={batch.quantity_remaining === 0} />
          </>
        ) : undefined
      }
    >
      {batch ? (
        <>
          <Card>
            <KeyValue label={t('batch.state')} value={t(`batch.${batch.batch_state}`)} strong />
            <KeyValue label={t('batch.remainingReceived')} value={`${formatNumber(batch.quantity_remaining)} / ${formatNumber(batch.quantity_received)}`} />
            <KeyValue label={t('batch.expiry')} value={`${shortDate(batch.expiry_date)} (${daysLabel(batch.days_to_expiry)})`} />
            <KeyValue label={t('batch.receivedOn')} value={shortDate(batch.received_date)} />
            <KeyValue label={t('field.supplier')} value={batch.supplier_name ?? '—'} />
            <KeyValue label={t('field.costPerUnit')} value={money(batch.purchase_price)} />
            <KeyValue label={t('batch.valueAtCost')} value={money(batch.purchase_price * batch.quantity_remaining)} />
          </Card>
          <SectionTitle>{t('batch.history')}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {data?.movements.map((m) => (
              <View key={m.movement_id} style={styles.logRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{t(`movement.${m.movement_type}`)}</Text>
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
  const { t } = useI18n();
  const styles = useStyles();
  const toast = useToast();
  const db = useSQLiteContext();
  const user = useUser();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(kind === 'writeoff' && batch.batch_state === 'EXPIRED' ? t('batch.expiredDestroyed') : '');
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
    if (done) {
      close();
      toast(kind === 'adjust' ? t('batch.adjusted') : t('batch.writtenOff'));
    }
  };

  return (
    <FormModal
      visible={kind !== null}
      title={kind === 'adjust' ? t('batch.adjustTitle') : t('batch.writeOffTitle')}
      submitLabel={kind === 'adjust' ? t('batch.saveAdjustment') : t('batch.writeOff')}
      onClose={close}
      onSubmit={save}
      submitting={saving}
      error={error}
    >
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        {t('batch.changeIntro', { count: batch.quantity_remaining, batch: batch.batch_number })}
      </Text>
      <Field
        label={kind === 'adjust' ? t('batch.changeLabel') : t('batch.removeLabel')}
        value={qty}
        onChangeText={setQty}
        error={errors.quantity_change ?? errors.quantity}
        keyboardType="numbers-and-punctuation"
        hint={kind === 'writeoff' && batch.batch_state === 'EXPIRED' ? t('batch.removeAllHint', { count: batch.quantity_remaining }) : undefined}
      />
      <Field label={t('field.reasonRequired')} value={reason} onChangeText={setReason} error={errors.reason} placeholder={t('batch.reasonPlaceholder')} />
    </FormModal>
  );
}

const useStyles = makeStyles((colors) => ({
  toolbar: { paddingTop: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  toolbarWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  modeField: { width: 268 },
  searchField: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 14 },
  status: { padding: 16 },
  tableHeading: { backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 11, paddingHorizontal: 16 },
  columnHeading: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  listItem: { paddingVertical: 12, paddingHorizontal: 16 },
  batchCell: { flex: 1, minWidth: 0, gap: 3 },
  batchIcon: { width: 40, height: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', borderRadius: 11, marginRight: 4 },
  batchIconCompact: { width: 34, height: 34, borderRadius: 9, marginRight: 4 },
  stateCell: { width: 114 },
  expiryCell: { width: 103 },
  quantityCell: { width: 122, textAlign: 'right' },
  chevronCell: { width: 16, flexShrink: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  change: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pair: { flexDirection: 'row', gap: 10 },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  right: { alignItems: 'flex-end', gap: 2 },
  expiry: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  quantity: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
}));
