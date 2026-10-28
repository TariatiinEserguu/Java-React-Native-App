import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { confirmAction } from '../../components/feedback';
import { FormModal } from '../../components/FormModal';
import { useAction, useSubmit } from '../../components/hooks';
import { SelectField } from '../../components/SelectField';
import { Badge, Button, EmptyState, ErrorBanner, Field, ListItem, LoadingState, SearchBar } from '../../components/ui';
import { useDbQuery } from '../../db/DataContext';
import { listCategories, listCustomers, listSuppliers, listUsers, type Category, type Customer, type Supplier, type User } from '../../db/repository';
import { dateTime, money, shortDate } from '../../format';
import { useI18n } from '../../i18n';
import {
  createCategory,
  createCustomer,
  createSupplier,
  deleteCustomer,
  setCategoryActive,
  setSupplierActive,
  updateCategory,
  updateCustomer,
  updateSupplier,
} from '../../services/catalog';
import { passwordProblem } from '../../services/password';
import { can, roleLabel, ROLES } from '../../services/permissions';
import { createUser, resetPassword, setUserActive, updateUser } from '../../services/users';
import { ValidationError } from '../../services/validate';
import { useUser } from '../../session';
import { makeStyles } from '../../theme';

// Simple master-data screens shown under "More": customers, suppliers, categories, staff.

function Header({ count, onAdd }: { count?: string; onAdd?: () => void }) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Text style={styles.muted}>{count ?? ''}</Text>
      {onAdd ? <Button title={t('common.add')} icon="add" small onPress={onAdd} /> : null}
    </View>
  );
}

// ---- Customers ----

export function CustomersScreen() {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const [search, setSearch] = useState('');
  const { data, error } = useDbQuery((db) => listCustomers(db, search), [search]);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', notes: '' });
  const { errors, error: saveError, saving, submit, reset } = useSubmit();
  const run = useAction();

  const open = (c: Customer | 'new') => {
    reset();
    setForm(c === 'new' ? { full_name: '', phone: '', email: '', notes: '' } : { full_name: c.full_name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '' });
    setEditing(c);
  };
  const save = async () => {
    const ok = await submit<unknown>(() => (editing === 'new' ? createCustomer(db, user, form) : updateCustomer(db, user, (editing as Customer).customer_id, form)));
    if (ok !== undefined) setEditing(null);
  };
  const remove = async () => {
    const c = editing as Customer;
    if (!(await confirmAction(t('customers.deleteTitle'), t('customers.deleteBody', { name: c.full_name })))) return;
    if (await run(() => deleteCustomer(db, user, c.customer_id), t('customers.deleted'))) setEditing(null);
  };
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <View>
      <SearchBar value={search} onChangeText={setSearch} placeholder={t('customers.search')} />
      <Header count={data ? tn('count.customers', data.length) : undefined} onAdd={can(user, 'customers.write') ? () => open('new') : undefined} />
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState /> : null}
      {data?.length === 0 ? <EmptyState icon="people-outline" text={t('customers.empty')} hint={t('customers.emptyHint')} /> : null}
      {data?.map((c) => (
        <ListItem key={c.customer_id} onPress={() => open(c)}>
          <View style={styles.top}>
            <Text style={styles.name}>{c.full_name}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.amount}>{money(c.total_spent)}</Text>
          </View>
          <Text style={styles.muted}>
            {c.phone ?? t('customers.noPhone')} · {tn('count.orders', c.order_count)}{c.last_visit ? ` · ${t('customers.lastVisit', { date: shortDate(c.last_visit) })}` : ''}
          </Text>
        </ListItem>
      ))}
      <FormModal
        visible={editing !== null}
        title={editing === 'new' ? t('customers.add') : t('customers.edit')}
        onClose={() => setEditing(null)}
        onSubmit={save}
        submitting={saving}
        error={saveError}
        onDelete={editing !== 'new' && editing && editing.order_count === 0 ? remove : undefined}
      >
        <Field label={t('field.fullName')} value={form.full_name} onChangeText={set('full_name')} error={errors.full_name} />
        <Field label={t('field.phone')} value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" />
        <Field label={t('field.emailOptional')} value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('customers.notes')} value={form.notes} onChangeText={set('notes')} error={errors.notes} />
      </FormModal>
    </View>
  );
}

// ---- Suppliers ----

export function SuppliersScreen() {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const canEdit = can(user, 'suppliers.write');
  const { data, error } = useDbQuery((db) => listSuppliers(db, true));
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [form, setForm] = useState({ supplier_name: '', contact_person: '', phone: '', email: '', address: '' });
  const { errors, error: saveError, saving, submit, reset } = useSubmit();
  const run = useAction();

  const open = (s: Supplier | 'new') => {
    if (!canEdit) return;
    reset();
    setForm(
      s === 'new'
        ? { supplier_name: '', contact_person: '', phone: '', email: '', address: '' }
        : { supplier_name: s.supplier_name, contact_person: s.contact_person ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '' }
    );
    setEditing(s);
  };
  const save = async () => {
    const ok = await submit<unknown>(() => (editing === 'new' ? createSupplier(db, user, form) : updateSupplier(db, user, (editing as Supplier).supplier_id, form)));
    if (ok !== undefined) setEditing(null);
  };
  const toggle = async () => {
    const s = editing as Supplier;
    if (await run(() => setSupplierActive(db, user, s.supplier_id, !s.is_active), s.is_active ? t('suppliers.deactivated') : t('suppliers.reactivated'))) setEditing(null);
  };
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <View>
      <Header count={data ? tn('count.suppliers', data.length) : undefined} onAdd={canEdit ? () => open('new') : undefined} />
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState /> : null}
      {data?.length === 0 ? <EmptyState icon="bus-outline" text={t('suppliers.empty')} /> : null}
      {data?.map((s) => (
        <ListItem key={s.supplier_id} onPress={canEdit ? () => open(s) : undefined}>
          <View style={styles.top}>
            <Text style={styles.name}>{s.supplier_name}</Text>
            <View style={{ flex: 1 }} />
            {s.is_active ? null : <Badge label={t('common.inactive')} />}
          </View>
          <Text style={styles.muted}>
            {[s.contact_person, s.phone, s.email].filter(Boolean).join(' · ') || t('suppliers.noContact')} · {tn('count.batches', s.batch_count)}
          </Text>
        </ListItem>
      ))}
      <FormModal
        visible={editing !== null}
        title={editing === 'new' ? t('suppliers.add') : t('suppliers.edit')}
        onClose={() => setEditing(null)}
        onSubmit={save}
        submitting={saving}
        error={saveError}
      >
        <Field label={t('field.supplierName')} value={form.supplier_name} onChangeText={set('supplier_name')} error={errors.supplier_name} />
        <Field label={t('field.contactPerson')} value={form.contact_person} onChangeText={set('contact_person')} error={errors.contact_person} />
        <Field label={t('field.phone')} value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" />
        <Field label={t('field.email')} value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('field.address')} value={form.address} onChangeText={set('address')} error={errors.address} />
        {editing && editing !== 'new' ? (
          <Button title={editing.is_active ? t('suppliers.deactivate') : t('suppliers.reactivate')} variant="secondary" onPress={toggle} />
        ) : null}
      </FormModal>
    </View>
  );
}

// ---- Categories ----

export function CategoriesScreen() {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const canEdit = can(user, 'categories.write');
  const { data, error } = useDbQuery((db) => listCategories(db, true));
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [form, setForm] = useState({ category_name: '', description: '' });
  const { errors, error: saveError, saving, submit, reset } = useSubmit();
  const run = useAction();

  const open = (c: Category | 'new') => {
    if (!canEdit) return;
    reset();
    setForm(c === 'new' ? { category_name: '', description: '' } : { category_name: c.category_name, description: c.description ?? '' });
    setEditing(c);
  };
  const save = async () => {
    const ok = await submit<unknown>(() => (editing === 'new' ? createCategory(db, user, form) : updateCategory(db, user, (editing as Category).category_id, form)));
    if (ok !== undefined) setEditing(null);
  };
  const toggle = async () => {
    const c = editing as Category;
    if (await run(() => setCategoryActive(db, user, c.category_id, !c.is_active), c.is_active ? t('categories.hidden') : t('categories.restored'))) setEditing(null);
  };

  return (
    <View>
      <Header count={data ? tn('count.categories', data.length) : undefined} onAdd={canEdit ? () => open('new') : undefined} />
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState /> : null}
      {data?.length === 0 ? <EmptyState icon="pricetags-outline" text={t('categories.empty')} /> : null}
      {data?.map((c) => (
        <ListItem key={c.category_id} onPress={canEdit ? () => open(c) : undefined}>
          <View style={styles.top}>
            <Text style={styles.name}>{c.category_name}</Text>
            <View style={{ flex: 1 }} />
            {c.is_active ? <Text style={styles.muted}>{tn('count.medicines', c.medicine_count)}</Text> : <Badge label={t('common.inactive')} />}
          </View>
          {c.description ? <Text style={styles.muted}>{c.description}</Text> : null}
        </ListItem>
      ))}
      <FormModal visible={editing !== null} title={editing === 'new' ? t('categories.add') : t('categories.edit')} onClose={() => setEditing(null)} onSubmit={save} submitting={saving} error={saveError}>
        <Field label={t('field.name')} value={form.category_name} onChangeText={(v) => setForm((f) => ({ ...f, category_name: v }))} error={errors.category_name} />
        <Field label={t('field.description')} value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} error={errors.description} />
        {editing && editing !== 'new' ? <Button title={editing.is_active ? t('categories.hide') : t('categories.restore')} variant="secondary" onPress={toggle} /> : null}
      </FormModal>
    </View>
  );
}

// ---- Staff ----

export function StaffScreen() {
  const { t, tn } = useI18n();
  const styles = useStyles();
  const db = useSQLiteContext();
  const user = useUser();
  const { data, error } = useDbQuery(listUsers);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [form, setForm] = useState({ full_name: '', username: '', role: 'CASHIER', password: '' });
  const { errors, error: saveError, saving, submit, reset } = useSubmit();
  const run = useAction();

  const open = (u: User | 'new') => {
    reset();
    setForm(u === 'new' ? { full_name: '', username: '', role: 'CASHIER', password: '' } : { full_name: u.full_name, username: u.username, role: u.role, password: '' });
    setEditing(u);
  };
  const save = async () => {
    const ok = await submit(async () => {
      if (editing === 'new') return createUser(db, user, form);
      const u = editing as User;
      const problem = form.password ? passwordProblem(form.password) : null;
      if (problem) throw new ValidationError({ password: problem });
      await updateUser(db, user, u.user_id, form);
      if (form.password) await resetPassword(db, user, u.user_id, form.password);
      return u.user_id;
    });
    if (ok !== undefined) setEditing(null);
  };
  const toggle = async () => {
    const u = editing as User;
    if (await run(() => setUserActive(db, user, u.user_id, !u.is_active), u.is_active ? t('staff.deactivated') : t('staff.reactivated'))) setEditing(null);
  };
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <View>
      <Header count={data ? tn('count.accounts', data.length) : undefined} onAdd={() => open('new')} />
      {error ? <ErrorBanner message={error} /> : null}
      {!data && !error ? <LoadingState /> : null}
      {data?.map((u) => (
        <ListItem key={u.user_id} onPress={() => open(u)}>
          <View style={styles.top}>
            <Text style={styles.name}>{u.full_name}</Text>
            <View style={{ flex: 1 }} />
            <Badge label={u.is_active ? roleLabel(u.role) : t('common.inactive')} tone={u.is_active ? 'primary' : 'neutral'} />
          </View>
          <Text style={styles.muted}>
            @{u.username} · {t('staff.lastLogin', { when: u.last_login_at ? dateTime(u.last_login_at) : t('staff.never') })}
          </Text>
        </ListItem>
      ))}
      <FormModal visible={editing !== null} title={editing === 'new' ? t('staff.add') : t('staff.edit')} onClose={() => setEditing(null)} onSubmit={save} submitting={saving} error={saveError}>
        <Field label={t('field.fullName')} value={form.full_name} onChangeText={set('full_name')} error={errors.full_name} />
        <Field label={t('login.username')} value={form.username} onChangeText={set('username')} error={errors.username} autoCapitalize="none" editable={editing === 'new'} />
        <SelectField label={t('field.role')} value={form.role} onChange={set('role')} error={errors.role} options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))} />
        <Field
          label={editing === 'new' ? t('login.password') : t('staff.newPassword')}
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          hint={t('validate.passwordHint')}
        />
        {editing && editing !== 'new' && editing.user_id !== user.user_id ? (
          <Button title={editing.is_active ? t('staff.deactivate') : t('staff.reactivate')} variant="secondary" onPress={toggle} />
        ) : null}
      </FormModal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  muted: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
}));
