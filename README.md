# PharmaCare — offline pharmacy app (Expo + SQLite)

A mobile pharmacy management prototype for Android and iOS. It runs fully **offline** and stores everything in a
local **SQLite** database on the phone: medicine catalogue, batch inventory with expiry dates, customers,
prescriptions, sales, refunds and an append-only stock ledger.

📄 **Design documents** (ERD, data dictionary, UML diagrams, UI, business rules, reports, tests): [`docs/`](docs/README.md)

> Prototype: no server, no cloud sync. Each device has its own database (`pharmacare.db` in the app's private
> storage, or the browser's storage on web). Before real pharmacy use, the dispensing workflow must follow local law.

## Requirements

- Node.js 22+ and npm
- An Android phone with **Expo Go**, an Android emulator, an iOS simulator (macOS), or a desktop browser

## Run it

```bash
npm install
npx expo start          # then press a = Android, i = iOS, w = web
```

With Expo Go on a phone, scan the QR code shown by `npx expo start` (phone and computer on the same network).

### Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `admin123` |
| Pharmacist | `pharmacist` | `pharm123` |
| Cashier | `cashier` | `cashier123` |

## Checks

```bash
npm test             # 33 tests: backend rules (schema, triggers, services, reports on Node's built-in SQLite) and translations
npm run typecheck    # TypeScript (app + tests)
npm run lint         # ESLint (expo lint)
```

## Features

| Tab | What it does |
| --- | --- |
| **Dashboard** | Today's sales, sellable units, low-stock, near-expiry and expired alerts, stock value, recent sales — all from SQL |
| **Medicines** | Search by brand / generic name / barcode, filter by category or stock state, add / edit / deactivate, see batches |
| **Sell** | Cart, FEFO batch allocation, prescription check for Rx-only items, discounts, payment method, receipt |
| **Inventory** | Batches by expiry state, receive stock, adjust, write off, quarantine, full movement log |
| **More** | Orders & refunds, customers, suppliers, categories, 11 reports, staff accounts, settings, backup/restore, integrity check, SQL console |

## Language and theme

- **Languages:** Монгол (default) and English. The switcher (МН / EN) is in the app bar and on the login screen, and again, with full names, under **More → Settings**. The choice is saved on the device and applies immediately without a reload.
- **Theme:** light and dark, toggled with the sun/moon button in the app bar (or under Settings). With no saved choice the app follows the device setting; an explicit choice is saved and always wins.
- Medicine names, categories, units, receipt footer and other stored records are data and are shown exactly as stored in both languages. Only the interface around them is translated.

### Adding or changing text

All interface text lives in `src/i18n/locales/en.ts` (defines the keys) and `src/i18n/locales/mn.ts` (must contain every key; the type check fails otherwise). Use `const { t, tn } = useI18n()` in components, or `t()` from `src/i18n/core.ts` in services. Plurals are `<key>_one` / `<key>_other`, read with `tn(key, count)`. Dates, numbers and money go through `src/format.ts`.

### Colours

Colours are tokens in `src/theme.tsx` (`light` and `dark` palettes). Components never hardcode hex values: define styles with `makeStyles((colors) => ({ ... }))` and call the returned hook in the component.

## The SQL backend

- **11 tables**: `users`, `categories`, `medicines`, `suppliers`, `medicine_batches`, `customers`, `prescriptions`,
  `orders`, `order_items`, `stock_movements`, `app_settings` (+ `query_history` for the SQL console).
- **Constraints**: foreign keys (enforced on every connection), `CHECK` constraints for money, quantities, dates,
  enums and sign conventions, `UNIQUE` indexes.
- **Triggers** enforce the important business rules inside SQLite, so they hold even for SQL typed into the console:
  the stock ledger is append-only and keeps `quantity_remaining` in step; expired or quarantined batches can't be
  sold; stock can't be deducted twice; completed orders can't be edited or deleted; Rx-only items need a prescription
  verified by a pharmacist; the order status follows a state machine; the last admin can't be removed.
- **Views**: `v_batch_status`, `v_medicine_stock`, `v_sales`, `v_line_cost`, `v_integrity_issues`.
- **Transactions**: checkout, refunds, receiving, adjustments and write-offs are each all-or-nothing.
- **Passwords**: PBKDF2-HMAC-SHA256 with per-user salt.

## Project structure

```
App.tsx                    app shell: providers, login gate, side rail (wide) or bottom tabs, language + theme controls
src/i18n/                  translation core (t / tn), React provider, English and Mongolian dictionaries
src/theme.tsx              light/dark palettes, ThemeProvider, makeStyles
src/preferences.ts         saved language and theme (kv-store on device, localStorage on web)
src/db/schema.ts           tables, constraints, indexes, triggers, views, migration (PRAGMA user_version)
src/db/seed.ts             demo data (goes through the same service functions as the app)
src/db/repository.ts       read queries for the screens
src/db/reports.ts          report queries
src/db/transaction.ts      serialised transactions on the main connection
src/services/              business logic + permission checks: sales, inventory, catalog, users, settings, backup, password
src/screens/               Login, Dashboard, Medicines, Sell, Inventory, more/ (Orders, people, Reports, Settings), database/ (SQL console)
src/components/            buttons, fields, sheets, select, data table, toasts, language/theme controls, form hooks
tests/                     backend tests on node:sqlite
docs/                      design documentation (ERD, diagrams, rules, tests)
```
