# 7. Dashboard & Reports

Every figure comes from a SQL query over stored data, never from hard-coded numbers. Definitions below are
written so each one is unambiguous and the same everywhere in the app.

## 7.1 Shared definitions

| Term | Definition |
| --- | --- |
| **Sellable batch** | `is_active = 1 AND quantity_remaining > 0 AND expiry_date >= today` |
| **Sellable stock** of a medicine | Σ `quantity_remaining` of its sellable batches |
| **Stock on hand** | Σ `quantity_remaining` of all batches, including expired / quarantined (physically on the shelf) |
| **Low stock** | Active medicine whose sellable stock ≤ `min_stock_level` |
| **Out of stock** | Active medicine with sellable stock = 0 |
| **Near expiry** | Batch with stock, `today ≤ expiry_date ≤ today + expiry_warning_days` |
| **Expired** | Batch with stock, `expiry_date < today` |
| **Sale date** | `orders.completed_at` |
| **Counted sale** | Order with status `COMPLETED` or `REFUNDED` (a refunded sale happened, then was refunded) |
| **Gross sales** | Σ `total_amount` of counted sales |
| **Refunds** | Σ `refunded_amount` of counted sales |
| **Net sales (revenue)** | Gross sales − refunds |
| **Cost of goods sold (COGS)** | Σ over SALE movements of `−quantity_change × batch.purchase_price`, minus the same for RETURN movements |
| **Gross profit** | Net sales − COGS |

## 7.2 Dashboard tiles

| Tile | Source |
| --- | --- |
| Today's net sales | Net sales where sale date = today |
| Orders today | Count of counted sales today |
| Active medicines | Count of `medicines` where `is_active = 1` |
| Sellable units | Σ sellable stock of all active medicines |
| Low stock | Count of low-stock medicines (out-of-stock included) |
| Near expiry | Count of near-expiry batches |
| Expired (needs write-off) | Count of expired batches with stock |
| Inventory value (cost) | Σ `quantity_remaining × purchase_price` over sellable batches |

## 7.3 Reports

| # | Report | Columns | Filters |
| --- | --- | --- | --- |
| R1 | Sales summary by day | Date, orders, gross, refunds, net, avg. order value | Date range |
| R2 | Best-selling medicines | Medicine, units sold (net of returns), net revenue, share % | Date range, category, top N |
| R3 | Sales by category | Category, units, net revenue | Date range |
| R4 | Sales by staff | Staff, orders, net sales | Date range |
| R5 | Sales by payment method | Method, orders, amount | Date range |
| R6 | Low-stock / reorder list | Medicine, sellable stock, min level, shortfall, last supplier | — |
| R7 | Expiry report | Medicine, batch, supplier, expiry, days left, remaining, value at cost | Expired / near expiry / all |
| R8 | Inventory valuation | Category, units, value at cost, value at selling price | — |
| R9 | Stock movement log | Date, medicine, batch, type, change, user, reason, order no. | Date range, type, medicine |
| R10 | Gross profit | Date, net sales, COGS, gross profit, margin % | Date range (Admin only) |
| R11 | Customer history | Customer, orders, total spent, last visit | Search |
| R12 | Write-offs & adjustments | Date, medicine, batch, qty, value lost, reason, user | Date range |

## 7.4 Integrity checks (run in tests and from the About screen)

| Check | Should return |
| --- | --- |
| Batches where `quantity_remaining ≠ Σ movements` | 0 rows |
| Completed orders without items | 0 rows |
| Orders where `subtotal ≠ Σ line_total` | 0 rows |
| Order items where Σ `−SALE movements` ≠ `quantity` | 0 rows |
| Rx-only order items without `prescription_id` | 0 rows |
| `PRAGMA foreign_key_check` | 0 rows |
| `PRAGMA integrity_check` | `ok` |
