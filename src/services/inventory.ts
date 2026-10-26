import type { SQLiteDatabase } from 'expo-sqlite';

import { runInTransaction } from '../db/transaction';
import { AppError, assertCan, type SessionUser } from './permissions';
import { Checker } from './validate';

// Stock receiving, adjustments, write-offs and quarantine. Every quantity change is a row in
// stock_movements; the trg_movement_apply trigger keeps medicine_batches.quantity_remaining in step.

export type ReceiveInput = {
  medicine_id: number | null;
  supplier_id: number | null;
  batch_number: string;
  quantity: string | number;
  purchase_price: string | number;
  expiry_date: string;
  received_date?: string;
};

export async function today(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ d: string }>("SELECT date('now', 'localtime') AS d");
  return row!.d;
}

/** UC-03: a new batch plus its RECEIPT movement, in one transaction. Returns the batch id. */
export async function receiveBatch(db: SQLiteDatabase, actor: SessionUser, input: ReceiveInput) {
  assertCan(actor, 'stock.receive');
  const now = await today(db);
  const c = new Checker();
  if (!input.medicine_id) c.fail('medicine_id', 'Choose a medicine.');
  const value = {
    batch_number: c.text('batch_number', input.batch_number, 'Batch number', 1, 40).toUpperCase(),
    quantity: c.int('quantity', input.quantity, 'Quantity', { min: 1, max: 1_000_000 }),
    purchase_price: c.int('purchase_price', input.purchase_price, 'Purchase price'),
    expiry_date: c.date('expiry_date', input.expiry_date, 'Expiry date'),
    received_date: c.date('received_date', input.received_date ?? now, 'Received date'),
  };
  if (!c.errors.received_date && value.received_date > now) c.fail('received_date', 'Received date cannot be in the future.');
  if (!c.errors.expiry_date && value.expiry_date <= now) c.fail('expiry_date', 'This batch is already expired. Expiry must be after today.');
  c.done();

  return runInTransaction(db, (tx) => insertBatch(tx, actor.user_id, { ...value, medicine_id: input.medicine_id!, supplier_id: input.supplier_id }));
}

/** Inner step shared with the seed script. Must run inside a transaction. */
export async function insertBatch(
  tx: SQLiteDatabase,
  userId: number,
  b: {
    medicine_id: number;
    supplier_id: number | null;
    batch_number: string;
    quantity: number;
    purchase_price: number;
    expiry_date: string;
    received_date: string;
    movement_date?: string;
  }
) {
  const medicine = await tx.getFirstAsync<{ is_active: number }>('SELECT is_active FROM medicines WHERE medicine_id = ?', b.medicine_id);
  if (!medicine) throw new AppError('The selected medicine no longer exists.');
  if (!medicine.is_active) throw new AppError('This medicine is inactive. Reactivate it before receiving stock.');

  const result = await tx.runAsync(
    `INSERT INTO medicine_batches (medicine_id, supplier_id, batch_number, purchase_price, quantity_received,
                                   received_date, expiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    b.medicine_id, b.supplier_id, b.batch_number, b.purchase_price, b.quantity, b.received_date, b.expiry_date
  );
  await tx.runAsync(
    `INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, movement_date)
     VALUES (?, ?, 'RECEIPT', ?, COALESCE(?, datetime('now', 'localtime')))`,
    result.lastInsertRowId, userId, b.quantity, b.movement_date ?? null
  );
  return result.lastInsertRowId;
}

async function loadBatch(tx: SQLiteDatabase, batchId: number) {
  const batch = await tx.getFirstAsync<{ quantity_remaining: number; quantity_received: number }>(
    'SELECT quantity_remaining, quantity_received FROM medicine_batches WHERE batch_id = ?',
    batchId
  );
  if (!batch) throw new AppError('This batch no longer exists.');
  return batch;
}

/** Stock count correction (+ or −). A reason is required (BR-18). */
export async function adjustStock(
  db: SQLiteDatabase,
  actor: SessionUser,
  input: { batch_id: number; quantity_change: string | number; reason: string }
) {
  assertCan(actor, 'stock.adjust');
  const c = new Checker();
  const change = c.int('quantity_change', input.quantity_change, 'Change', { min: -1_000_000, max: 1_000_000 });
  if (change === 0) c.fail('quantity_change', 'Enter a positive or negative number, not 0.');
  const reason = c.text('reason', input.reason, 'Reason', 3, 200);
  c.done();

  await runInTransaction(db, async (tx) => {
    const batch = await loadBatch(tx, input.batch_id);
    const after = batch.quantity_remaining + change;
    if (after < 0) throw new AppError(`Only ${batch.quantity_remaining} in this batch; it can't go below 0.`);
    if (after > batch.quantity_received) {
      throw new AppError(`A batch can't hold more than the ${batch.quantity_received} received.`);
    }
    await tx.runAsync(
      "INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, reason) VALUES (?, ?, 'ADJUSTMENT', ?, ?)",
      input.batch_id, actor.user_id, change, reason
    );
  });
}

/** Removes damaged or expired stock from a batch. */
export async function writeOffStock(
  db: SQLiteDatabase,
  actor: SessionUser,
  input: { batch_id: number; quantity: string | number; reason: string }
) {
  assertCan(actor, 'stock.adjust');
  const c = new Checker();
  const quantity = c.int('quantity', input.quantity, 'Quantity', { min: 1, max: 1_000_000 });
  const reason = c.text('reason', input.reason, 'Reason', 3, 200);
  c.done();

  await runInTransaction(db, async (tx) => {
    const batch = await loadBatch(tx, input.batch_id);
    if (quantity > batch.quantity_remaining) throw new AppError(`Only ${batch.quantity_remaining} left in this batch.`);
    await tx.runAsync(
      "INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, reason) VALUES (?, ?, 'WRITE_OFF', ?, ?)",
      input.batch_id, actor.user_id, -quantity, reason
    );
  });
}

/** Quarantine (recall, damage check) or release a batch. Quarantined batches can't be sold. */
export async function setBatchActive(db: SQLiteDatabase, actor: SessionUser, batchId: number, active: boolean) {
  assertCan(actor, 'stock.adjust');
  await db.runAsync('UPDATE medicine_batches SET is_active = ? WHERE batch_id = ?', active ? 1 : 0, batchId);
}
