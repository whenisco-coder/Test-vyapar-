# SQLite Wasm Storage Layer Migration Plan

## 1. Baseline Audit & Command Outputs

### 1.1 `npm install`
```
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error While resolving: vite@8.3.4
npm error Found: esbuild@0.25.12
npm error node_modules/esbuild
npm error   dev esbuild@"^0.25.0" from the root project
npm error Could not resolve dependency:
npm error peerOptional esbuild@"^0.27.0 || ^0.28.0" from vite@8.3.4
npm error node_modules/vite
npm error   vite@"^8.3.0" from the root project
npm error Conflicting peer dependency: esbuild@0.28.2
```
*(Root cause: `package.json` pins `esbuild: "^0.25.0"` while `vite@8.3.4` requests `esbuild@"^0.27.0 || ^0.28.0"` as peerOptional. Resolvable during dependency cleanup in Phase 3 by removing manual esbuild pin or running with standard peer resolution).*

### 1.2 `npx tsc --noEmit`
```
Exit code: 0 (No compile errors)
```

### 1.3 `npm test`
```
 RUN  v5.0.3 /app/applet
 ✓ tests/layer-boundary.test.ts (1 test) 8ms
 ✓ tests/search-benchmark.test.ts (1 test) 170ms
 ✓ tests/backup.test.ts (3 tests) 152ms
 ✓ tests/t1-data-layer.test.ts (13 tests) 32ms
 ✓ tests/repos-and-migrations.test.ts (6 tests) 26ms
 ✓ tests/money.test.ts (8 tests) 23ms
 ✓ tests/gst.test.ts (4 tests) 7ms
 ✓ tests/fifo.test.ts (5 tests) 8ms
 ✓ tests/tally.test.ts (3 tests) 6ms
 ✓ tests/schema.test.ts (2 tests) 7ms
 ✓ tests/numbering.test.ts (2 tests) 5ms

 Test Files  11 passed (11)
      Tests  48 passed (48)
```

### 1.4 `npm run build`
```
vite v8.3.4 building client environment for production...
✓ 1892 modules transformed.
dist/index.html                          1.87 kB │ gzip:   0.84 kB
dist/assets/index-B-fbgU3F.css          35.17 kB │ gzip:   7.12 kB
dist/assets/index-DwkECwtO.js        1,079.25 kB │ gzip: 310.09 kB
PWA v2.0.0
mode      generateSW
precache  8 entries (1460.24 KiB)
files generated  dist/sw.js  dist/workbox-7e5eb42b.js
✓ built in 1.38s
```

### 1.5 Node.js `@sqlite.org/sqlite-wasm` Verification
Verified via direct execution:
```bash
node -e "import('@sqlite.org/sqlite-wasm').then(m => m.default()).then(s => console.log('Loaded sqlite version:', s.version.libVersion))"
# Output: Loaded sqlite version: 3.53.4
```
`@sqlite.org/sqlite-wasm` runs directly in Node.js for in-memory testing (`new sqlite3.oo1.DB(':memory:')`).

---

## 2. File Audit: Storage Inventory & Action Matrix

| Path | Current Role | Migration Action | Rationale |
|---|---|---|---|
| `src/data/sqliteClient.ts` | Hand-written in-memory Map emulator with regex parsing & IndexedDB | **DELETE** | Violates Hard Rule 1 (NO SQL EMULATION) and Hard Rule 2 (No IndexedDB fallback). |
| `src/data/storage-backend.ts` | Hand-written `MemoryStorageDatabase` with regex SQL handlers | **DELETE** | Violates Hard Rule 1. Full emulation layer to be deleted entirely. |
| `src/data/worker.ts` | Stub worker returning `[]` | **REWRITE** | Rewrite as true dedicated Web Worker loading `sqlite3InitModule`, `installOpfsSAHPoolVfs`, single-tab mutex, request/response message broker. |
| `src/data/client.ts` | Dispatches to `storage-backend.ts` | **REWRITE** | Rewrite as `WorkerDriver` implementing `SqlDriver` communicating via Worker message channel with mutex. |
| `src/data/memory-driver.ts` | Does not exist | **NEW** | Implement `MemoryDriver` for Vitest tests using `@sqlite.org/sqlite-wasm` (`:memory:`). |
| `src/data/driver.ts` | Does not exist | **NEW** | Defines `SqlDriver`, `SqlRow`, `StorageUnavailableError`, `TabLockedError`. |
| `src/data/schema.sql.ts` | Raw SQL string with inconsistencies | **DELETE / REPLACE** | Replace with `src/data/schema.ts` defining typed DDL, foreign keys, check constraints, indexes, triggers, and views. |
| `src/data/schema.ts` | Does not exist | **NEW** | Real DDL with tables, triggers (prevent update/delete on ledgers), views (`stock_on_hand`, `customer_dues`, `stock_valuation`). |
| `src/data/migrations.ts` | Migration runner querying emulator | **REWRITE** | Real migration engine using `PRAGMA user_version`, VFS safety backup export before migration, rollback on failure, downgrade rejection. |
| `src/domain/repos/databaseRepos.ts` | Giant 1400-line monolithic duplicate repo file | **DELETE** | Duplicate repo set. App and tests will consolidate on individual per-entity repos in `src/domain/repos/`. |
| `src/domain/repos/interfaces.ts` | Repository contract interfaces | **REWRITE** | Align interfaces to driver-backed operations with strict typing. |
| `src/domain/repos/invoice-repo.ts` | Invoice repo using old client | **REWRITE** | Port to `SqlDriver`, use real transactions for gapless numbering and FIFO allocation. |
| `src/domain/repos/product-repo.ts` | Product repo using old client | **REWRITE** | Port to `SqlDriver`, parameterized SQL. |
| `src/domain/repos/stock-repo.ts` | Stock repo using old client | **REWRITE** | Port to `SqlDriver`, reads from movements ledger and SQL views. |
| `src/domain/repos/purchase-repo.ts` | Purchase repo using old client | **REWRITE** | Port to `SqlDriver`, writes batches & movements in single transaction. |
| `src/domain/repos/party-repo.ts` | Customer/Supplier repo | **REWRITE** | Port to `SqlDriver`, parameterized SQL. |
| `src/domain/repos/payment-repo.ts` | Payment repo | **REWRITE** | Port to `SqlDriver`, append-only ledger enforcement. |
| `src/domain/repos/settings-repo.ts` | Business settings repo | **REWRITE** | Port to `SqlDriver`. |
| `src/domain/repos/audit-repo.ts` | Audit log repo | **REWRITE** | Port to `SqlDriver`. |
| `src/domain/repos/change-repo.ts` | Universal change log repo | **REWRITE** | Port to `SqlDriver`. |
| `src/domain/repos/backup-repo.ts` | Backups log repo | **NEW** | Single repo for `backups_log`. |
| `src/domain/services.ts` | AppService monolith referencing databaseRepos | **REWRITE** | Merge with `src/domain/services/*`, instantiate surviving repos with `SqlDriver`. |
| `src/domain/services/backup-service.ts` | Partial backup service | **MERGE / REWRITE** | Consolidate into services layer, uses VFS byte export/import or SQL dumps for encrypted backup. |
| `src/domain/services/tally-service.ts` | Tally export service | **KEEP / REWRITE** | Use surviving repos and `SqlDriver`. |
| `src/domain/money.ts`, `gst.ts`, `fifo.ts`, `numbering.ts`, `crypto.ts`, `uuid.ts` | Pure domain business logic | **KEEP** | Untouched, pure domain logic with 100% test coverage. |

---

## 3. Surviving Repository Set Architecture

### Rule: Exactly ONE implementation per entity in `src/domain/repos/`
All duplicate repository definitions in `src/domain/repos/databaseRepos.ts` will be deleted.

Surviving repositories (each accepting `SqlDriver`):
1. `SettingsRepo` (`src/domain/repos/settings-repo.ts`)
2. `UserRepo` (`src/domain/repos/user-repo.ts`)
3. `PartyRepo` (`src/domain/repos/party-repo.ts`) — handles Customers and Suppliers (type: 'customer' | 'supplier' | 'both')
4. `ProductRepo` (`src/domain/repos/product-repo.ts`)
5. `StockRepo` (`src/domain/repos/stock-repo.ts`) — batches, movements, queries `stock_on_hand` view
6. `PurchaseRepo` (`src/domain/repos/purchase-repo.ts`) — inward stock, batch generation
7. `InvoiceRepo` (`src/domain/repos/invoice-repo.ts`) — gapless numbering, line taxes, FIFO movements
8. `PaymentRepo` (`src/domain/repos/payment-repo.ts`) — receipts, reversals, queries `customer_dues` view
9. `AuditRepo` (`src/domain/repos/audit-repo.ts`) — audit events
10. `ChangeRepo` (`src/domain/repos/change-repo.ts`) — universal change tracking on every write
11. `BackupLogRepo` (`src/domain/repos/backup-repo.ts`) — backup logs

### Service Layer Consolidation
- Delete the split between `src/domain/services.ts` and `src/domain/services/`.
- Provide a unified `AppService` in `src/domain/services.ts` (or `src/domain/services/index.ts`) that initializes the single driver, runs migrations, and exposes domain workflows to the UI.

---

## 4. Schema Mismatches & Proposals

| Entity / Table | Current Discrepancy | Options | Recommendation & Proposal |
|---|---|---|---|
| **`invoice_series`** | `src/domain/repos/invoice-repo.ts` executes `SELECT last_number FROM invoice_series ...`. However, `schema.sql.ts` and `docs/schema.md` do not define `invoice_series`. `databaseRepos.ts` computes `SELECT COALESCE(MAX(sequence_number), 0) FROM invoices WHERE financial_year = ? AND series = ?`. | **Option A**: Add dedicated `invoice_series (series_prefix, financial_year, last_number, PRIMARY KEY(series_prefix, financial_year))` table.<br>**Option B**: Derive sequence atomically using `SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM invoices WHERE series = ? AND financial_year = ?`. | **Proposal**: Option B (derive directly from invoices table). Invoices are immutable and gapless, and cancelled invoices retain their sequence number (D10 rule). Option B eliminates desynchronization between a counter table and the invoices table. |
| **`orders` & `order_items`** | `schema.sql.ts` and `docs/schema.md` define `orders` and `order_items`, but `storage-backend.ts` omitted them, no repository exists for them, and no UI view touches them. | **Option A**: Keep tables in real SQLite DDL for future roadmap.<br>**Option B**: Remove `orders` and `order_items` from v1 schema to maintain a minimal, strictly validated schema. | **Proposal**: Option A. Keep tables in DDL with proper UUIDv7 primary keys and foreign keys so schema v1 matches `docs/schema.md`. |
| **`backups_log` columns** | `schema.sql.ts` has `(id, backup_type, checksum, record_count, created_at)`. `backup-service.ts` attempts to insert `(id, backup_type, checksum, size_bytes, timestamp, created_at, updated_at, deleted_at, device_id, user_id)`. | **Option A**: Use standardized schema matching BaseEntity with `size_bytes`, `record_count`, `checksum`.<br>**Option B**: Keep minimal columns as in `docs/schema.md`. | **Proposal**: Standardize `backups_log` with `(id TEXT PRIMARY KEY, backup_type TEXT NOT NULL, checksum TEXT NOT NULL, record_count INTEGER NOT NULL, size_bytes INTEGER, created_at TEXT NOT NULL, device_id TEXT, user_id TEXT)`. |
| **`customers` vs `parties` naming** | Table is named `customers` in SQL, but domain type is `Party` with `type` ('customer' \| 'supplier' \| 'both'). | **Option A**: Keep table name `customers` as defined in `docs/schema.md`.<br>**Option B**: Rename table to `parties`. | **Proposal**: Keep table name `customers` to preserve compatibility with existing schema docs and tests, mapped via `PartyRepo`. |

---

## 5. Driver Design Specification

```typescript
export type SqlValue = string | number | null | Uint8Array | bigint;

export interface SqlRow {
  [column: string]: any;
}

export interface SqlDriver {
  /** Execute DDL or non-returning DML */
  exec(sql: string, params?: SqlValue[]): Promise<void>;

  /** Query rows returning typed objects */
  query<T = SqlRow>(sql: string, params?: SqlValue[]): Promise<T[]>;

  /** Query single row or null */
  queryOne<T = SqlRow>(sql: string, params?: SqlValue[]): Promise<T | null>;

  /**
   * Execute callback within a transactional mutex boundary.
   * Inside the worker/connection: BEGIN IMMEDIATE ... COMMIT, ROLLBACK on error.
   */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;

  /** Export complete raw database bytes (for safety backup / encrypted export) */
  exportDatabase(): Promise<Uint8Array>;

  /** Close connection */
  close(): Promise<void>;
}
```

### Two Concrete Driver Implementations:
1. **`WorkerDriver` (`src/data/client.ts`)**:
   - Runs in browser main thread.
   - Communicates with dedicated Web Worker (`src/data/worker.ts`) via `postMessage` with unique `requestId`.
   - Uses `navigator.locks` to prevent multi-tab concurrency before Worker starts.
   - Throws `StorageUnavailableError` if Worker or OPFS is unavailable.
   - Throws `TabLockedError` ("Business OS is open in another tab. Close it and reload.") if another tab holds the lock.

2. **`MemoryDriver` (`src/data/memory-driver.ts`)**:
   - Runs in Vitest / Node.js test environment.
   - Directly imports `@sqlite.org/sqlite-wasm` via `sqlite3InitModule()`.
   - Creates `new sqlite3.oo1.DB(':memory:', 'c')`.
   - Runs the identical migration SQL, triggers, views, and repos as production. Zero emulation.

---

## 6. Transaction & Mutex Design

### Problem
SQLite in WAL/SAHPool allows concurrent readers only with proper VFS locking, but OPFS SAHPool allocates one connection per database file. Interleaved concurrent calls from UI promises could issue overlapping statements during an open transaction.

### Solution
1. **Client-Side Mutex**:
   - `WorkerDriver` and `MemoryDriver` maintain a promise-chain mutex queue (`mutex: Promise<void>`).
   - Every `transaction()` acquires exclusive lock before sending `BEGIN IMMEDIATE`.
   - Any standalone `exec()` or `query()` also queues behind the mutex, guaranteeing strict serialization.
2. **Worker Transaction Lifecycle**:
   - `BEGIN IMMEDIATE` is issued inside the worker on transaction start.
   - If callback succeeds: `COMMIT` is executed.
   - If callback throws or rejects: `ROLLBACK` is executed, and the original error is rethrown.
   - Mutex releases in a `finally` block, unblocking queued operations.
3. **Ledger Guarantees**:
   - Every mutating repository call (e.g. `saveProduct`, `createInvoice`, `recordPayment`) receives the active `tx: SqlDriver` and executes the entity write and the `changes` table insert within the same transaction.

---

## 7. Migration & Safety Backup Engine

1. Track version via `PRAGMA user_version`.
2. Before applying migrations:
   - Export database bytes (`poolUtil.exportFile('/business-os.sqlite3')` in Worker, or `sqlite3_js_db_export` in memory).
   - Retain snapshot in memory. If migration fails, rollback transaction or re-import safety snapshot.
3. Compare target version `N` with current `currentVersion`:
   - If `targetVersion < currentVersion`: throw typed `DowngradeNotAllowedError`.
4. Run migration inside transaction:
   - Set `PRAGMA user_version = N`.
   - Insert into `schema_version` table.

---

## 8. Risks and Questions (Max 5)

1. **Question on `invoice_series`**: Do you approve deriving the sequential invoice number directly from `invoices` (`SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM invoices WHERE series = ? AND financial_year = ?`) inside the finalizing transaction, or do you want an explicit `invoice_series` table added to `schema.ts`?
2. **Question on `orders` and `order_items`**: Should `orders` and `order_items` be kept in `schema.ts` (matching `docs/schema.md`) even though no current UI or service uses them, or removed to keep v1 lean?
3. **Risk: OPFS SAHPool Single Connection**: The `opfs-sahpool` VFS strictly locks files to one Web Worker thread. If a user opens Business OS in two browser tabs, the second tab will fail to acquire the file access handle. Our plan handles this via `navigator.locks` in the client and surfaces a friendly blocking screen: *"Business OS is open in another tab. Close it and reload."* Does this UX meet your expectation?
4. **Risk: Vite WASM Asset Bundling**: Vite needs to emit `sqlite3.wasm` and include it in Vite PWA Workbox precaching without requiring server-side COOP/COEP headers. `opfs-sahpool` requires neither SharedArrayBuffer nor COOP/COEP. We will configure `vite.config.ts` with `optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] }` and adjust Workbox maximum file size for the ~1MB `.wasm` file.
5. **Question on `package.json` esbuild resolution**: When running `npm install`, npm flagged a peer dependency conflict between the pinned `"esbuild": "^0.25.0"` and Vite 8's peer requirement. May we update `package.json` in Phase 3 to let Vite manage esbuild cleanly?

---

Awaiting approval of the plan.
