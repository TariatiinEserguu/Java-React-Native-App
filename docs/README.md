# PharmaCare — Design Documentation

Planning and design documents for **PharmaCare**, an offline pharmacy management app (Expo / React Native +
SQLite) for Android and iOS. All diagrams are Mermaid and render directly on GitHub.

| # | Document | What's inside |
| --- | --- | --- |
| 1 | [Requirements](01-requirements.md) | Problem, objectives, scope, actors, 20 functional + 12 non-functional requirements, assumptions |
| 2 | [ERD & database design](02-erd-and-database.md) | Conceptual + logical ERD, relationships and cardinality, design decisions, normalisation (3NF), constraints, indexes, worked examples, how to draw the ERD |
| 3 | [Data dictionary](03-data-dictionary.md) | Every table and column: type, null, default, constraint, meaning |
| — | [`erd/pharmacare-erd.png`](erd/pharmacare-erd.png) · [`.svg`](erd/pharmacare-erd.svg) · [`.dbml`](erd/pharmacare.dbml) | The ERD as an image for your report, and as DBML to paste into **dbdiagram.io** |
| 4 | [System diagrams](04-system-diagrams.md) | Use case, context diagram (DFD 0), DFD level 1, activity diagrams, checkout sequence diagram, order & batch state diagrams, architecture |
| 5 | [UI / UX](05-ui-ux.md) | Navigation map, screen specs with wireframes, design system |
| 6 | [Business rules](06-business-rules.md) | 22 rules (and where each is enforced), field validation, permission matrix, security |
| 7 | [Reports](07-reports.md) | Exact definitions for dashboard figures and 12 reports, integrity checks |
| 8 | [Testing & plan](08-testing-and-plan.md) | Acceptance tests, manual test script, implementation status, roadmap, checklist |

## What changed from the first draft

The first planning draft was a good start. These are the corrections and additions in this version:

| Change | Why |
| --- | --- |
| **11 tables** (added `prescriptions` and `app_settings`); the draft said 10 then 9 | Rx-only medicines need a verified prescription record; thresholds should be settings, not code |
| Sale ↔ batch link moved from `order_items.batch_id` to **`stock_movements.order_item_id`** | FEFO can split one order line over several batches; one `batch_id` column can't hold that |
| **Three roles** (Admin, Pharmacist, Cashier) instead of Admin/Staff with "restricted / if authorised" | Makes every permission testable |
| Added `generic_name`, `order_number`, `subtotal`/`discount_amount`/`refunded_amount`, `quantity_returned`, `WRITE_OFF` movement type, `REFUNDED` status | Real pharmacy needs: search by ingredient, readable receipts, discounts, partial refunds, expiry disposal |
| `quantity_remaining` is maintained by a **trigger** from the movement ledger | The cached stock can't drift from the history |
| Most business rules enforced **in the database** (CHECKs + triggers), not only in the app | They hold even for SQL typed into the console |
| Expiry warning default 90 days (configurable) | Common pharmacy practice; the draft's 30 days is still possible via settings |
| Precise definitions for "sellable", "low stock", "net sales", "gross profit" | So the dashboard and reports agree |
| Normalisation section, DFDs, sequence and state diagrams | Usually required in a database / software-engineering report |
| Expo Router instead of React Navigation as the future navigation choice | Matches this repository's guidelines |

## Where the design lives in the code

| Design | Code |
| --- | --- |
| Tables, constraints, triggers, views | `src/db/schema.ts` |
| Business logic + permissions | `src/services/*.ts` |
| Read queries and reports | `src/db/repository.ts`, `src/db/reports.ts` |
| Sample data | `src/db/seed.ts` |
| Tests | `tests/backend.test.ts` |
