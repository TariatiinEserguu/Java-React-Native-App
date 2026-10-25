import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmAction, useToast } from '../components/feedback';
import { FormModal } from '../components/FormModal';
import { SelectField } from '../components/SelectField';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, ScreenHeader, SearchBar, screen } from '../components/ui';
import { useDataChange, useDbQuery } from '../db/DataContext';
import { friendlyError } from '../db/errors';
import {
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  LOW_STOCK_THRESHOLD,
  updateProduct,
  type Product,
} from '../db/repository';
import { money } from '../format';
import { colors } from '../theme';
import { validateProduct, type Errors, type ProductForm } from '../validation';

const emptyForm: ProductForm = { name: '', sku: '', category_id: null, price: '', quantity: '0' };

export function ProductsScreen() {
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data: products, error } = useDbQuery((db) => listProducts(db, search), [search]);
  const { data: categories } = useDbQuery(listCategories);

  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [errors, setErrors] = useState<Errors<keyof ProductForm>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (product: Product | 'new') => {
    setEditing(product);
    setErrors({});
    setSaveError(null);
    setForm(
      product === 'new'
        ? emptyForm
        : {
            name: product.name,
            sku: product.sku,
            category_id: product.category_id,
            price: String(product.price),
            quantity: String(product.quantity),
          }
    );
  };
  const set = (patch: Partial<ProductForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const result = validateProduct(form);
    setErrors(result.errors ?? {});
    if (!result.value) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (editing === 'new') await createProduct(db, result.value);
      else if (editing) await updateProduct(db, editing.id, result.value);
      notifyChange();
      toast(editing === 'new' ? `Added "${result.value.name}"` : `Saved "${result.value.name}"`);
      setEditing(null);
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === 'new') return;
    if (!(await confirmAction('Delete product?', `"${editing.name}" will be permanently removed.`))) return;
    try {
      await deleteProduct(db, editing.id);
      notifyChange();
      toast(`Deleted "${editing.name}"`);
      setEditing(null);
    } catch (e) {
      setSaveError(friendlyError(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Products"
        subtitle={products ? `${products.length} item(s)` : undefined}
        action={<Button title="+ Add" onPress={() => open('new')} />}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, SKU or category" />
      {error ? <ErrorBanner message={error} /> : null}
      {products?.length === 0 ? <EmptyState text={search ? 'No products match your search.' : 'No products yet.'} /> : null}

      <View style={{ gap: 8 }}>
        {products?.map((p) => (
          <Pressable key={p.id} onPress={() => open(p)}>
            {({ pressed }) => (
              <Card style={[styles.row, pressed && { opacity: 0.7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.meta}>
                    {p.sku} · {p.category_name ?? 'Uncategorized'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.price}>{money(p.price)}</Text>
                  <Badge
                    label={p.quantity === 0 ? 'Out of stock' : `${p.quantity} in stock`}
                    tone={p.quantity === 0 ? 'danger' : p.quantity <= LOW_STOCK_THRESHOLD ? 'warning' : 'success'}
                  />
                </View>
              </Card>
            )}
          </Pressable>
        ))}
      </View>

      <FormModal
        visible={editing !== null}
        title={editing === 'new' ? 'New product' : 'Edit product'}
        onClose={() => setEditing(null)}
        onSubmit={save}
        submitting={saving}
        error={saveError}
        onDelete={editing && editing !== 'new' ? remove : undefined}
      >
        <Field label="Name" value={form.name} onChangeText={(name) => set({ name })} error={errors.name} placeholder="e.g. Wireless Mouse" />
        <Field
          label="SKU"
          value={form.sku}
          onChangeText={(sku) => set({ sku: sku.toUpperCase() })}
          error={errors.sku}
          autoCapitalize="characters"
          placeholder="e.g. EL-1006"
          hint="Unique stock-keeping code"
        />
        <SelectField
          label="Category"
          value={form.category_id}
          onChange={(category_id) => set({ category_id })}
          placeholder="Uncategorized"
          options={[
            { value: null, label: 'Uncategorized' },
            ...(categories ?? []).map((c) => ({ value: c.id as number | null, label: c.name })),
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Price (USD)" value={form.price} onChangeText={(price) => set({ price })} error={errors.price} keyboardType="decimal-pad" placeholder="0.00" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Quantity" value={form.quantity} onChangeText={(quantity) => set({ quantity })} error={errors.quantity} keyboardType="number-pad" />
          </View>
        </View>
      </FormModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '700', color: colors.text },
});
