# 4. System Diagrams

All diagrams are Mermaid, so GitHub renders them. Paste any of them into mermaid.live to export a PNG/SVG for your report.

## 4.1 Use case diagram

```mermaid
flowchart LR
    Admin(["👤 Administrator"])
    Pharm(["👤 Pharmacist"])
    Cash(["👤 Cashier"])

    subgraph PharmaCare["PharmaCare mobile app"]
        UC1([Log in / log out])
        UC2([View dashboard])
        UC3([Search medicines])
        UC4([Manage customers])
        UC5([Process sale / checkout])
        UC6([View order history])
        UC7([Verify prescription])
        UC8([Receive stock batch])
        UC9([Adjust / write off stock])
        UC10([Refund order])
        UC11([Manage medicines & categories])
        UC12([Manage suppliers])
        UC13([View reports])
        UC14([Manage staff accounts])
        UC15([Change settings])
        UC16([Back up / restore database])
    end

    Cash --- UC1 & UC2 & UC3 & UC4 & UC5 & UC6
    Pharm --- UC7 & UC8 & UC9 & UC10 & UC11 & UC12 & UC13
    Admin --- UC14 & UC15 & UC16

    UC5 -. "«include»" .-> UC3
    UC5 -. "«extend» Rx item" .-> UC7
    UC8 -. "«include»" .-> UC12
```

**Generalisation (inheritance) between actors:** a Pharmacist can do everything a Cashier can, and an
Administrator can do everything a Pharmacist can. In a UML tool, draw this as hollow-triangle arrows
*Pharmacist → Cashier* and *Administrator → Pharmacist*; the diagram above links each actor only to the use cases
it adds.

## 4.2 Context diagram (DFD level 0)

```mermaid
flowchart LR
    Staff["Pharmacy staff<br/>(Admin / Pharmacist / Cashier)"]
    Cust["Customer"]
    Sup["Supplier"]
    Sys(("0<br/>PharmaCare<br/>system"))

    Staff -- "login, medicine data, sales, adjustments" --> Sys
    Sys -- "dashboard, alerts, reports" --> Staff
    Cust -- "requested items, prescription, payment" --> Sys
    Sys -- "receipt" --> Cust
    Sup -- "delivery note: batch, qty, cost, expiry" --> Sys
```

## 4.3 Data flow diagram (DFD level 1)

```mermaid
flowchart TB
    Staff["Staff"]
    Cust["Customer"]
    Sup["Supplier"]

    P1(("1.0<br/>Authenticate"))
    P2(("2.0<br/>Manage<br/>catalogue"))
    P3(("3.0<br/>Receive &<br/>adjust stock"))
    P4(("4.0<br/>Process<br/>sale"))
    P5(("5.0<br/>Refund"))
    P6(("6.0<br/>Report"))

    D1[("D1 users")]
    D2[("D2 medicines / categories")]
    D3[("D3 medicine_batches")]
    D4[("D4 stock_movements")]
    D5[("D5 orders / order_items")]
    D6[("D6 customers / prescriptions")]
    D7[("D7 suppliers")]

    Staff -- credentials --> P1
    P1 <--> D1
    Staff -- "medicine details" --> P2
    P2 <--> D2
    Sup -- "delivery details" --> P3
    P3 --> D3
    P3 --> D4
    P3 <--> D7
    Cust -- "items, Rx, payment" --> P4
    P4 <--> D2
    P4 <--> D3
    P4 --> D4
    P4 --> D5
    P4 <--> D6
    P4 -- receipt --> Cust
    Cust -- "returned items" --> P5
    P5 <--> D5
    P5 --> D3
    P5 --> D4
    D2 & D3 & D4 & D5 --> P6
    P6 -- "reports, alerts" --> Staff
```

## 4.4 Activity diagrams

### A. Receive a new batch

```mermaid
flowchart TD
    A([Start]) --> B[Open Inventory → Receive stock]
    B --> C[Select medicine]
    C --> D[Select supplier, enter batch no., quantity,<br/>purchase price, expiry date]
    D --> E{Valid?<br/>qty > 0, price ≥ 0,<br/>expiry > today,<br/>batch no. not duplicate}
    E -- No --> F[Show field errors] --> D
    E -- Yes --> G[[BEGIN TRANSACTION]]
    G --> H[Insert medicine_batches row<br/>remaining = 0]
    H --> I[Insert stock_movements RECEIPT +qty<br/>trigger sets remaining = qty]
    I --> J[[COMMIT]]
    J --> K[Refresh stock & alerts]
    K --> L([End])
```

### B. Checkout (process a sale)

```mermaid
flowchart TD
    A([Start]) --> B[Search medicine & add to cart]
    B --> C{Rx-only?}
    C -- Yes --> D{Pharmacist logged in<br/>or approves?}
    D -- No --> E[Block item, ask for pharmacist] --> B
    D -- Yes --> F[Record / select prescription] --> G
    C -- No --> G[Set quantity]
    G --> H{More items?}
    H -- Yes --> B
    H -- No --> I[Optional: choose customer, discount]
    I --> J[Choose payment method → Confirm]
    J --> K[[BEGIN TRANSACTION]]
    K --> L{For each line: sellable stock<br/>≥ quantity?}
    L -- No --> M[[ROLLBACK]] --> N[Show which item is short] --> G
    L -- Yes --> O[Insert order + order_items<br/>with current prices]
    O --> P[Allocate batches FEFO:<br/>earliest expiry first]
    P --> Q[Insert SALE movements<br/>trigger decreases quantity_remaining]
    Q --> R[Set totals, status COMPLETED, PAID]
    R --> S[[COMMIT]]
    S --> T[Show receipt]
    T --> U([End])
```

### C. Refund

```mermaid
flowchart TD
    A([Start]) --> B[Open completed order]
    B --> C[Choose lines & quantities to return, reason]
    C --> D{qty ≤ sold − already returned?}
    D -- No --> E[Show error] --> C
    D -- Yes --> F[Mark returned stock resellable or not]
    F --> G[[BEGIN TRANSACTION]]
    G --> H[RETURN +qty to the original batches<br/>latest-allocated first]
    H --> I{Resellable?}
    I -- No --> J[WRITE_OFF −qty with reason]
    I -- Yes --> K
    J --> K[Update quantity_returned,<br/>refunded_amount, payment_status]
    K --> L{Everything returned?}
    L -- Yes --> M[status = REFUNDED]
    L -- No --> N[status stays COMPLETED]
    M & N --> O[[COMMIT]] --> P([End])
```

### D. Daily expiry check

```mermaid
flowchart TD
    A([App opens / dashboard refresh]) --> B[Read active batches with stock]
    B --> C{expiry_date < today?}
    C -- Yes --> D[Mark EXPIRED:<br/>exclude from sale, red alert]
    C -- No --> E{expiry ≤ today + warning days?}
    E -- Yes --> F[Mark NEAR EXPIRY: amber alert]
    E -- No --> G[OK]
    D --> H[Pharmacist writes off<br/>WRITE_OFF movement]
```

## 4.5 Sequence diagram — checkout

```mermaid
sequenceDiagram
    actor C as Cashier
    participant UI as SellScreen
    participant S as services/sales.ts
    participant R as runInTransaction
    participant DB as SQLite

    C->>UI: Tap "Confirm sale"
    UI->>S: checkout(cart, customer, payment, discount)
    S->>S: check permissions, Rx lines have prescription
    S->>R: runInTransaction()
    R->>DB: BEGIN
    loop each cart line
        R->>DB: SELECT sellable batches ORDER BY expiry_date
        DB-->>R: batches
        alt not enough stock
            R->>DB: ROLLBACK
            R-->>S: InsufficientStock(medicine)
            S-->>UI: error
            UI-->>C: "Only 4 left of Amoxicillin"
        end
    end
    R->>DB: INSERT orders (PENDING), order_items
    R->>DB: INSERT stock_movements (SALE, −n)
    Note over DB: trigger trg_movement_apply:<br/>quantity_remaining −= n
    R->>DB: UPDATE orders SET totals, COMPLETED, PAID
    Note over DB: trigger trg_orders_status checks<br/>items, totals and allocations
    R->>DB: COMMIT
    R-->>S: order_id
    S-->>UI: receipt data
    UI-->>C: Receipt
```

## 4.6 State diagrams

### Order

```mermaid
stateDiagram-v2
    [*] --> PENDING : cart saved
    [*] --> COMPLETED : checkout (paid)
    PENDING --> COMPLETED : checkout (stock deducted)
    PENDING --> CANCELLED : cancel (no stock change)
    COMPLETED --> COMPLETED : partial refund
    COMPLETED --> REFUNDED : full refund (stock returned)
    CANCELLED --> [*]
    REFUNDED --> [*]
```

Stock is deducted **only** on the transition into `COMPLETED`, so it can't be deducted twice (BR-07). A `PENDING`
order holds no stock.

### Batch (derived state)

```mermaid
stateDiagram-v2
    [*] --> SELLABLE : received
    SELLABLE --> NEAR_EXPIRY : within warning days
    NEAR_EXPIRY --> EXPIRED : expiry date passed
    SELLABLE --> DEPLETED : remaining = 0
    NEAR_EXPIRY --> DEPLETED : remaining = 0
    DEPLETED --> SELLABLE : return / positive adjustment
    SELLABLE --> QUARANTINED : recall / quarantine
    NEAR_EXPIRY --> QUARANTINED : recall / quarantine
    QUARANTINED --> SELLABLE : released
    EXPIRED --> DEPLETED : written off
```

## 4.7 Software architecture

```mermaid
flowchart TB
    subgraph P["Presentation layer — src/screens, src/components"]
        S1[Dashboard] --- S2[Medicines] --- S3[Inventory] --- S4[Sell / Orders] --- S5[Customers] --- S6[Reports] --- S7[Settings]
    end
    subgraph B["Business logic — src/services"]
        B1[Auth & permissions] --- B2[Checkout / FEFO] --- B3[Stock receiving & adjustments] --- B4[Refunds] --- B5[Reports]
    end
    subgraph D["Data access — src/db"]
        D1[Schema, triggers, views] --- D2[Read queries & reports<br/>parameterised SQL] --- D3[Transactions] --- D4[Seed data]
    end
    DB[("SQLite file<br/>pharmacare.db<br/>app private storage")]
    P --> B --> D --> DB
```

| Layer | Responsibility | Must not |
| --- | --- | --- |
| Presentation | Forms, lists, navigation, showing errors | Write SQL or decide business rules |
| Business logic | Permissions, FEFO, totals, Rx check, state transitions | Know about UI components |
| Data access | SQL, transactions, migrations | Contain UI text |
| SQLite | Constraints as the last line of defence | — |

### Technology choices

| Component | Choice | Notes |
| --- | --- | --- |
| Framework | **Expo (React Native)**, SDK 58 | Already used by this repository |
| Language | TypeScript | |
| Database | **`expo-sqlite`** | Transactions, `PRAGMA user_version` migrations, `backupDatabaseAsync` for backup/restore |
| Navigation | Custom bottom tabs + a "More" menu; move to **Expo Router** if more screens are added | Per project guidelines in `AGENTS.md` |
| Password hashing | PBKDF2-HMAC-SHA256 in plain TypeScript (`src/services/password.ts`) | No native module needed; verified against Node's crypto |
| Backup file sharing (future) | `expo-sharing` + `expo-file-system` / `expo-document-picker` | To copy the backup off the phone; install with `npx expo install` |
| Tests | Node's test runner + built-in `node:sqlite` running the real schema and services (`npm test`) | 22 automated tests |

### Transactions in expo-sqlite

`withExclusiveTransactionAsync` opens a **second connection**, where `PRAGMA foreign_keys` is off (and can't be switched
on inside a transaction), and it isn't available on web. The app therefore uses `withTransactionAsync` on the main
connection and serialises all write operations through one queue (`src/db/transaction.ts`), so two writes can never
interleave.
