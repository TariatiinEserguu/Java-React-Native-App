import { t, type TranslationKey } from '../i18n/core';

/**
 * expo-sqlite wraps SQLite errors like:
 *   "Call to function 'NativeStatement.runAsync' has been rejected.\n→ Caused by: Error code 19: UNIQUE constraint failed: users.username"
 * This extracts the SQLite part so it can be shown to the user.
 */
export function sqliteMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const caused = raw.split(/Caused by:\s*/).pop() ?? raw;
  return caused
    .replace(/^Error code\s*:?\s*\d+\s*:?\s*/i, '')
    .replace(/^Error:\s*/, '')
    .trim();
}

const FRIENDLY: [RegExp, TranslationKey][] = [
  [/UNIQUE constraint failed: users\.username/i, 'dbError.usernameTaken'],
  [/UNIQUE constraint failed: categories\.category_name/i, 'dbError.categoryExists'],
  [/UNIQUE constraint failed: suppliers\.supplier_name/i, 'dbError.supplierExists'],
  [/UNIQUE constraint failed: medicines\.barcode/i, 'dbError.barcodeUsed'],
  [/UNIQUE constraint failed: medicines\.brand_name/i, 'dbError.medicineExists'],
  [/UNIQUE constraint failed: medicine_batches/i, 'dbError.batchExists'],
  [/UNIQUE constraint failed: customers\.phone/i, 'dbError.phoneExists'],
  [/CHECK constraint failed: .*quantity_remaining/i, 'dbError.notEnoughStock'],
  [/CHECK constraint failed: .*expiry_date/i, 'dbError.expiryInvalid'],
  [/FOREIGN KEY constraint failed/i, 'dbError.inUse'],
  [/CHECK constraint failed/i, 'dbError.outOfRange'],
  // Messages raised by the schema's triggers (src/db/schema.ts). The database keeps its English text;
  // they are translated here for display.
  [/At least one active administrator is required/i, 'trigger.lastAdmin'],
  [/A new batch must start with quantity_remaining/i, 'trigger.newBatchEmpty'],
  [/Inactive medicines cannot receive stock/i, 'trigger.inactiveReceive'],
  [/Received date cannot be in the future/i, 'trigger.receivedFuture'],
  [/Medicine, received quantity and purchase price of a batch cannot be changed/i, 'trigger.batchImmutable'],
  [/Stock movements cannot be edited/i, 'trigger.movementEdit'],
  [/Stock movements cannot be deleted/i, 'trigger.movementDelete'],
  [/This batch has already been received/i, 'trigger.alreadyReceived'],
  [/A receipt must equal the batch quantity received/i, 'trigger.receiptMismatch'],
  [/The batch belongs to a different medicine/i, 'trigger.wrongMedicine'],
  [/Expired or quarantined batches cannot be sold/i, 'trigger.batchNotSellable'],
  [/Stock can only be allocated while an order is being checked out/i, 'trigger.allocateOutsideCheckout'],
  [/Allocated more stock than the ordered quantity/i, 'trigger.overAllocated'],
  [/Only completed orders can be returned/i, 'trigger.returnCompletedOnly'],
  [/Cannot return more than was sold from this batch/i, 'trigger.returnTooMany'],
  [/Items can only be added to a pending order/i, 'trigger.itemsPendingOnly'],
  [/Inactive medicines cannot be sold/i, 'trigger.inactiveSell'],
  [/This medicine requires a verified prescription/i, 'trigger.rxRequired'],
  [/Items of a completed order cannot be changed/i, 'trigger.itemsLocked'],
  [/Items of a completed order cannot be deleted/i, 'trigger.itemsLockedDelete'],
  [/A completed order cannot be changed/i, 'trigger.orderLocked'],
  [/Completed orders cannot be deleted/i, 'trigger.orderLockedDelete'],
  [/Invalid order status change/i, 'trigger.statusChange'],
  [/A completed order needs at least one item/i, 'trigger.orderNeedsItem'],
  [/Order subtotal does not match its items/i, 'trigger.subtotalMismatch'],
  [/Every order line must be fully allocated/i, 'trigger.lineAllocation'],
  [/A pending order with allocated stock cannot be cancelled/i, 'trigger.cancelAllocated'],
  [/Only a fully returned order can be marked refunded/i, 'trigger.refundPartial'],
  [/Prescriptions must be verified by an active pharmacist/i, 'trigger.rxVerifier'],
];

/** For form/CRUD actions: map common constraint errors to plain language. Trigger messages pass through. */
export function friendlyError(error: unknown): string {
  const message = sqliteMessage(error);
  for (const [pattern, key] of FRIENDLY) {
    if (pattern.test(message)) return t(key);
  }
  return message;
}
