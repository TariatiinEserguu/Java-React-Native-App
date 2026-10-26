# 8. Testing, Roadmap & Checklist

## 8.1 How the backend is tested

`npm test` runs `tests/backend.test.ts` with Node's test runner. `tests/nodeDb.ts` puts Node's built-in SQLite
(`node:sqlite`) behind the same small async API the app uses from `expo-sqlite`, so the tests run the **real** schema,
triggers, views, seed data, services and reports — no mocks. Each test starts from a fresh in-memory database.

Many tests also bypass the services and send raw SQL, to prove the **database itself** refuses bad data (the same
protection applies to anything typed into the in-app SQL console).

## 8.2 Acceptance tests

| ID | Scenario | Expected result | How it's checked |
| --- | --- | --- | --- |
| TC-01 | Log in with valid credentials | Dashboard opens with the user's role | Automated + manual |
| TC-02 | Log in with a wrong password / unknown user | Same "Incorrect username or password" message | Automated + manual |
| TC-03 | Add a medicine with valid data | Saved and listed | Automated |
| TC-04 | Negative or fractional selling price | Rejected by the form **and** by a `CHECK` constraint | Automated |
| TC-05 | Search by brand or generic name | Matching medicines shown | Automated |
| TC-06 | Receive a batch | Stock rises; one `RECEIPT` movement | Automated |
| TC-07 | Sell available stock | Order `COMPLETED`, stock falls, FEFO split across batches | Automated + manual |
| TC-08 | Sell more than available | Rejected; **nothing** saved (other cart lines rolled back too) | Automated |
| TC-09 | Only expired / quarantined stock | Can't be sold; a direct SQL `SALE` on an expired batch is refused by a trigger | Automated |
| TC-10 | Deduct stock twice / edit a completed order | Refused by triggers | Automated |
| TC-11 | Change catalogue price after a sale | Old order keeps its price | Automated |
| TC-12 | Partial and full refund | Stock restored (or written off), refunded amounts and status correct, history kept | Automated |
| TC-13 | Close and reopen the app | Data still there (SQLite file) | Manual |
| TC-14 | Airplane mode | Everything works | Manual |
| TC-15 | Cashier tries a restricted action | `PermissionError`; button hidden in the UI | Automated + manual |
| TC-16 | Create a backup, change data, restore | Data returns to the backup state | Manual (Android/iOS) |
| TC-17 | Rx-only medicine without prescription | Cashier blocked; pharmacist must record a prescription | Automated |
| TC-18 | Cashier discount above 10 % | Rejected | Automated |
| TC-19 | Adjustment without reason / below zero | Rejected | Automated |
| TC-20 | Edit or delete a stock movement | Refused by triggers | Automated |
| TC-21 | Integrity check after all operations | `v_integrity_issues` empty, `PRAGMA foreign_key_check` empty | Automated (+ Settings screen) |
| TC-22 | Deactivate or demote the last admin | Refused by a trigger | Automated |
| TC-23 | Password hashing | SHA-256 and PBKDF2 match RFC test vectors and Node's crypto | Automated |

Latest run: **22 automated tests, 22 passed** (several IDs above share one test). The web build was also driven
end-to-end in a headless browser (login → dashboard → sale → receipt → inventory → reports → integrity check) with no
console errors.

### Manual test script (≈5 minutes, on a phone)

1. Log in as **cashier / cashier123**. Note: no *Receive* button, no Reports, Rx medicines show "Ask a pharmacist".
2. **Sell** → add ParaCare 500 mg × 2 and VitaC Max × 1 → Checkout → Cash → Confirm. Check the receipt.
3. Log out (More → Log out), log in as **pharmacist / pharm123**.
4. **Sell** → add Amoxil-M → fill the prescription form → Checkout. The order detail shows "Rx by …".
5. **Inventory** → *Expired* → open Ciproxin-M batch CP2404 → *Write off* all 12 (reason pre-filled). Dashboard "Expired" drops by one.
6. **More → Orders** → open the first sale → *Refund items* → 1 × ParaCare, reason "unopened". Stock goes back up.
7. **Inventory → Movement log** shows RECEIPT, SALE, RETURN and WRITE_OFF lines.
8. Log in as **admin / admin123** → **More → Settings & backup** → *Create backup* → sell something → *Restore backup* → the sale is gone.
9. **More → SQL console** → run the *Trigger blocks an edit* and *CHECK blocks bad data* examples to see the database refuse them.

## 8.3 Implementation status

| Area | Status |
| --- | --- |
| Schema: 11 tables, CHECK / UNIQUE / FK constraints, 17 triggers, 5 views, indexes | ✅ `src/db/schema.ts` |
| Demo data: 3 users, 8 categories, 4 suppliers, 24 medicines, 28 batches, 6 customers, 25 sales, refund, adjustment, write-off | ✅ `src/db/seed.ts` |
| Login with roles, auto-lock, password change | ✅ |
| Medicines, categories, suppliers, customers, staff (CRUD + deactivate) | ✅ |
| Batch receiving, adjustments, write-offs, quarantine, movement history | ✅ |
| Checkout with FEFO, prescriptions, discounts, receipt | ✅ |
| Refunds (partial/full, restock or write off) | ✅ |
| Dashboard and 11 SQL reports | ✅ |
| Backup & restore (on-device copy) | ✅ Android/iOS; not on web |
| Integrity check screen | ✅ |
| PENDING (saved) carts — FR-12 | ⏳ Schema and state machine ready, no screen yet |
| Export backup file off the phone, barcode scanning, Expo Router navigation | ⏳ Future work |

## 8.4 Roadmap

| Stage | Content | Deliverable |
| --- | --- | --- |
| 1. Requirements & diagrams | Scope, ERD, data dictionary, UML, UI plan, rules | `docs/` (this folder) ✅ |
| 2. Database foundation | Tables, constraints, triggers, views, seed data, tests | `src/db`, `tests` ✅ |
| 3. Catalogue & inventory | Medicines, batches, receiving, adjustments, expiry | Screens ✅ |
| 4. Sales & customers | Cart, FEFO checkout, Rx, receipts, refunds | Screens ✅ |
| 5. Auth, reports, backup | Roles, dashboard, reports, backup/restore | Screens ✅ |
| 6. Polish & hand-off | Pending carts, export backup via share sheet, barcode scanner, translations (MN/EN), screenshots, final report | Next |

## 8.5 Deliverables checklist

**Planning documents**
- [x] Project proposal and problem statement — [01](01-requirements.md)
- [x] Functional and non-functional requirements — [01](01-requirements.md)
- [x] ERD with cardinalities — [02](02-erd-and-database.md), [`erd/pharmacare.dbml`](erd/pharmacare.dbml)
- [x] Database schema and data dictionary — [03](03-data-dictionary.md)
- [x] Use case, DFD, activity, sequence and state diagrams — [04](04-system-diagrams.md)
- [x] Mobile navigation and screen specifications — [05](05-ui-ux.md)
- [x] Business rules, validation, permissions — [06](06-business-rules.md)
- [x] Report definitions — [07](07-reports.md)

**Application**
- [x] Mobile app with local SQLite storage
- [x] Medicine catalogue and categories
- [x] Batch-based inventory management
- [x] Customer management
- [x] Orders and checkout
- [x] Stock movement history
- [x] Dashboard and reports
- [x] User authentication and permissions
- [x] Database backup and restore

**Testing and presentation**
- [x] Sample database records
- [x] Automated acceptance tests (`npm test`)
- [ ] Screenshots of application screens on a real phone
- [ ] Installation and user guide (start from the repository README)
- [ ] Backup demonstration on a phone
- [ ] Final project report
