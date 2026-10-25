# Java-React-Native-App — Inventory Manager (prototype)

A local-only React Native (Expo) prototype for managing **products, customers and orders**, backed by an
on-device **SQLite** database, with a built-in **SQL editor** and **table browser**.

> Prototype scope: no backend, authentication, deployment or CI. All data lives in a local SQLite file
> (`inventory.db`) on the device/emulator (or in the browser's private storage on web).

## Requirements

- Node.js 20+ and npm
- One of:
  - Android emulator (Android Studio) or a phone with the **Expo Go** app
  - iOS simulator (macOS + Xcode)
  - A modern desktop browser (Chrome/Edge/Firefox) for the web build

## Run it

```bash
npm install
npx expo start          # then press  a = Android,  i = iOS,  w = web
# or directly:
npm run android
npm run web
```

With Expo Go on a phone, scan the QR code shown by `npx expo start` (phone and computer on the same network).

Type-check: `npm run typecheck`

## What's inside

| Tab | What it demonstrates |
| --- | --- |
| **Overview** | Live stats computed with SQL (counts, revenue, stock value), low-stock list, recent orders table |
| **Products** | Search, create / edit / delete with validation (unique SKU, price ≥ 0, whole-number stock), category picker |
| **Customers** | Search, create / edit / delete with email/phone validation; order count & total spent via `JOIN`/`GROUP BY` |
| **Orders** | Create orders (stock is checked and decremented in a transaction), ship → deliver / cancel (restocks), delete, status filter |
| **Database** | **SQL Editor**: run any SQL (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `PRAGMA`, multiple statements), results grid with column names and row counts, rows-affected / last-insert-id, timing, readable errors, example queries, persisted query history. **Table Browser**: every table/view with row counts, column schema, foreign keys, `CREATE` statement, paged records, "Reset to sample data" |

Every write — from a form or from the SQL editor — triggers a refresh of all screens, so the lists, the
dashboard and the table browser always show what is actually stored.

### Database schema

`categories`, `products` (→ categories), `customers`, `orders` (→ customers, products) and `query_history`.
The schema and realistic sample data are created on first launch (`src/db/schema.ts`, `src/db/seed.ts`).
Foreign keys are enforced, so e.g. deleting a customer who still has orders is refused with a clear message.

## Demo script (≈2 minutes)

1. **Overview** — note the counts and the low-stock list.
2. **Products → + Add** — try saving with an empty name or a duplicate SKU such as `EL-1001` to see validation; then add a real product.
3. **Orders → + New order** — pick a customer and product, set a quantity; the product's stock drops. Mark it shipped, then cancel another order and watch stock return.
4. **Database → SQL Editor** — tap the *Orders with names (JOIN)* example and **Run**. Then run *UPDATE restock* and switch to **Products**: the quantities have changed.
5. Run the *CREATE TABLE* example (three statements), open **Table Browser** and select `suppliers` to inspect its schema and records.
6. Run *Error example* to see a readable error. Tap any entry under **History** to load it again.
7. **Table Browser → Reset** restores the original sample data.

## Project structure

```
App.tsx                      app shell, bottom tabs, SQLiteProvider
metro.config.js              wasm + COOP/COEP headers so expo-sqlite works on web
src/db/schema.ts             schema, migration (PRAGMA user_version), reset
src/db/seed.ts               sample data
src/db/repository.ts         typed CRUD queries for the app screens
src/db/sqlRunner.ts          SQL editor engine, query history, schema browser queries
src/db/DataContext.tsx       change notifications + useDbQuery hook
src/screens/                 Overview, Products, Customers, Orders, database/ (editor + browser)
src/components/              buttons, fields, modal form, select, data table, toasts
```
