import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { confirmAction, useToast } from '../components/feedback';
import { FormModal } from '../components/FormModal';
import { Button, Card, EmptyState, ErrorBanner, Field, ScreenHeader, SearchBar, screen } from '../components/ui';
import { useDataChange, useDbQuery } from '../db/DataContext';
import { friendlyError } from '../db/errors';
import { createCustomer, deleteCustomer, listCustomers, updateCustomer, type Customer } from '../db/repository';
import { money, shortDate } from '../format';
import { colors } from '../theme';
import { validateCustomer, type CustomerForm, type Errors } from '../validation';

const emptyForm: CustomerForm = { name: '', email: '', phone: '', city: '' };

export function CustomersScreen() {
  const db = useSQLiteContext();
  const { notifyChange } = useDataChange();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data: customers, error } = useDbQuery((db) => listCustomers(db, search), [search]);

  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [errors, setErrors] = useState<Errors<keyof CustomerForm>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (customer: Customer | 'new') => {
    setEditing(customer);
    setErrors({});
    setSaveError(null);
    setForm(
      customer === 'new'
        ? emptyForm
        : { name: customer.name, email: customer.email, phone: customer.phone ?? '', city: customer.city ?? '' }
    );
  };
  const set = (patch: Partial<CustomerForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const result = validateCustomer(form);
    setErrors(result.errors ?? {});
    if (!result.value) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (editing === 'new') await createCustomer(db, result.value);
      else if (editing) await updateCustomer(db, editing.id, result.value);
      notifyChange();
      toast(editing === 'new' ? `Added ${result.value.name}` : `Saved ${result.value.name}`);
      setEditing(null);
    } catch (e) {
      setSaveError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || editing === 'new') return;
    if (editing.order_count > 0) {
      setSaveError(`${editing.name} has ${editing.order_count} order(s). Delete those orders first.`);
      return;
    }
    if (!(await confirmAction('Delete customer?', `${editing.name} will be permanently removed.`))) return;
    try {
      await deleteCustomer(db, editing.id);
      notifyChange();
      toast(`Deleted ${editing.name}`);
      setEditing(null);
    } catch (e) {
      setSaveError(friendlyError(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={screen.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Customers"
        subtitle={customers ? `${customers.length} customer(s)` : undefined}
        action={<Button title="+ Add" onPress={() => open('new')} />}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, email or city" />
      {error ? <ErrorBanner message={error} /> : null}
      {customers?.length === 0 ? <EmptyState text={search ? 'No customers match your search.' : 'No customers yet.'} /> : null}

      <View style={{ gap: 8 }}>
        {customers?.map((c) => (
          <Pressable key={c.id} onPress={() => open(c)}>
            {({ pressed }) => (
              <Card style={[styles.row, pressed && { opacity: 0.7 }]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(c.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>{c.email}</Text>
                  <Text style={styles.meta}>
                    {[c.city, c.phone].filter(Boolean).join(' · ') || '—'} · since {shortDate(c.created_at)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.spent}>{money(c.total_spent)}</Text>
                  <Text style={styles.meta}>{c.order_count} order(s)</Text>
                </View>
              </Card>
            )}
          </Pressable>
        ))}
      </View>

      <FormModal
        visible={editing !== null}
        title={editing === 'new' ? 'New customer' : 'Edit customer'}
        onClose={() => setEditing(null)}
        onSubmit={save}
        submitting={saving}
        error={saveError}
        onDelete={editing && editing !== 'new' ? remove : undefined}
      >
        <Field label="Full name" value={form.name} onChangeText={(name) => set({ name })} error={errors.name} placeholder="e.g. Aiko Tanaka" />
        <Field
          label="Email"
          value={form.email}
          onChangeText={(email) => set({ email })}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="name@example.com"
        />
        <Field label="Phone (optional)" value={form.phone} onChangeText={(phone) => set({ phone })} error={errors.phone} keyboardType="phone-pad" />
        <Field label="City (optional)" value={form.city} onChangeText={(city) => set({ city })} />
      </FormModal>
    </ScrollView>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  spent: { fontSize: 15, fontWeight: '700', color: colors.text },
});
