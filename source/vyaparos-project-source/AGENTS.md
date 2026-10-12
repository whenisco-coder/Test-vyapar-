# Business OS — Agent Guidelines & System Rules

## Purpose
Business OS is an offline-first Progressive Web Application (PWA) built for small Indian retail/wholesale businesses (specifically tyre and auto spares first). It runs on the owner's Android phone (primary) and desktop browser (secondary), completely on-device without cloud servers, external accounts, or recurring costs.

## Layer Boundaries & Architecture Rules
1. **Three Strict Layers**:
   - `UI` (`src/ui/`): Components, Views, Forms, Modals, Print/PDF templates.
   - `Domain` (`src/domain/`): Pure business logic (Money, GST, FIFO stock calculation, Invoice Numbering, Tally XML generation, Repositories interfaces, Services, Crypto backup).
   - `Data` (`src/data/`): SQLite WASM, OPFS storage, Migrations, Worker bridge, DB client, Low-level SQL execution.
2. **Layer Rule**:
   - `src/ui/` MUST NEVER import from `src/data/`. All database queries and writes pass strictly through Domain repositories and services.
   - Domain is pure TypeScript. It never interacts with DOM or window directly (except WebCrypto for domain crypto service).
3. **Immutability & Ledgers**:
   - Stock quantities are NEVER stored as mutable columns. Stock is derived from the append-only `stock_movements` ledger.
   - Customer balances are derived from invoices minus payments.
   - Finalized invoices are locked and immutable. Cancellations create reversing stock movements.
   - Every write operation through any repository appends an entry to the `changes` table in the exact same transaction.
4. **Money & Numbers**:
   - Money is ALWAYS integer paise. No floats anywhere in financial calculations.
   - GST rates are basis points (e.g., 18% = 1800 bp, 28% = 2800 bp).
   - Tax rounding is half-up on paise. Line round-off and invoice round-off to nearest rupee.
   - Odd-paise CGST/SGST splits MUST sum exactly to the line tax (1 paise difference assigned consistently to CGST).
5. **IDs**:
   - UUIDv7 identifiers are used everywhere. Autoincrement IDs are forbidden.
6. **Testing Standard**:
   - Vitest suite covers Money math, GST calculations, GSTIN validation, FIFO batch consumption, Invoice numbering & financial year resets, Backup encryption/restore tamper resistance, and Tally Prime XML generation.
