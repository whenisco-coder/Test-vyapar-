# Business OS Architecture Specification

## 1. System Topology

```
+-------------------------------------------------------------+
|                     PRESENTATION / UI                       |
|   React Components, Pages, Bottom Tabs, Sidebar, Modals      |
|   A5 Tally-Style Print Layout & Vector PDF Exporter         |
+-------------------------------------------------------------+
                              |
                     Calls domain services
                              v
+-------------------------------------------------------------+
|                       DOMAIN LAYER                          |
|  - Repositories: Settings, Products, Customers, Purchases,  |
|                  Invoices, Payments, Stock, Audit, Changes  |
|  - Engine: Money Math, GST Engine, FIFO / Weighted Avg Cost |
|  - Modules: Invoice Series Generator, Encrypted Backup,     |
|             Tally Prime XML Exporter, GSTIN Validator       |
+-------------------------------------------------------------+
                              |
                   Calls typed async client
                              v
+-------------------------------------------------------------+
|                        DATA LAYER                           |
|  - Web Worker: Background SQLite WASM                       |
|  - Storage: Origin Private File System (OPFS `sahpool`)    |
|  - Schema v1 & Versioned Migration Engine                   |
|  - Universal Change Tracker (`changes` ledger)              |
+-------------------------------------------------------------+
```

## 2. Layer Enforcement
- Code in `src/ui/` only imports from `src/domain/`.
- Code in `src/domain/` interfaces with `src/data/` through abstract contracts and typed client commands.
- An automated import-restriction test validates that `src/ui/` contains zero references or imports to `src/data/`.

## 3. Storage Architecture
1. **Primary Engine**: SQLite WASM initialized within a dedicated Web Worker using OPFS storage (`opfs-sahpool` or OPFS VFS) ensuring non-blocking UI responsiveness.
2. **Worker IPC**: Communication occurs via structured JSON message passing with response correlation IDs.
3. **Graceful Fallback**: If OPFS or worker initialization fails, the application displays a persistent diagnostic modal explaining the browser limitation rather than silently losing data.
4. **Persistent Quota**: Requests `navigator.storage.persist()` on initial setup to ensure mobile browsers (especially Chrome/Brave on Android) do not evict data under storage pressure.

## 4. Ledgers & Eventual Consistency
- **Stock Movement Ledger**: Every inventory change (opening stock, purchase receipt, sales invoice, sales cancellation, stock adjustment) inserts an immutable record into `stock_movements`. Real-time stock on hand is computed as `SUM(qty_delta)` grouped by `product_id` and `location`.
- **Change Log (`changes`)**: Every mutating repository action writes an entry to `changes` with `device_id`, `table_name`, `row_id`, `op` (insert, update, delete), and `payload` JSON within the same transactional boundary.
- **Audit Log (`audit_log`)**: Critical business events (user onboarding, settings update, invoice finalization, invoice cancellation, backup export, restore) write structured event entries.
