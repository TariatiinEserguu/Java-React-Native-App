import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

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
  LoadingState,
  KeyValue,
  ListItem,
  ScreenHeader,
  SearchBar,
  SectionTitle,
  ToggleField,
  screen,
  type BadgeTone,
} from '../components/ui';
import { useDbQuery } from '../db/DataContext';
import { listBatches, listCategories, listMedicines, type Medicine, type MedicineFilter, type StockState } from '../db/repository';
import { daysLabel, formatNumber, medicineLabel, money, shortDate } from '../format';
import { useI18n, type TranslationKey } from '../i18n';
import { createMedicine, DOSAGE_FORMS, setMedicineActive, updateMedicine, type DosageForm, type MedicineInput } from '../services/catalog';
import { can } from '../services/permissions';
import { getSettings } from '../services/settings';
import { useUser } from '../session';
import { makeStyles } from '../theme';

export const stockTone: Record<StockState, BadgeTone> = { OK: 'success', LOW: 'warning', OUT: 'danger' };

const FILTERS: [MedicineFilter, TranslationKey][] = [
  ['all', 'medicines.filter.all'],
  ['low', 'medicines.filter.low'],
  ['out', 'medicines.filter.out'],
  ['rx', 'medicines.filter.rx'],
  ['inactive', 'medicines.filter.inactive'],
];

type Form = Omit<MedicineInput, 'selling_price' | 'min_stock_level'> & { selling_price: string; min_stock_level: string };

const emptyForm = (minStock: number): Form => ({
  category_id: null,
  brand_name: '',
  generic_name: '',
  strength: '',
  dosage_form: 'TABLET',
  unit: '',
  barcode: '',
  selling_price: '',
  min_stock_level: String(minStock),
  requires_prescription: false,
});

export function MedicinesScreen() {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const canEdit = can(user, 'medicines.write');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MedicineFilter>('all');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { data: medicines, error } = useDbQuery((db) => listMedicines(db, { search, filter, categoryId }), [search, filter, categoryId]);
  const { data: categories } = useDbQuery((db) => listCategories(db));

  const [editing, setEditing] = useState<Medicine | 'new' | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(10));
  const [detail, setDetail] = useState<Medicine | null>(null);
  const { errors, error: saveError, saving, submit, reset } = useSubmit();
  const run = useAction();

  const openNew = async () => {
    const settings = await getSettings(db);
    reset();
    setForm(emptyForm(settings.default_min_stock));
    setEditing('new');
  };

  const openEdit = (m: Medicine) => {
    reset();
    setForm({
      category_id: m.category_id,
      brand_name: m.brand_name,
      generic_name: m.generic_name,
      strength: m.strength ?? '',
      dosage_form: m.dosage_form,
      unit: m.unit,
      barcode: m.barcode ?? '',
      selling_price: String(m.selling_price),
      min_stock_level: String(m.min_stock_level),
      requires_prescription: !!m.requires_prescription,
    });
    setDetail(null);
    setEditing(m);
  };

  const save = async () => {
    const ok = await submit<unknown>(() => (editing === 'new' ? createMedicine(db, user, form) : updateMedicine(db, user, (editing as Medicine).medicine_id, form)));
    if (ok !== undefined) setEditing(null);
  };

  const toggleActive = async (m: Medicine) => {
    if (m.is_active && !(await confirmAction(t('medicines.deactivateTitle'), t('medicines.deactivateBody', { name: medicineLabel(m) }), t('medicines.deactivate')))) return;
    if (await run(() => setMedicineActive(db, user, m.medicine_id, !m.is_active), m.is_active ? t('medicines.deactivated') : t('medicines.reactivated'))) setDetail(null);
  };

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title={t('medicines.title')}
        subtitle={medicines ? tn('count.shown', medicines.length) : undefined}
        action={canEdit ? <Button title={t('common.add')} icon="add" onPress={openNew} /> : undefined}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder={t('medicines.search')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map(([key, label]) => (
          <Chip key={key} label={t(label)} active={filter === key} onPress={() => setFilter(key)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('medicines.allCategories')} active={categoryId === null} onPress={() => setCategoryId(null)} />
        {categories?.map((c) => (
          <Chip key={c.category_id} label={c.category_name} active={categoryId === c.category_id} onPress={() => setCategoryId(c.category_id)} />
        ))}
      </ScrollView>
      {error ? <ErrorBanner message={error} /> : null}
      {!medicines && !error ? <LoadingState /> : null}
      {medicines?.length === 0 ? <EmptyState icon="search-outline" text={t('medicines.empty')} hint={t('medicines.emptyHint')} /> : null}

      {medicines?.map((m) => (
        <ListItem key={m.medicine_id} onPress={() => setDetail(m)}>
          <View style={styles.top}>
            <Text style={styles.name}>{medicineLabel(m)}</Text>
            {m.requires_prescription ? <Badge label={t('medicine.rx')} tone="info" /> : null}
            <View style={{ flex: 1 }} />
            <Text style={styles.price}>{money(m.selling_price)}</Text>
          </View>
          <View style={styles.bottom}>
            <Text style={styles.muted}>
              {m.generic_name} · {m.unit} · {m.category_name}
            </Text>
            <View style={{ flex: 1 }} />
            {m.is_active ? (
              <Badge label={m.stock_state === 'OUT' ? t('stock.OUT') : t('stock.inStock', { count: m.sellable_stock })} tone={stockTone[m.stock_state]} />
            ) : (
              <Badge label={t('common.inactive')} />
            )}
          </View>
        </ListItem>
      ))}

      <MedicineDetail
        medicine={detail}
        onClose={() => setDetail(null)}
        onEdit={canEdit ? openEdit : undefined}
        onToggleActive={canEdit ? toggleActive : undefined}
      />

      <FormModal
        visible={editing !== null}
        title={editing === 'new' ? t('medicines.add') : t('medicines.edit')}
        onClose={() => setEditing(null)}
        onSubmit={save}
        submitting={saving}
        error={saveError}
      >
        <Field label={t('field.brandName')} value={form.brand_name} onChangeText={set('brand_name')} error={errors.brand_name} placeholder={t('medicines.brandPlaceholder')} />
        <Field label={t('medicines.genericLabel')} value={form.generic_name} onChangeText={set('generic_name')} error={errors.generic_name} placeholder={t('medicines.genericPlaceholder')} />
        <SelectField
          label={t('field.category')}
          value={form.category_id}
          onChange={set('category_id')}
          error={errors.category_id}
          options={(categories ?? []).map((c) => ({ value: c.category_id, label: c.category_name }))}
        />
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field label={t('field.strength')} value={form.strength ?? ''} onChangeText={set('strength')} error={errors.strength} placeholder={t('medicines.strengthPlaceholder')} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField
              label={t('field.dosageForm')}
              value={form.dosage_form}
              onChange={set('dosage_form')}
              error={errors.dosage_form}
              options={DOSAGE_FORMS.map((f) => ({ value: f, label: t(`dosage.${f}`) }))}
            />
          </View>
        </View>
        <Field label={t('field.unitSold')} value={form.unit} onChangeText={set('unit')} error={errors.unit} placeholder={t('medicines.unitPlaceholder')} />
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field label={t('field.sellingPriceMnt')} value={form.selling_price} onChangeText={set('selling_price')} error={errors.selling_price} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('field.minStockLevel')} value={form.min_stock_level} onChangeText={set('min_stock_level')} error={errors.min_stock_level} keyboardType="number-pad" />
          </View>
        </View>
        <Field label={t('field.barcodeOptional')} value={form.barcode ?? ''} onChangeText={set('barcode')} error={errors.barcode} keyboardType="number-pad" />
        <ToggleField label={t('medicines.rxOnly')} value={form.requires_prescription} onChange={set('requires_prescription')} hint={t('medicines.rxHint')} />
      </FormModal>
    </ScrollView>
  );
}

function MedicineDetail({
  medicine,
  onClose,
  onEdit,
  onToggleActive,
}: {
  medicine: Medicine | null;
  onClose: () => void;
  onEdit?: (m: Medicine) => void;
  onToggleActive?: (m: Medicine) => void;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  const { data: batches } = useDbQuery((db) => (medicine ? listBatches(db, { medicineId: medicine.medicine_id }) : Promise.resolve([])), [medicine?.medicine_id]);
  if (!medicine) return null;
  const m = medicine;
  return (
    <Sheet
      visible
      title={medicineLabel(m)}
      subtitle={m.is_active ? undefined : t('common.inactive')}
      onClose={onClose}
      footer={
        onEdit || onToggleActive ? (
          <>
            {onToggleActive ? (
              <Button title={m.is_active ? t('medicines.deactivate') : t('medicines.reactivate')} variant={m.is_active ? 'danger' : 'secondary'} onPress={() => onToggleActive(m)} />
            ) : null}
            <View style={{ flex: 1 }} />
            {onEdit ? <Button title={t('common.edit')} icon="create-outline" onPress={() => onEdit(m)} /> : null}
          </>
        ) : undefined
      }
    >
      <Card>
        <KeyValue label={t('field.genericName')} value={m.generic_name} />
        <KeyValue label={t('medicine.formUnit')} value={`${t(`dosage.${m.dosage_form as DosageForm}`)} · ${m.unit}`} />
        <KeyValue label={t('field.category')} value={m.category_name} />
        <KeyValue label={t('field.barcode')} value={m.barcode ?? '—'} />
        <KeyValue label={t('field.sellingPrice')} value={money(m.selling_price)} strong />
        <KeyValue label={t('medicine.prescription')} value={m.requires_prescription ? t('medicine.rxRequired') : t('medicine.rxNotRequired')} />
        <KeyValue label={t('medicine.sellableStock')} value={`${formatNumber(m.sellable_stock)} (${t('medicine.minShort', { min: m.min_stock_level })})`} />
        <KeyValue label={t('medicine.onShelf')} value={formatNumber(m.stock_on_hand)} />
        <KeyValue label={t('medicine.nextExpiry')} value={m.next_expiry ? shortDate(m.next_expiry) : '—'} />
      </Card>
      <SectionTitle>{t('medicine.batches')}</SectionTitle>
      {batches?.length === 0 ? <EmptyState icon="cube-outline" text={t('medicine.noBatches')} hint={t('medicine.noBatchesHint')} /> : null}
      {batches?.map((b) => (
        <Card key={b.batch_id} style={{ marginBottom: 6, paddingVertical: 10 }}>
          <View style={styles.top}>
            <Text style={styles.name}>{b.batch_number}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.muted}>
              {b.quantity_remaining}/{b.quantity_received}
            </Text>
          </View>
          <Text style={styles.muted}>
            {t('batch.expiresLine', { date: shortDate(b.expiry_date), days: daysLabel(b.days_to_expiry), supplier: b.supplier_name ?? t('common.noSupplier'), state: t(`batch.${b.batch_state}`) })}
          </Text>
        </Card>
      ))}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  chips: { gap: 8, paddingBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 },
  price: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  muted: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  pair: { flexDirection: 'row', gap: 10 },
}));
