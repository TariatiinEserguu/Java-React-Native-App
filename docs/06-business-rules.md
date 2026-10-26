# 6. Business Rules, Validation & Permissions

## 6.1 Business rules

**Where enforced:** **DB** = database constraint or trigger; **Logic** = business-logic layer (in a transaction);
**UI** = screen-level feedback only. Rules marked DB stay true even if the UI has a bug.

| ID | Rule | Where |
| --- | --- | --- |
| BR-01 | Every medicine belongs to exactly one existing category. | DB (FK NOT NULL) |
| BR-02 | A medicine can have any number of batches. | DB (1:N) |
| BR-03 | A batch has a valid medicine, a batch number and an expiry date later than its received date. | DB |
| BR-04 | A batch quantity can never be negative or more than was received. | DB (`CHECK`) |
| BR-05 | A completed order has at least one item. | Logic |
| BR-06 | `line_total = quantity × unit_price`; `subtotal = Σ line_total`; `total = subtotal − discount`. | DB (line, header) + Logic (sum) |
| BR-07 | Stock is deducted exactly once per order: only on the transition PENDING/new → COMPLETED. | Logic + DB (`order_item_id` required for SALE) |
| BR-08 | Expired, quarantined and depleted batches can't be sold. | Logic (sellable-batch query) |
| BR-09 | Every change to `quantity_remaining` has a matching `stock_movements` row in the same transaction. | Logic + DB trigger |
| BR-10 | Prices on completed orders never change when catalogue prices change. | DB (price copied to `order_items`) |
| BR-11 | Inactive medicines can't be added to a cart or receive new stock. | Logic |
| BR-12 | Only authorised roles can change inventory, catalogue, users or settings (see §6.3). | Logic |
| BR-13 | Refunds never delete history; they add RETURN (and possibly WRITE_OFF) movements. | Logic + DB (no delete on movements) |
| BR-14 | Checkout, refund, receiving, adjustment and write-off each succeed or fail as one transaction. | Logic |
| BR-15 | Medicines, customers, users, suppliers, batches and completed orders with history are never physically deleted (use `is_active`). | DB (`ON DELETE RESTRICT`) |
| BR-16 | **FEFO:** sales take stock from the sellable batch with the earliest expiry date first, then the next. | Logic |
| BR-17 | Rx-only items need a prescription verified by a Pharmacist or Admin. | Logic + DB (`verified_by` FK) |
| BR-18 | ADJUSTMENT, WRITE_OFF and RETURN movements need a reason. | DB (`CHECK`) |
| BR-19 | You can't return more than was sold minus what was already returned. | DB (`quantity_returned ≤ quantity`) |
| BR-20 | A discount can't exceed the subtotal. Cashiers may give at most 10 %; more needs Pharmacist/Admin. | DB + Logic |
| BR-21 | The last active Admin can't be deactivated or demoted. | Logic |
| BR-22 | Stock movements are never updated or deleted. | DB trigger |

## 6.2 Input validation

| Field | Rule | Error message |
| --- | --- | --- |
| Username | 3–30 chars, letters, digits, `.` `_`; unique | "Username already taken" |
| Password | ≥ 8 chars, at least one letter and one digit | "Use at least 8 characters with a letter and a number" |
| Brand / generic name | Required, 1–100 chars, trimmed | "Name is required" |
| Selling / purchase price | Whole number ≥ 0, ≤ 10 000 000 | "Enter a price in tögrög, no decimals" |
| Barcode | Empty, or 8–14 digits; unique | "Barcode already used by Panadol 500 mg" |
| Min stock level | Whole number ≥ 0 | |
| Quantity received | Whole number > 0 | |
| Batch number | Required; unique for the same medicine and supplier | "This batch is already recorded" |
| Expiry date | `YYYY-MM-DD`, real date, after received date; warn if already within warning days | "Expiry must be after the received date" |
| Sale quantity | Whole number > 0 and ≤ sellable stock | "Only 4 available" |
| Phone | Empty, or 6–20 chars of digits, spaces, `+ - ( )`; unique for customers | |
| Email | Empty, or contains `@` and a dot after it | |
| Adjustment | Non-zero; resulting quantity between 0 and received; reason required | |

## 6.3 Permission matrix

✅ allowed · ⚠️ allowed with limits · ❌ not allowed

| Feature | Admin | Pharmacist | Cashier |
| --- | --- | --- | --- |
| View dashboard | ✅ | ✅ | ✅ |
| Search / view medicines and stock | ✅ | ✅ | ✅ |
| Add / edit / deactivate medicines | ✅ | ✅ | ❌ |
| Manage categories | ✅ | ❌ | ❌ |
| Manage suppliers | ✅ | ✅ | ❌ |
| Receive stock | ✅ | ✅ | ❌ |
| Adjust / write off / quarantine stock | ✅ | ✅ | ❌ |
| Sell non-prescription items | ✅ | ✅ | ✅ |
| Verify prescription / sell Rx items | ✅ | ✅ | ❌ |
| Give discount | ✅ | ✅ | ⚠️ ≤ 10 % |
| Cancel pending order | ✅ | ✅ | ⚠️ own orders |
| Refund completed order | ✅ | ✅ | ❌ |
| View order history | ✅ | ✅ | ⚠️ own orders |
| Manage customers | ✅ | ✅ | ✅ |
| Reports | ✅ all | ✅ all but profit | ⚠️ own sales today |
| Manage staff accounts | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |
| Backup / restore | ✅ | ❌ | ❌ |
| SQL console (dev tool) | ✅ | ❌ | ❌ |

Permissions are checked in the business-logic function that performs the action (e.g. `receiveBatch` checks the
role), not only by hiding the button.

## 6.4 Security and privacy

- Passwords: per-user random salt + slow hash. Never log or display them.
- Auto-lock after `auto_lock_minutes` of inactivity; the current user must log in again.
- SQL: always use parameterised queries (`?` placeholders), never string-concatenated user input.
- Customer data: name and phone only by default; no health data. Don't write customer data to console logs.
- Backups contain all data: tell the user to keep backup files private. Optional: encrypt the database with
  SQLCipher (`expo-sqlite` config plugin option `useSQLCipher`), which needs a development build.
- Regulatory: before real use, check local pharmacy law on prescription records, retention periods and who may dispense.
