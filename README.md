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
npm test             # 48 tests: backend rules, migrations and database tools (on Node's built-in SQLite) and translations
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
| **More** | Orders & refunds, customers, suppliers, categories, 11 reports, staff accounts, settings, backup/restore, integrity check, database console (overview, SQL editor with query plans, table browser) |

## Language and theme

- **Languages:** Монгол (default) and English. The switcher (МН / EN) is in the app bar and on the login screen, and again, with full names, under **More → Settings**. The choice is saved on the device and applies immediately without a reload.
- **Theme:** light and dark, toggled with the sun/moon button in the app bar (or under Settings). With no saved choice the app follows the device setting; an explicit choice is saved and always wins.
- Medicine names, categories, units, receipt footer and other stored records are data and are shown exactly as stored in both languages. Only the interface around them is translated.

### Adding or changing text

All interface text lives in `src/i18n/locales/en.ts` (defines the keys) and `src/i18n/locales/mn.ts` (must contain every key; the type check fails otherwise). Use `const { t, tn } = useI18n()` in components, or `t()` from `src/i18n/core.ts` in services. Plurals are `<key>_one` / `<key>_other`, read with `tn(key, count)`. Dates, numbers and money go through `src/format.ts`.

### Colours

Colours are tokens in `src/theme.tsx` (`light` and `dark` palettes). Components never hardcode hex values: define styles with `makeStyles((colors) => ({ ... }))` and call the returned hook in the component.

### Motion

Animations use React Native's `Animated` API on the native driver (no extra native modules, so it runs in Expo Go and on web). Timings, easings and springs live in one place, `src/components/motion.tsx`, together with the building blocks:

| Where | What moves |
| --- | --- |
| Sheets, forms, pickers (`ModalFrame`) | Phone: the sheet springs up, can be dragged down by its header to close, and slides away with its content intact; the backdrop fades on its own. Wide screens: a centred dialog fades and scales in |
| Buttons, chips, list rows, tabs (`PressableScale`) | Dip slightly while pressed and spring back |
| Lists (`ListItem index`, `Enter`) | Rows fade and rise in one after another (capped, so long lists don't trickle) |
| Tabs, segmented controls, language/theme switches (`useIndicator`) | The highlight slides to the chosen item; switching tabs fades the screen in |
| Dashboard (`CountUp`) | Figures count up from their previous value, so a new sale visibly adds to the total |
| Toasts, login, cart | Toasts drop in and slide away (tap to dismiss); a wrong password shakes the form; cart quantities pop |

When the device asks to **reduce motion**, slides, scales and springs are skipped and at most a short fade remains.

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
- **Indexes** for every search, join and report filter, including expression indexes on the sale day and movement day
  and a partial index for FEFO allocation (check them with *Explain* in the SQL editor).
- **Migrations** (`src/db/migrations.ts`): each schema change is a numbered migration; pending ones run in order inside
  one transaction on start-up, and `PRAGMA user_version` records the last one applied. Triggers and views are rebuilt
  from their current definitions after an upgrade. A restored backup from an older version is upgraded the same way;
  one from a newer version is refused.
- **Connection**: foreign keys on, a busy timeout, and write-ahead logging (`journal_mode = WAL`, `synchronous = NORMAL`)
  on Android and iOS for faster commits.
- **Transactions**: checkout, refunds, receiving, adjustments and write-offs are each all-or-nothing. Writes and screen
  reads take turns on the one connection (`src/db/transaction.ts`), so a screen never shows a half-finished sale.
- **Refreshing**: after a write, the visible screen re-queries; tabs in the background catch up when they are opened.
- **Passwords**: PBKDF2-HMAC-SHA256 with per-user salt.

## Project structure

```
App.tsx                    app shell: providers, login gate, side rail (wide) or bottom tabs, language + theme controls
src/i18n/                  translation core (t / tn), React provider, English and Mongolian dictionaries
src/theme.tsx              light/dark palettes, ThemeProvider, makeStyles
src/preferences.ts         saved language and theme (kv-store on device, localStorage on web)
src/db/schema.ts           tables, constraints, indexes, triggers, views (SQL definitions)
src/db/migrations.ts       versioned migrations (PRAGMA user_version), connection settings, reset
src/db/open.ts             opens the database on start-up (migrate + WAL on native)
src/db/seed.ts             demo data (goes through the same service functions as the app)
src/db/repository.ts       read queries for the screens
src/db/reports.ts          report queries
src/db/sqlRunner.ts        SQL console: script runner, schema browser, query plans, overview, health check, maintenance
src/db/transaction.ts      one queue for transactions and screen reads on the main connection
src/db/DataContext.tsx     useDbQuery: reload after writes, paused for hidden tabs
src/services/              business logic + permission checks: sales, inventory, catalog, users, settings, backup, password
src/screens/               Login, Dashboard, Medicines, Sell, Inventory, more/ (Orders, people, Reports, Settings), database/ (SQL console)
src/components/            buttons, fields, sheets, select, data table, toasts, language/theme controls, form hooks
src/components/motion.tsx  motion system: timings, springs, entrance, presence, indicators, count-up, reduced motion
tests/                     backend, database and translation tests on node:sqlite
docs/                      design documentation (ERD, diagrams, rules, tests)
```
