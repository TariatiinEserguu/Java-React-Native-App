import type { SQLiteDatabase } from 'expo-sqlite';

import { runInTransaction } from '../db/transaction';
import { AppError, assertCan, can, CASHIER_MAX_DISCOUNT_PERCENT, type SessionUser } from './permissions';
import { Checker } from './validate';
import { t } from '../i18n/core';

// Checkout (UC-04), prescriptions and refunds. See the activity and sequence diagrams in
// docs/04-system-diagrams.md. The database triggers re-check the critical rules.

export const PAYMENT_METHODS = ['CASH', 'CARD', 'QPAY', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CartLine = { medicine_id: number; quantity: number; prescription_id?: number | null };

export type CheckoutInput = {
  lines: CartLine[];
  customer_id: number | null;
  payment_method: PaymentMethod;
  discount_amount?: number;
  notes?: string | null;
};

export type CheckoutResult = { order_id: number; order_number: string; total_amount: number };

export class InsufficientStockError extends AppError {
  constructor(
    readonly medicine_id: number,
    readonly available: number,
    name: string
  ) {
    super(available === 0 ? t('sales.outOfStock', { name }) : t('sales.onlyAvailable', { count: available, name }));
  }
}

/** Sellable batches of a medicine in FEFO order (earliest expiry first). */
export function sellableBatches(db: SQLiteDatabase, medicineId: number) {
  return db.getAllAsync<{ batch_id: number; quantity_remaining: number; expiry_date: string }>(
    `SELECT batch_id, quantity_remaining, expiry_date
     FROM medicine_batches
     WHERE medicine_id = ? AND is_active = 1 AND quantity_remaining > 0 AND expiry_date >= date('now', 'localtime')
     ORDER BY expiry_date, batch_id`,
    medicineId
  );
}

export async function checkout(db: SQLiteDatabase, actor: SessionUser, input: CheckoutInput): Promise<CheckoutResult> {
  assertCan(actor, 'sales.create');
  return runInTransaction(db, (tx) => recordSale(tx, actor, input));
}

/**
 * Inner checkout step, shared with the seed script. Must run inside a transaction: any error
 * rolls back the order, its lines and every stock deduction together (BR-14).
 * `at` overrides the sale timestamp (used only for historical sample data).
 */
export async function recordSale(tx: SQLiteDatabase, actor: SessionUser, input: CheckoutInput, at?: string): Promise<CheckoutResult> {
  const c = new Checker();
  if (input.lines.length === 0) c.fail('lines', t('sales.cartEmpty'));
  c.oneOf('payment_method', input.payment_method, PAYMENT_METHODS, t('validate.choosePayment'));
  const discount = c.int('discount_amount', input.discount_amount ?? 0, t('field.discount'));
  c.done();

  // Merge duplicate lines so each medicine appears once (UNIQUE(order_id, medicine_id)).
  const merged = new Map<number, CartLine>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new AppError(t('sales.quantityInvalid'));
    const prev = merged.get(line.medicine_id);
    merged.set(line.medicine_id, {
      medicine_id: line.medicine_id,
      quantity: (prev?.quantity ?? 0) + line.quantity,
      prescription_id: line.prescription_id ?? prev?.prescription_id ?? null,
    });
  }

  const now = at ?? (await tx.getFirstAsync<{ now: string }>("SELECT datetime('now', 'localtime') AS now"))!.now;
  const lines: (CartLine & { name: string; unit_price: number })[] = [];
  for (const line of merged.values()) {
    const m = await tx.getFirstAsync<{
      label: string;
      selling_price: number;
      requires_prescription: number;
      is_active: number;
    }>(
      "SELECT brand_name || IFNULL(' ' || strength, '') AS label, selling_price, requires_prescription, is_active FROM medicines WHERE medicine_id = ?",
      line.medicine_id
    );
    if (!m) throw new AppError(t('sales.medicineGone'));
    if (!m.is_active) throw new AppError(t('sales.inactive', { name: m.label }));
    if (m.requires_prescription) {
      if (!can(actor, 'sales.prescription')) throw new AppError(t('sales.rxPharmacist', { name: m.label }));
      if (!line.prescription_id) throw new AppError(t('sales.rxNeeded', { name: m.label }));
    }
    lines.push({ ...line, name: m.label, unit_price: m.selling_price });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
  if (discount > subtotal) throw new AppError(t('sales.discountTooLarge'));
  if (discount * 100 > subtotal * CASHIER_MAX_DISCOUNT_PERCENT && !can(actor, 'sales.unlimitedDiscount')) {
    throw new AppError(t('sales.cashierDiscount', { percent: CASHIER_MAX_DISCOUNT_PERCENT }));
  }

  const orderNumber = await nextOrderNumber(tx, now);
  const order = await tx.runAsync(
    'INSERT INTO orders (order_number, customer_id, user_id, created_at, notes) VALUES (?, ?, ?, ?, ?)',
    orderNumber, input.customer_id, actor.user_id, now, input.notes?.trim() || null
  );
  const orderId = order.lastInsertRowId;

  for (const line of lines) {
    const item = await tx.runAsync(
      'INSERT INTO order_items (order_id, medicine_id, prescription_id, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)',
      orderId, line.medicine_id, line.prescription_id ?? null, line.quantity, line.unit_price, line.quantity * line.unit_price
    );

    // BR-16 FEFO: take from the earliest-expiring sellable batch first, then the next.
    const batches = await sellableBatches(tx, line.medicine_id);
    const available = batches.reduce((sum, b) => sum + b.quantity_remaining, 0);
    if (available < line.quantity) throw new InsufficientStockError(line.medicine_id, available, line.name);
    let left = line.quantity;
    for (const batch of batches) {
      if (left === 0) break;
      const take = Math.min(left, batch.quantity_remaining);
      await tx.runAsync(
        "INSERT INTO stock_movements (batch_id, user_id, order_item_id, movement_type, quantity_change, movement_date) VALUES (?, ?, ?, 'SALE', ?, ?)",
        batch.batch_id, actor.user_id, item.lastInsertRowId, -take, now
      );
      left -= take;
    }
  }

  const total = subtotal - discount;
  await tx.runAsync(
    `UPDATE orders SET status = 'COMPLETED', payment_status = 'PAID', payment_method = ?,
            subtotal = ?, discount_amount = ?, total_amount = ?, completed_at = ?
     WHERE order_id = ?`,
    input.payment_method, subtotal, discount, total, now, orderId
  );
  return { order_id: orderId, order_number: orderNumber, total_amount: total };
}

/** Receipt number PC-YYYYMMDD-NNNN, counting up per day. */
async function nextOrderNumber(tx: SQLiteDatabase, timestamp: string) {
  const day = timestamp.slice(0, 10).replace(/-/g, '');
  const row = await tx.getFirstAsync<{ n: number | null }>(
    'SELECT MAX(CAST(substr(order_number, 13) AS INTEGER)) AS n FROM orders WHERE order_number LIKE ?',
    `PC-${day}-%`
  );
  return `PC-${day}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

// ---- Prescriptions ----

export type PrescriptionInput = {
  customer_id?: number | null;
  patient_name: string;
  prescriber_name: string;
  prescription_number?: string | null;
  issue_date: string;
  notes?: string | null;
};

/** Pharmacist records the prescription they checked; the id goes on the Rx order line. */
export async function recordPrescription(db: SQLiteDatabase, actor: SessionUser, input: PrescriptionInput) {
  assertCan(actor, 'sales.prescription');
  const c = new Checker();
  const v = {
    patient_name: c.text('patient_name', input.patient_name, t('field.patientName'), 2, 100),
    prescriber_name: c.text('prescriber_name', input.prescriber_name, t('field.prescriberName'), 2, 100),
    prescription_number: c.optionalText('prescription_number', input.prescription_number, 40),
    issue_date: c.date('issue_date', input.issue_date, t('field.issueDate')),
    notes: c.optionalText('notes', input.notes),
  };
  c.done();
  const now = await db.getFirstAsync<{ d: string }>("SELECT date('now', 'localtime') AS d");
  if (v.issue_date > now!.d) throw new AppError(t('sales.rxFuture'));
  const result = await db.runAsync(
    `INSERT INTO prescriptions (customer_id, verified_by, patient_name, prescriber_name, prescription_number, issue_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.customer_id ?? null, actor.user_id, v.patient_name, v.prescriber_name, v.prescription_number, v.issue_date, v.notes
  );
  return result.lastInsertRowId;
}

// ---- Refunds ----

export type RefundInput = {
  order_id: number;
  lines: { order_item_id: number; quantity: number }[];
  reason: string;
  /** false = returned goods are not resellable and are written off straight away. */
  restock: boolean;
};

export async function refundOrder(db: SQLiteDatabase, actor: SessionUser, input: RefundInput) {
  assertCan(actor, 'sales.refund');
  return runInTransaction(db, (tx) => applyRefund(tx, actor, input));
}

/** Inner refund step (BR-13): adds RETURN (and WRITE_OFF) movements; history is never deleted. */
export async function applyRefund(tx: SQLiteDatabase, actor: SessionUser, input: RefundInput, at?: string) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AppError(t('sales.refundReason'));
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new AppError(t('sales.refundNone'));

  const order = await tx.getFirstAsync<{ status: string; subtotal: number; total_amount: number; refunded_amount: number }>(
    'SELECT status, subtotal, total_amount, refunded_amount FROM orders WHERE order_id = ?',
    input.order_id
  );
  if (!order) throw new AppError(t('sales.orderNotFound'));
  if (order.status !== 'COMPLETED') throw new AppError(t('sales.onlyCompleted'));
  const now = at ?? (await tx.getFirstAsync<{ now: string }>("SELECT datetime('now', 'localtime') AS now"))!.now;

  let refundValue = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity)) throw new AppError(t('sales.returnWhole'));
    const item = await tx.getFirstAsync<{ quantity: number; quantity_returned: number; unit_price: number }>(
      'SELECT quantity, quantity_returned, unit_price FROM order_items WHERE order_item_id = ? AND order_id = ?',
      line.order_item_id, input.order_id
    );
    if (!item) throw new AppError(t('sales.notInOrder'));
    if (line.quantity > item.quantity - item.quantity_returned) {
      throw new AppError(t('sales.returnLimit', { count: item.quantity - item.quantity_returned }));
    }

    // Put stock back into the batches it came from, most recently allocated first.
    const allocations = await tx.getAllAsync<{ batch_id: number; open: number }>(
      `SELECT batch_id, -SUM(CASE WHEN movement_type = 'SALE' THEN quantity_change ELSE 0 END)
                        - SUM(CASE WHEN movement_type = 'RETURN' THEN quantity_change ELSE 0 END) AS open
       FROM stock_movements
       WHERE order_item_id = ? AND movement_type IN ('SALE', 'RETURN')
       GROUP BY batch_id
       ORDER BY MAX(movement_id) DESC`,
      line.order_item_id
    );
    let left = line.quantity;
    for (const a of allocations) {
      if (left === 0) break;
      const give = Math.min(left, a.open);
      if (give <= 0) continue;
      await tx.runAsync(
        "INSERT INTO stock_movements (batch_id, user_id, order_item_id, movement_type, quantity_change, reason, movement_date) VALUES (?, ?, ?, 'RETURN', ?, ?, ?)",
        a.batch_id, actor.user_id, line.order_item_id, give, reason, now
      );
      if (!input.restock) {
        await tx.runAsync(
          "INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, reason, movement_date) VALUES (?, ?, 'WRITE_OFF', ?, ?, ?)",
          a.batch_id, actor.user_id, -give, `Returned, not resellable: ${reason}`, now
        );
      }
      left -= give;
    }
    refundValue += line.quantity * item.unit_price;
  }

  const remaining = await tx.getFirstAsync<{ open: number }>(
    'SELECT IFNULL(SUM(quantity - quantity_returned), 0) AS open FROM order_items WHERE order_id = ?',
    input.order_id
  );
  const fullyReturned = remaining!.open === 0;
  // Discounts are shared out in proportion to the returned value; a full return refunds everything paid.
  const refundNow = fullyReturned
    ? order.total_amount - order.refunded_amount
    : Math.min(order.total_amount - order.refunded_amount, Math.round((refundValue * order.total_amount) / Math.max(order.subtotal, 1)));

  await tx.runAsync(
    `UPDATE orders
     SET refunded_amount = refunded_amount + ?,
         payment_status = ?,
         status = ?,
         notes = TRIM(IFNULL(notes || ' | ', '') || ?)
     WHERE order_id = ?`,
    refundNow,
    fullyReturned ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    fullyReturned ? 'REFUNDED' : 'COMPLETED',
    `Refund ${now}: ${reason}`,
    input.order_id
  );
  return { refunded: refundNow, fullyReturned };
}
