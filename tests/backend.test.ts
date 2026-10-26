// Backend acceptance tests (docs/08-testing-and-plan.md). Run with: npm test
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { beforeEach, describe, test } from 'node:test';

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDashboard, getOrderDetail, integrityIssues, listMedicines } from '../src/db/repository';
import { REPORTS } from '../src/db/reports';
import { BUSINESS_TABLES, migrate } from '../src/db/schema';
import { createMedicine, updateMedicine } from '../src/services/catalog';
import { adjustStock, insertBatch, receiveBatch, writeOffStock } from '../src/services/inventory';
import { hashPassword, pbkdf2Sha256, sha256, toHex, verifyPassword } from '../src/services/password';
import { PermissionError, type SessionUser } from '../src/services/permissions';
import { checkout, recordPrescription, refundOrder } from '../src/services/sales';
import { createUser, login, setUserActive, updateUser } from '../src/services/users';
import { openTestDb } from './nodeDb';

let db: SQLiteDatabase;
let admin: SessionUser;
let pharmacist: SessionUser;
let cashier: SessionUser;

const first = async <T>(sql: string, ...args: unknown[]) => (await db.getFirstAsync<T>(sql, ...(args as never[])))!;
const stockOf = async (medicineId: number) =>
  (await first<{ s: number }>('SELECT sellable_stock AS s FROM v_medicine_stock WHERE medicine_id = ?', medicineId)).s;
const count = async (table: string) => (await first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)).n;

async function newMedicine(overrides: Partial<Parameters<typeof createMedicine>[2]> = {}) {
  return createMedicine(db, admin, {
    category_id: 1,
    brand_name: `Test ${Math.random().toString(36).slice(2, 8)}`,
    generic_name: 'Testamol',
    strength: '10 mg',
    dosage_form: 'TABLET',
    unit: 'box of 10',
    selling_price: 1000,
    min_stock_level: 5,
    requires_prescription: false,
    ...overrides,
  });
}

const inDays = async (days: number) => (await first<{ d: string }>("SELECT date('now', 'localtime', ? || ' days') AS d", String(days))).d;

beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
  admin = await login(db, 'admin', 'admin123');
  pharmacist = await login(db, 'pharmacist', 'pharm123');
  cashier = await login(db, 'cashier', 'cashier123');
});

describe('schema and seed', () => {
  test('creates all business tables with sample data and no integrity issues', async () => {
    for (const t of BUSINESS_TABLES) assert.ok((await count(t)) > 0, `${t} should have rows`);
    assert.deepEqual(await integrityIssues(db), []);
    assert.deepEqual(await db.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await first<{ integrity_check: string }>('PRAGMA integrity_check')).integrity_check, 'ok');
  });

  test('migrate is idempotent', async () => {
    const before = await count('orders');
    await migrate(db);
    assert.equal(await count('orders'), before);
  });

  test('dashboard shows the seeded alerts', async () => {
    const { stats } = await getDashboard(db);
    assert.ok(stats.expired >= 2, 'expired batches');
    assert.ok(stats.near_expiry >= 1, 'near-expiry batches');
    assert.ok(stats.low_stock >= 1, 'low stock');
    assert.ok(stats.active_medicines > 20);
  });

  test('every report runs', async () => {
    const range = { from: await inDays(-60), to: await inDays(0) };
    for (const r of REPORTS) {
      const result = await r.run(db, range);
      assert.ok(Array.isArray(result.rows), r.id);
    }
  });
});

describe('passwords and login (TC-01, TC-02)', () => {
  test('SHA-256 and PBKDF2 match published test vectors', () => {
    assert.equal(toHex(sha256(new TextEncoder().encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // RFC 7914 §11, first 32 bytes.
    assert.equal(
      toHex(pbkdf2Sha256(new TextEncoder().encode('passwd'), new TextEncoder().encode('salt'), 1)),
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc'
    );
    assert.equal(
      toHex(pbkdf2Sha256(new TextEncoder().encode('admin123'), new TextEncoder().encode('pepper'), 4096)),
      pbkdf2Sync('admin123', 'pepper', 4096, 32, 'sha256').toString('hex')
    );
  });

  test('passwords are stored hashed and verified', async () => {
    const row = await first<{ password_hash: string; password_salt: string }>("SELECT * FROM users WHERE username = 'admin'");
    assert.ok(!row.password_hash.includes('admin123'));
    assert.ok(verifyPassword('admin123', row.password_salt, row.password_hash));
    assert.ok(!verifyPassword('wrong', row.password_salt, row.password_hash));
    assert.notEqual(hashPassword('x', 'aa'), hashPassword('x', 'bb'));
  });

  test('valid credentials log in, invalid ones get one generic message', async () => {
    assert.equal(admin.role, 'ADMIN');
    await assert.rejects(login(db, 'admin', 'nope'), /Incorrect username or password/);
    await assert.rejects(login(db, 'ghost', 'admin123'), /Incorrect username or password/);
  });

  test('deactivated users cannot log in; the last admin is protected', async () => {
    await setUserActive(db, admin, cashier.user_id, false);
    await assert.rejects(login(db, 'cashier', 'cashier123'), /deactivated/);
    await assert.rejects(updateUser(db, admin, admin.user_id, { full_name: 'X Y', role: 'PHARMACIST' }), /active administrator/);
    await createUser(db, admin, { full_name: 'Second Admin', username: 'admin2', role: 'ADMIN', password: 'secret123' });
    await updateUser(db, admin, admin.user_id, { full_name: 'Oyuna Batbayar', role: 'PHARMACIST' });
  });
});

describe('catalogue (TC-03, TC-04, TC-11)', () => {
  test('valid medicine is saved; negative price is rejected by the service and by the database', async () => {
    const id = await newMedicine();
    assert.ok(id > 0);
    await assert.rejects(newMedicine({ selling_price: -5 }), /Selling price/);
    await assert.rejects(
      db.runAsync(
        "INSERT INTO medicines (category_id, brand_name, generic_name, dosage_form, unit, selling_price) VALUES (1, 'Bad', 'Bad', 'TABLET', 'box', -5)"
      ),
      /CHECK constraint failed/
    );
    await assert.rejects(newMedicine({ selling_price: '12.5' }), /whole number/);
  });

  test('search finds medicines by brand and generic name', async () => {
    assert.ok((await listMedicines(db, { search: 'paracetamol' })).length >= 2);
    assert.equal((await listMedicines(db, { search: 'IbuFast' }))[0]?.generic_name, 'Ibuprofen');
  });

  test('changing the catalogue price does not change past sales', async () => {
    const med = await newMedicine({ selling_price: 1000 });
    await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'P1', quantity: 10, purchase_price: 500, expiry_date: await inDays(200) });
    const sale = await checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines: [{ medicine_id: med, quantity: 2 }] });
    const m = (await listMedicines(db, { search: '' })).find((x) => x.medicine_id === med)!;
    await updateMedicine(db, admin, med, { ...m, selling_price: 5000, requires_prescription: false });
    const detail = await getOrderDetail(db, sale.order_id);
    assert.equal(detail!.lines[0].unit_price, 1000);
    assert.equal(detail!.order.total_amount, 2000);
  });
});

describe('inventory (TC-06, scenario C)', () => {
  test('receiving a batch adds stock and a RECEIPT movement', async () => {
    const med = await newMedicine();
    const batch = await receiveBatch(db, pharmacist, {
      medicine_id: med, supplier_id: 2, batch_number: 'rc-1', quantity: 25, purchase_price: 400, expiry_date: await inDays(365),
    });
    assert.equal(await stockOf(med), 25);
    const mv = await first<{ movement_type: string; quantity_change: number }>('SELECT * FROM stock_movements WHERE batch_id = ?', batch);
    assert.deepEqual({ ...mv }.movement_type, 'RECEIPT');
    assert.equal(mv.quantity_change, 25);
  });

  test('duplicate batch numbers and past expiry dates are rejected', async () => {
    const med = await newMedicine();
    const input = { medicine_id: med, supplier_id: 1, batch_number: 'DUP', quantity: 5, purchase_price: 100, expiry_date: await inDays(100) };
    await receiveBatch(db, pharmacist, input);
    await assert.rejects(receiveBatch(db, pharmacist, input), /UNIQUE/);
    await assert.rejects(receiveBatch(db, pharmacist, { ...input, batch_number: 'OLD', expiry_date: await inDays(-1) }), /Expiry/);
  });

  test('adjustments need a reason and cannot make stock negative', async () => {
    const med = await newMedicine();
    const batch = await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: null, batch_number: 'ADJ', quantity: 3, purchase_price: 100, expiry_date: await inDays(90) });
    await assert.rejects(adjustStock(db, pharmacist, { batch_id: batch, quantity_change: -1, reason: '' }), /Reason/);
    await assert.rejects(adjustStock(db, pharmacist, { batch_id: batch, quantity_change: -4, reason: 'count' }), /below 0/);
    await adjustStock(db, pharmacist, { batch_id: batch, quantity_change: -1, reason: 'Count: one missing' });
    await writeOffStock(db, pharmacist, { batch_id: batch, quantity: 1, reason: 'Damaged' });
    assert.equal(await stockOf(med), 1);
    // The ledger itself can't be bypassed or edited.
    await assert.rejects(db.runAsync("INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change) VALUES (?, 1, 'ADJUSTMENT', -1)", batch), /CHECK/);
    await assert.rejects(db.runAsync("INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, reason) VALUES (?, 1, 'ADJUSTMENT', -5, 'x')", batch), /CHECK/);
    await assert.rejects(db.runAsync('UPDATE stock_movements SET quantity_change = 100'), /cannot be edited/);
    await assert.rejects(db.runAsync('DELETE FROM stock_movements'), /cannot be deleted/);
    assert.deepEqual(await integrityIssues(db), []);
  });
});

describe('checkout (TC-07, TC-08, TC-09, TC-10, scenario B)', () => {
  test('sale uses FEFO and splits a line across batches', async () => {
    const med = await newMedicine({ selling_price: 2000 });
    const later = await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'LATE', quantity: 60, purchase_price: 900, expiry_date: await inDays(400) });
    const sooner = await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'SOON', quantity: 40, purchase_price: 1000, expiry_date: await inDays(100) });
    const sale = await checkout(db, cashier, { customer_id: 1, payment_method: 'CARD', lines: [{ medicine_id: med, quantity: 50 }] });

    const remaining = await db.getAllAsync<{ batch_id: number; quantity_remaining: number }>(
      'SELECT batch_id, quantity_remaining FROM medicine_batches WHERE medicine_id = ? ORDER BY batch_id', med
    );
    assert.deepEqual(remaining.map((r) => ({ ...r })), [
      { batch_id: later, quantity_remaining: 50 },
      { batch_id: sooner, quantity_remaining: 0 },
    ]);
    const detail = await getOrderDetail(db, sale.order_id);
    assert.equal(detail!.order.status, 'COMPLETED');
    assert.equal(detail!.order.total_amount, 100_000);
    assert.match(sale.order_number, /^PC-\d{8}-\d{4}$/);
    assert.deepEqual(await integrityIssues(db), []);
  });

  test('selling more than available is rejected and nothing is saved', async () => {
    const med = await newMedicine();
    const other = await newMedicine();
    await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'A', quantity: 5, purchase_price: 100, expiry_date: await inDays(100) });
    await receiveBatch(db, pharmacist, { medicine_id: other, supplier_id: 1, batch_number: 'B', quantity: 5, purchase_price: 100, expiry_date: await inDays(100) });
    const orders = await count('orders');
    // The first line is fine, the second isn't: the whole sale must roll back (BR-14).
    await assert.rejects(
      checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines: [{ medicine_id: other, quantity: 2 }, { medicine_id: med, quantity: 6 }] }),
      /Only 5/
    );
    assert.equal(await count('orders'), orders);
    assert.equal(await stockOf(other), 5);
  });

  test('expired and quarantined batches are never sold', async () => {
    const med = await newMedicine();
    // receiveBatch refuses expired stock, so insert an old batch the way the seed does.
    const expired = await insertBatch(db, admin.user_id, {
      medicine_id: med, supplier_id: null, batch_number: 'EXP', quantity: 10, purchase_price: 100, received_date: await inDays(-300), expiry_date: await inDays(-1),
    });
    assert.equal(await stockOf(med), 0);
    const pending = await db.runAsync("INSERT INTO orders (order_number, user_id) VALUES ('T-1', 1)");
    const item = await db.runAsync('INSERT INTO order_items (order_id, medicine_id, quantity, unit_price, line_total) VALUES (?, ?, 1, 1000, 1000)', pending.lastInsertRowId, med);
    await assert.rejects(
      db.runAsync("INSERT INTO stock_movements (batch_id, user_id, order_item_id, movement_type, quantity_change) VALUES (?, 1, ?, 'SALE', -1)", expired, item.lastInsertRowId),
      /Expired or quarantined/
    );
    await assert.rejects(checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines: [{ medicine_id: med, quantity: 1 }] }), /out of sellable stock/);
    const q = await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: null, batch_number: 'Q', quantity: 4, purchase_price: 100, expiry_date: await inDays(50) });
    await db.runAsync('UPDATE medicine_batches SET is_active = 0 WHERE batch_id = ?', q);
    await assert.rejects(checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines: [{ medicine_id: med, quantity: 1 }] }), /out of sellable stock/);
  });

  test('stock cannot be deducted twice for a completed order', async () => {
    const med = await newMedicine();
    const batch = await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'TW', quantity: 10, purchase_price: 100, expiry_date: await inDays(100) });
    const sale = await checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines: [{ medicine_id: med, quantity: 3 }] });
    const item = await first<{ order_item_id: number }>('SELECT order_item_id FROM order_items WHERE order_id = ?', sale.order_id);
    await assert.rejects(
      db.runAsync("INSERT INTO stock_movements (batch_id, user_id, order_item_id, movement_type, quantity_change) VALUES (?, 1, ?, 'SALE', -3)", batch, item.order_item_id),
      /being checked out/
    );
    await assert.rejects(db.runAsync("UPDATE orders SET status = 'PENDING' WHERE order_id = ?", sale.order_id), /Invalid order status/);
    await assert.rejects(db.runAsync('UPDATE order_items SET quantity = 1 WHERE order_id = ?', sale.order_id), /cannot be changed/);
    await assert.rejects(db.runAsync('DELETE FROM orders WHERE order_id = ?', sale.order_id), /cannot be deleted/);
    assert.equal(await stockOf(med), 7);
  });

  test('prescription-only medicine needs a pharmacist and a prescription', async () => {
    const med = await newMedicine({ requires_prescription: true });
    await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'RX', quantity: 10, purchase_price: 100, expiry_date: await inDays(100) });
    const line = { medicine_id: med, quantity: 1 };
    await assert.rejects(checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines: [line] }), /pharmacist must sell/);
    await assert.rejects(checkout(db, pharmacist, { customer_id: null, payment_method: 'CASH', lines: [line] }), /prescription/);
    await assert.rejects(recordPrescription(db, cashier, { patient_name: 'Naraa T', prescriber_name: 'Dr. B', issue_date: await inDays(0) }), PermissionError);
    const rx = await recordPrescription(db, pharmacist, { patient_name: 'Naraa T', prescriber_name: 'Dr. B', issue_date: await inDays(0) });
    await checkout(db, pharmacist, { customer_id: null, payment_method: 'CASH', lines: [{ ...line, prescription_id: rx }] });
    assert.equal(await stockOf(med), 9);
  });

  test('discount limits by role', async () => {
    const med = await newMedicine({ selling_price: 10_000 });
    await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'D', quantity: 10, purchase_price: 100, expiry_date: await inDays(100) });
    const lines = [{ medicine_id: med, quantity: 1 }];
    await assert.rejects(checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines, discount_amount: 2000 }), /at most 10%/);
    const ok = await checkout(db, cashier, { customer_id: null, payment_method: 'CASH', lines, discount_amount: 1000 });
    assert.equal(ok.total_amount, 9000);
    await assert.rejects(checkout(db, admin, { customer_id: null, payment_method: 'CASH', lines, discount_amount: 20_000 }), /larger than the subtotal/);
  });
});

describe('refunds (TC-12, scenario E)', () => {
  test('partial then full refund restores stock and keeps history', async () => {
    const med = await newMedicine({ selling_price: 3000 });
    await receiveBatch(db, pharmacist, { medicine_id: med, supplier_id: 1, batch_number: 'R1', quantity: 10, purchase_price: 1000, expiry_date: await inDays(100) });
    const sale = await checkout(db, cashier, { customer_id: 1, payment_method: 'CASH', lines: [{ medicine_id: med, quantity: 4 }] });
    const { lines } = (await getOrderDetail(db, sale.order_id))!;
    const item = lines[0].order_item_id;

    await assert.rejects(refundOrder(db, cashier, { order_id: sale.order_id, lines: [{ order_item_id: item, quantity: 1 }], reason: 'x', restock: true }), PermissionError);
    await refundOrder(db, pharmacist, { order_id: sale.order_id, lines: [{ order_item_id: item, quantity: 1 }], reason: 'Unopened', restock: true });
    let detail = (await getOrderDetail(db, sale.order_id))!;
    assert.equal(detail.order.status, 'COMPLETED');
    assert.equal(detail.order.payment_status, 'PARTIALLY_REFUNDED');
    assert.equal(detail.order.refunded_amount, 3000);
    assert.equal(await stockOf(med), 7);

    await assert.rejects(refundOrder(db, pharmacist, { order_id: sale.order_id, lines: [{ order_item_id: item, quantity: 4 }], reason: 'Too many', restock: true }), /Only 3/);
    // Not resellable: RETURN then WRITE_OFF, so stock stays the same.
    await refundOrder(db, pharmacist, { order_id: sale.order_id, lines: [{ order_item_id: item, quantity: 3 }], reason: 'Opened packs', restock: false });
    detail = (await getOrderDetail(db, sale.order_id))!;
    assert.equal(detail.order.status, 'REFUNDED');
    assert.equal(detail.order.refunded_amount, 12_000);
    assert.equal(await stockOf(med), 7);
    assert.equal((await first<{ n: number }>("SELECT COUNT(*) AS n FROM stock_movements WHERE movement_type = 'WRITE_OFF' AND reason LIKE 'Returned%'")).n >= 1, true);
    assert.deepEqual(await integrityIssues(db), []);
  });
});

describe('permissions (TC-15)', () => {
  test('cashier cannot change inventory, catalogue or users', async () => {
    await assert.rejects(receiveBatch(db, cashier, { medicine_id: 1, supplier_id: 1, batch_number: 'X', quantity: 1, purchase_price: 1, expiry_date: '2099-01-01' }), PermissionError);
    await assert.rejects(newMedicineAs(cashier), PermissionError);
    await assert.rejects(createUser(db, pharmacist, { full_name: 'New Person', username: 'newp', role: 'CASHIER', password: 'secret123' }), PermissionError);
  });
});

function newMedicineAs(user: SessionUser) {
  return createMedicine(db, user, {
    category_id: 1, brand_name: 'Nope', generic_name: 'Nope', dosage_form: 'TABLET', unit: 'box', selling_price: 1, min_stock_level: 1, requires_prescription: false,
  });
}
