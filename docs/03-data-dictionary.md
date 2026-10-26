# 3. Data Dictionary

Conventions used in every table:

- **Types** are SQLite storage classes: `INTEGER`, `TEXT`. (SQLite also has `REAL` and `BLOB`; neither is needed.)
- **Booleans** are `INTEGER` 0/1 with `CHECK (col IN (0,1))`.
- **Money** is `INTEGER` whole MNT (tögrög). `12 500₮` is stored as `12500`.
- **Timestamps** are `TEXT` `YYYY-MM-DD HH:MM:SS` in **local device time** (default `datetime('now','localtime')`).
- **Dates** are `TEXT` `YYYY-MM-DD`. This format sorts and compares correctly as text.
- **PK** columns are `INTEGER PRIMARY KEY AUTOINCREMENT` (IDs are never reused).
- **Text uniqueness** on names uses `COLLATE NOCASE` so `Vitamins` and `vitamins` count as duplicates.

---

## 3.1 `users`

Staff accounts that can log in.

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| user_id | INTEGER | No | auto | PK | Internal ID |
| full_name | TEXT | No | | length 2–100 | Shown on receipts and reports |
| username | TEXT | No | | UNIQUE NOCASE, 3–30 chars, letters/digits/`._` | Login name |
| password_hash | TEXT | No | | | Salted slow hash (e.g. PBKDF2‑SHA256, ≥100 000 iterations). **Never** the password itself |
| password_salt | TEXT | No | | 16+ random bytes, hex | Per-user salt |
| role | TEXT | No | | `ADMIN`, `PHARMACIST`, `CASHIER` | Controls permissions |
| is_active | INTEGER | No | 1 | 0/1 | Deactivated users can't log in but stay in history |
| last_login_at | TEXT | Yes | | | Updated on successful login |
| created_at | TEXT | No | now | | |

Rule: the last active `ADMIN` can't be deactivated or demoted.

## 3.2 `categories`

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| category_id | INTEGER | No | auto | PK | |
| category_name | TEXT | No | | UNIQUE NOCASE, 2–50 chars | e.g. *Pain relief* |
| description | TEXT | Yes | | ≤ 200 chars | |
| is_active | INTEGER | No | 1 | 0/1 | Inactive categories are hidden from pickers |

Sample values: Pain relief & fever, Antibiotics, Vitamins & supplements, Cold & allergy, Digestive health,
First aid, Skin care, Baby & mother.

## 3.3 `medicines`

The catalogue. One row per sellable product/pack.

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| medicine_id | INTEGER | No | auto | PK | |
| category_id | INTEGER | No | | FK → categories, RESTRICT | |
| brand_name | TEXT | No | | 1–100 chars | Trade name, e.g. *Panadol* |
| generic_name | TEXT | No | | 1–100 chars | Active ingredient, e.g. *Paracetamol*. Staff often search by this |
| strength | TEXT | Yes | | ≤ 30 chars | e.g. `500 mg`, `250 mg/5 ml` |
| dosage_form | TEXT | No | | `TABLET`, `CAPSULE`, `SYRUP`, `SUSPENSION`, `INJECTION`, `CREAM`, `OINTMENT`, `DROPS`, `SPRAY`, `INHALER`, `POWDER`, `DEVICE`, `OTHER` | |
| unit | TEXT | No | | ≤ 30 chars | What one sold unit is, e.g. `box of 20`, `bottle 100 ml` |
| barcode | TEXT | Yes | | UNIQUE when not NULL; digits, 8–14 | EAN/UPC |
| selling_price | INTEGER | No | | ≥ 0 | Current price per unit, MNT |
| min_stock_level | INTEGER | No | 10 | ≥ 0 | Reorder point for low-stock alert |
| requires_prescription | INTEGER | No | 0 | 0/1 | Rx-only medicine |
| is_active | INTEGER | No | 1 | 0/1 | Inactive = can't be sold or received, stays in history |
| created_at | TEXT | No | now | | |
| updated_at | TEXT | No | now | | Set on every edit |

Unique together: (`brand_name`, `strength`, `dosage_form`, `unit`) — prevents duplicate catalogue entries.

## 3.4 `suppliers`

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| supplier_id | INTEGER | No | auto | PK | |
| supplier_name | TEXT | No | | UNIQUE NOCASE, 2–100 chars | |
| contact_person | TEXT | Yes | | | |
| phone | TEXT | Yes | | 6–20 chars, digits/`+ -()` | |
| email | TEXT | Yes | | valid e-mail shape | |
| address | TEXT | Yes | | ≤ 200 chars | |
| is_active | INTEGER | No | 1 | 0/1 | |

## 3.5 `medicine_batches`

One delivery (lot) of one medicine.

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| batch_id | INTEGER | No | auto | PK | |
| medicine_id | INTEGER | No | | FK → medicines, RESTRICT | |
| supplier_id | INTEGER | Yes | | FK → suppliers, SET NULL | NULL for opening stock |
| batch_number | TEXT | No | | 1–40 chars | Lot number printed on the box |
| purchase_price | INTEGER | No | | ≥ 0 | Cost per unit, MNT (used for profit and stock valuation) |
| quantity_received | INTEGER | No | | > 0 | Never changes after receiving |
| quantity_remaining | INTEGER | No | | 0 ≤ x ≤ quantity_received | Cached balance. Starts at 0; changed only by the `trg_movement_apply` trigger when a movement is inserted |
| received_date | TEXT | No | today | valid date, not in the future | |
| expiry_date | TEXT | No | | valid date, > received_date | Last day the batch may be sold |
| is_active | INTEGER | No | 1 | 0/1 | 0 = quarantined or recalled: not sellable, still counted in reports |
| created_at | TEXT | No | now | | |

Unique together: (`medicine_id`, `supplier_id`, `batch_number`).

**Derived batch state** (computed, not stored — see the state diagram in [§4.6](04-system-diagrams.md#46-state-diagrams)):

| State | Condition |
| --- | --- |
| `DEPLETED` | `quantity_remaining = 0` |
| `QUARANTINED` | `is_active = 0` |
| `EXPIRED` | `expiry_date < today` |
| `NEAR_EXPIRY` | `expiry_date ≤ today + expiry_warning_days` |
| `SELLABLE` | none of the above |

A batch is **sellable** when `is_active = 1 AND quantity_remaining > 0 AND expiry_date >= today`.

## 3.6 `customers`

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| customer_id | INTEGER | No | auto | PK | |
| full_name | TEXT | No | | 2–100 chars | |
| phone | TEXT | Yes | | UNIQUE when not NULL | Main lookup key at the counter |
| email | TEXT | Yes | | valid e-mail shape | |
| notes | TEXT | Yes | | ≤ 200 chars | Non-medical notes only (e.g. "prefers SMS") |
| created_at | TEXT | No | now | | |

Privacy: don't store diagnoses, allergies or other health data here.

## 3.7 `prescriptions`

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| prescription_id | INTEGER | No | auto | PK | |
| customer_id | INTEGER | Yes | | FK → customers, SET NULL | If the patient is a registered customer |
| verified_by | INTEGER | No | | FK → users, RESTRICT; user must be PHARMACIST or ADMIN | |
| patient_name | TEXT | No | | 2–100 chars | |
| prescriber_name | TEXT | No | | 2–100 chars | Doctor's name |
| prescription_number | TEXT | Yes | | ≤ 40 chars | Number on the paper prescription |
| issue_date | TEXT | No | | valid date, not in future | |
| verified_at | TEXT | No | now | | |
| notes | TEXT | Yes | | | |

## 3.8 `orders`

Header of a sale.

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| order_id | INTEGER | No | auto | PK | |
| order_number | TEXT | No | | UNIQUE | `PC-YYYYMMDD-NNNN`, shown on receipt |
| customer_id | INTEGER | Yes | | FK → customers, RESTRICT | NULL = walk-in |
| user_id | INTEGER | No | | FK → users, RESTRICT | Who processed the sale |
| status | TEXT | No | `PENDING` | `PENDING`, `COMPLETED`, `CANCELLED`, `REFUNDED` | See state diagram |
| payment_method | TEXT | Yes | | `CASH`, `CARD`, `QPAY`, `OTHER` | Required when COMPLETED |
| payment_status | TEXT | No | `UNPAID` | `UNPAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED` | |
| subtotal | INTEGER | No | 0 | ≥ 0 | Sum of `line_total` |
| discount_amount | INTEGER | No | 0 | 0 ≤ x ≤ subtotal | |
| total_amount | INTEGER | No | 0 | = subtotal − discount_amount | Amount paid |
| refunded_amount | INTEGER | No | 0 | 0 ≤ x ≤ total_amount | |
| created_at | TEXT | No | now | | When the cart was started/saved |
| completed_at | TEXT | Yes | | NOT NULL when COMPLETED/REFUNDED | Sale date used by reports |
| cancelled_at | TEXT | Yes | | NOT NULL when CANCELLED | |
| notes | TEXT | Yes | | | Cancel / refund reason etc. |

## 3.9 `order_items`

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| order_item_id | INTEGER | No | auto | PK | |
| order_id | INTEGER | No | | FK → orders, CASCADE | |
| medicine_id | INTEGER | No | | FK → medicines, RESTRICT | |
| prescription_id | INTEGER | Yes | | FK → prescriptions, RESTRICT | Required when the medicine is Rx-only |
| quantity | INTEGER | No | | > 0 | Units sold |
| unit_price | INTEGER | No | | ≥ 0 | Copied from `medicines.selling_price` at checkout |
| line_total | INTEGER | No | | = quantity × unit_price | |
| quantity_returned | INTEGER | No | 0 | 0 ≤ x ≤ quantity | Running total of returns |

Unique together: (`order_id`, `medicine_id`).

## 3.10 `stock_movements`

Append-only stock ledger. **Never UPDATE or DELETE** rows here.

| Column | Type | Null | Default | Constraint | Description |
| --- | --- | --- | --- | --- | --- |
| movement_id | INTEGER | No | auto | PK | |
| batch_id | INTEGER | No | | FK → medicine_batches, RESTRICT | |
| user_id | INTEGER | No | | FK → users, RESTRICT | Who made the change |
| order_item_id | INTEGER | Yes | | FK → order_items, RESTRICT; required for SALE/RETURN | |
| movement_type | TEXT | No | | `RECEIPT`, `SALE`, `RETURN`, `ADJUSTMENT`, `WRITE_OFF` | |
| quantity_change | INTEGER | No | | ≠ 0, sign matches type ([§2.7](02-erd-and-database.md#27-constraints-summary)) | |
| reason | TEXT | Yes | | required for RETURN, ADJUSTMENT, WRITE_OFF | |
| movement_date | TEXT | No | now | | |

## 3.11 `app_settings`

| Column | Type | Null | Description |
| --- | --- | --- | --- |
| setting_key | TEXT | No | PK |
| setting_value | TEXT | No | Stored as text, parsed by the app |
| updated_at | TEXT | No | |

| Key | Default | Meaning |
| --- | --- | --- |
| `pharmacy_name` | `PharmaCare` | Shown on receipts |
| `expiry_warning_days` | `90` | Batches expiring within this many days are flagged *near expiry* |
| `default_min_stock` | `10` | Pre-filled reorder level for new medicines |
| `auto_lock_minutes` | `5` | Lock the app after inactivity |
| `receipt_footer` | `Thank you!` | Last line of the receipt |

> 90 days is a common pharmacy default because many medicines can't be returned to the supplier close to expiry.
> The earlier draft used 30; either is fine as long as it's a setting.
