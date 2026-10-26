import type { SQLiteDatabase } from 'expo-sqlite';

import { assertCan, type SessionUser } from './permissions';
import { Checker } from './validate';

// Catalogue and master data: categories, medicines, suppliers, customers.
// Records with history are deactivated, never deleted (BR-15).

export const DOSAGE_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'SUSPENSION',
  'INJECTION',
  'CREAM',
  'OINTMENT',
  'DROPS',
  'SPRAY',
  'INHALER',
  'POWDER',
  'DEVICE',
  'OTHER',
] as const;
export type DosageForm = (typeof DOSAGE_FORMS)[number];

// ---- Categories ----

export type CategoryInput = { category_name: string; description?: string | null };

function checkCategory(input: CategoryInput) {
  const c = new Checker();
  const value = { category_name: c.text('category_name', input.category_name, 'Category name', 2, 50), description: c.optionalText('description', input.description) };
  c.done();
  return value;
}

export async function createCategory(db: SQLiteDatabase, actor: SessionUser, input: CategoryInput) {
  assertCan(actor, 'categories.write');
  const v = checkCategory(input);
  const result = await db.runAsync('INSERT INTO categories (category_name, description) VALUES (?, ?)', v.category_name, v.description);
  return result.lastInsertRowId;
}

export async function updateCategory(db: SQLiteDatabase, actor: SessionUser, id: number, input: CategoryInput) {
  assertCan(actor, 'categories.write');
  const v = checkCategory(input);
  await db.runAsync('UPDATE categories SET category_name = ?, description = ? WHERE category_id = ?', v.category_name, v.description, id);
}

export async function setCategoryActive(db: SQLiteDatabase, actor: SessionUser, id: number, active: boolean) {
  assertCan(actor, 'categories.write');
  await db.runAsync('UPDATE categories SET is_active = ? WHERE category_id = ?', active ? 1 : 0, id);
}

// ---- Medicines ----

export type MedicineInput = {
  category_id: number | null;
  brand_name: string;
  generic_name: string;
  strength?: string | null;
  dosage_form: string;
  unit: string;
  barcode?: string | null;
  selling_price: string | number;
  min_stock_level: string | number;
  requires_prescription: boolean;
};

function checkMedicine(input: MedicineInput) {
  const c = new Checker();
  if (!input.category_id) c.fail('category_id', 'Choose a category.');
  const barcode = (input.barcode ?? '').trim();
  if (barcode && !/^\d{8,14}$/.test(barcode)) c.fail('barcode', 'Barcode must be 8–14 digits.');
  const value = {
    category_id: input.category_id,
    brand_name: c.text('brand_name', input.brand_name, 'Brand name'),
    generic_name: c.text('generic_name', input.generic_name, 'Generic name'),
    strength: c.optionalText('strength', input.strength, 30),
    dosage_form: c.oneOf('dosage_form', input.dosage_form, DOSAGE_FORMS, 'dosage form'),
    unit: c.text('unit', input.unit, 'Unit', 1, 30),
    barcode: barcode || null,
    selling_price: c.int('selling_price', input.selling_price, 'Selling price'),
    min_stock_level: c.int('min_stock_level', input.min_stock_level, 'Minimum stock', { max: 100_000 }),
    requires_prescription: input.requires_prescription ? 1 : 0,
  };
  c.done();
  return value;
}

export async function createMedicine(db: SQLiteDatabase, actor: SessionUser, input: MedicineInput) {
  assertCan(actor, 'medicines.write');
  const v = checkMedicine(input);
  const result = await db.runAsync(
    `INSERT INTO medicines (category_id, brand_name, generic_name, strength, dosage_form, unit, barcode,
                            selling_price, min_stock_level, requires_prescription)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    v.category_id, v.brand_name, v.generic_name, v.strength, v.dosage_form, v.unit, v.barcode,
    v.selling_price, v.min_stock_level, v.requires_prescription
  );
  return result.lastInsertRowId;
}

/** Price changes only affect future sales; completed orders keep their own unit_price (BR-10). */
export async function updateMedicine(db: SQLiteDatabase, actor: SessionUser, id: number, input: MedicineInput) {
  assertCan(actor, 'medicines.write');
  const v = checkMedicine(input);
  await db.runAsync(
    `UPDATE medicines SET category_id = ?, brand_name = ?, generic_name = ?, strength = ?, dosage_form = ?, unit = ?,
            barcode = ?, selling_price = ?, min_stock_level = ?, requires_prescription = ?
     WHERE medicine_id = ?`,
    v.category_id, v.brand_name, v.generic_name, v.strength, v.dosage_form, v.unit, v.barcode,
    v.selling_price, v.min_stock_level, v.requires_prescription, id
  );
}

export async function setMedicineActive(db: SQLiteDatabase, actor: SessionUser, id: number, active: boolean) {
  assertCan(actor, 'medicines.write');
  await db.runAsync('UPDATE medicines SET is_active = ? WHERE medicine_id = ?', active ? 1 : 0, id);
}

// ---- Suppliers ----

export type SupplierInput = {
  supplier_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

function checkSupplier(input: SupplierInput) {
  const c = new Checker();
  const value = {
    supplier_name: c.text('supplier_name', input.supplier_name, 'Supplier name', 2, 100),
    contact_person: c.optionalText('contact_person', input.contact_person, 100),
    phone: c.phone('phone', input.phone),
    email: c.email('email', input.email),
    address: c.optionalText('address', input.address),
  };
  c.done();
  return value;
}

export async function createSupplier(db: SQLiteDatabase, actor: SessionUser, input: SupplierInput) {
  assertCan(actor, 'suppliers.write');
  const v = checkSupplier(input);
  const result = await db.runAsync(
    'INSERT INTO suppliers (supplier_name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
    v.supplier_name, v.contact_person, v.phone, v.email, v.address
  );
  return result.lastInsertRowId;
}

export async function updateSupplier(db: SQLiteDatabase, actor: SessionUser, id: number, input: SupplierInput) {
  assertCan(actor, 'suppliers.write');
  const v = checkSupplier(input);
  await db.runAsync(
    'UPDATE suppliers SET supplier_name = ?, contact_person = ?, phone = ?, email = ?, address = ? WHERE supplier_id = ?',
    v.supplier_name, v.contact_person, v.phone, v.email, v.address, id
  );
}

export async function setSupplierActive(db: SQLiteDatabase, actor: SessionUser, id: number, active: boolean) {
  assertCan(actor, 'suppliers.write');
  await db.runAsync('UPDATE suppliers SET is_active = ? WHERE supplier_id = ?', active ? 1 : 0, id);
}

// ---- Customers ----

export type CustomerInput = { full_name: string; phone?: string | null; email?: string | null; notes?: string | null };

function checkCustomer(input: CustomerInput) {
  const c = new Checker();
  const value = {
    full_name: c.text('full_name', input.full_name, 'Name', 2, 100),
    phone: c.phone('phone', input.phone),
    email: c.email('email', input.email),
    notes: c.optionalText('notes', input.notes),
  };
  c.done();
  return value;
}

export async function createCustomer(db: SQLiteDatabase, actor: SessionUser, input: CustomerInput) {
  assertCan(actor, 'customers.write');
  const v = checkCustomer(input);
  const result = await db.runAsync(
    'INSERT INTO customers (full_name, phone, email, notes) VALUES (?, ?, ?, ?)',
    v.full_name, v.phone, v.email, v.notes
  );
  return result.lastInsertRowId;
}

export async function updateCustomer(db: SQLiteDatabase, actor: SessionUser, id: number, input: CustomerInput) {
  assertCan(actor, 'customers.write');
  const v = checkCustomer(input);
  await db.runAsync(
    'UPDATE customers SET full_name = ?, phone = ?, email = ?, notes = ? WHERE customer_id = ?',
    v.full_name, v.phone, v.email, v.notes, id
  );
}

/** Only customers without orders can be deleted; the foreign key refuses the rest. */
export async function deleteCustomer(db: SQLiteDatabase, actor: SessionUser, id: number) {
  assertCan(actor, 'customers.write');
  await db.runAsync('DELETE FROM customers WHERE customer_id = ?', id);
}
