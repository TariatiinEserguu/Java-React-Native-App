# 1. Project Overview & Requirements

## 1.1 Overview

| Item | Value |
| --- | --- |
| Project name | **PharmaCare** (working name) |
| Type | Offline-first mobile application (Android first, iOS possible) |
| Users | Pharmacy staff on a shared phone or tablet at the counter |
| Database | SQLite, stored in the app's private storage on the device |
| Network | None required. No web server, cloud database or deployment |
| Currency | Mongolian tögrög (MNT), stored as whole numbers |

### Problem statement

Small pharmacies often track medicines, stock and sales on paper or in spreadsheets. That leads to:

- stock counts that don't match what is on the shelf,
- expired medicine that nobody notices and that is sometimes sold by mistake,
- no record of which supplier delivery (batch) a sold box came from, which matters during a product recall,
- sales history that is hard to search or total up,
- prescription-only medicine sold without anyone checking the prescription.

### Aim

Design and build a mobile prototype that stores pharmacy catalogue, batch-level inventory, customers, prescriptions
and sales in a relational SQLite database on the device, and that keeps that data consistent through constraints and
transactions.

### Objectives

1. Model the pharmacy's data as a normalised relational database (see the [ERD](02-erd-and-database.md)).
2. Provide create/read/update/deactivate screens for medicines, categories, suppliers, customers and staff.
3. Track stock **per batch**, with expiry dates and purchase cost.
4. Sell using **FEFO** (first-expiry-first-out) and never sell expired stock.
5. Record every stock change in an append-only movement log.
6. Require pharmacist verification before prescription-only items can be sold.
7. Produce dashboard figures and reports from SQL queries over the stored data.
8. Enforce role-based permissions (Admin, Pharmacist, Cashier).
9. Work fully offline, and support backing up and restoring the database file.

## 1.2 Scope

| In scope (prototype) | Out of scope |
| --- | --- |
| Mobile GUI | Website / customer-facing online shop |
| Local SQLite database | Cloud database, multi-device sync |
| Medicine catalogue, categories, search | Real payment gateway (cash / card are *recorded* only) |
| Batch inventory, expiry tracking, write-offs | GPS delivery tracking |
| Point-of-sale checkout, order history, refunds | Supplier APIs, automatic purchase orders |
| Customer records | Insurance claims |
| Prescription record + pharmacist check | e-Prescription integration with hospitals |
| Local login with roles | Online account registration / password reset by email |
| Reports and dashboard | Accounting / tax filing |
| Backup & restore of the database file | Barcode scanning *(optional extension, see roadmap)* |

> "Online Pharmacy" describes the product idea. This version is a **local, offline prototype** used by
> pharmacy staff. A real public ordering service would need a server, payment processing, and has to follow
> local pharmacy and data-protection law.

> **One-device limitation:** each phone has its own database. Two phones do not share stock or sales.

## 1.3 Stakeholders and actors

| Actor | Description |
| --- | --- |
| **Administrator** | Owner or manager. Manages staff accounts, catalogue, suppliers, settings, backups. Can do everything. |
| **Pharmacist** | Licensed staff. Receives stock, adjusts and writes off stock, verifies prescriptions, sells, issues refunds. |
| **Cashier** | Counter assistant. Searches medicines, registers customers, sells non-prescription items, views own sales. |
| Customer *(not a user)* | Appears only as data. Doesn't log in. |
| Supplier *(not a user)* | Appears only as data. |

## 1.4 Functional requirements

| ID | Requirement | Priority | Actors |
| --- | --- | --- | --- |
| FR-01 | Log in with a locally stored username and password; log out; lock after inactivity | High | All |
| FR-02 | Dashboard: active medicines, sellable stock units, low-stock count, near-expiry and expired batches, today's sales | High | All |
| FR-03 | Add, edit, view and **deactivate** medicines (no hard delete once used) | High | Admin, Pharmacist |
| FR-04 | Manage medicine categories | High | Admin |
| FR-05 | Manage suppliers | Medium | Admin, Pharmacist |
| FR-06 | Receive stock as a new batch: batch number, supplier, quantity, purchase price, expiry date | High | Admin, Pharmacist |
| FR-07 | Search medicines by brand name, generic name or barcode; filter by category, stock state, Rx-only | High | All |
| FR-08 | Register, edit and search customers (name, phone) | Medium | All |
| FR-09 | Build a cart, change quantities, apply a discount, see the total | High | All |
| FR-10 | Check out: allocate batches by FEFO, deduct stock, record payment, show a receipt — in **one transaction** | High | All |
| FR-11 | Block prescription-only items until a pharmacist records and verifies a prescription | High | Pharmacist |
| FR-12 | Save a cart as a PENDING order and resume or cancel it later | Low | All |
| FR-13 | Full or partial refund of a completed order, with a reason and restock / write-off choice | Medium | Admin, Pharmacist |
| FR-14 | Stock adjustments (count corrections, damage) and expiry write-offs, each with a reason | High | Admin, Pharmacist |
| FR-15 | View stock movement history per batch and per medicine | High | Admin, Pharmacist |
| FR-16 | Order history with filters (date, status, customer, staff) and order detail | High | All (Cashier: own orders) |
| FR-17 | Reports: sales by period, best sellers, inventory valuation, low stock, expiry, movement log, gross profit | Medium | Admin (Pharmacist: selected) |
| FR-18 | Manage staff accounts: create, change role, deactivate, reset password | Medium | Admin |
| FR-19 | Settings: pharmacy name, expiry warning days, default low-stock level, auto-lock time | Low | Admin |
| FR-20 | Back up the database to a file the user can share/save, and restore from such a file | Medium | Admin |

## 1.5 Non-functional requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-01 | Offline | Every feature works in airplane mode. |
| NFR-02 | Integrity | Foreign keys, `CHECK`, `UNIQUE` and `NOT NULL` constraints protect the data even if the UI has a bug. |
| NFR-03 | Atomicity | Checkout, refund, receiving, adjustment and write-off are each a single transaction: all of it is saved or none of it. |
| NFR-04 | Performance | Searching 5 000 medicines / 50 000 order lines returns in under 300 ms on a mid-range Android phone. |
| NFR-05 | Security | Passwords stored only as salted, slow hashes. Session locks after inactivity. Permissions are checked in the business-logic layer, not only by hiding buttons. |
| NFR-06 | Privacy | Store only the customer data the pharmacy needs (name, phone, optional email). No diagnoses. Customer data never written to logs. |
| NFR-07 | Usability | Usable one-handed on a 6" screen; touch targets ≥ 44 pt; works in light and dark mode; every destructive action asks for confirmation. |
| NFR-08 | Reliability | Data survives app restarts and phone reboots. Schema upgrades run as versioned migrations without losing data. |
| NFR-09 | Maintainability | UI, business logic and data access are separate layers (see [architecture](04-system-diagrams.md#47-software-architecture)). |
| NFR-10 | Auditability | Stock movements and completed orders are never edited or deleted; corrections are new records. |
| NFR-11 | Portability | Built with Expo / React Native so the same code can run on Android and iOS. |
| NFR-12 | Localisation | UI text kept in one place so the app can be translated (e.g. Mongolian / English). Money shown as `12,500₮`. |

## 1.6 Assumptions and constraints

- One pharmacy branch and one device per database.
- Prices include tax. Tax is not calculated separately in the prototype.
- Medicines are sold in whole units (box, strip, bottle). Selling single tablets from a strip would need a second unit of measure — it's left out to keep the model simple.
- The device clock is correct; expiry checks use the device's local date.
- The prototype is for demonstration and coursework. Before real use, the dispensing workflow must follow local pharmacy regulations.
