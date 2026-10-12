# Implementation log — 2026-10-12

## Completed in this pass

- Implemented approved schema decisions in the canonical `src/data/schema.ts`; `src/data/schema.sql.ts` now re-exports the canonical schema to avoid schema/test drift.
- Added artisan records and product identity metadata for standard products, variant parents, variants, and unique pieces.
- Added identity validation triggers and uniqueness/query indexes for active SKUs, customer mobile numbers, unique-piece codes, invoice numbers, and invoice sequences.
- Added HLC format/parse/compare/tick helpers in `src/domain/hlc.ts` and persisted per-device clock state in `device_clock`.
- Updated both change-writing paths to record `hlc`, `origin_device_id`, and `user_id` with the change row in the same transaction.
- Added stock replay snapshots (`stock_checkpoints`) with deterministic ledger-derived balance payloads, SHA-256 checksum verification, and a repository for creating/reading verified checkpoints; added sync cursors (`sync_checkpoints`) and append-only invoice reversals (`invoice_reversals`).
- Finalized invoices and their items are locked by SQLite triggers. Cancellation records a reversal and reverses stock ledger entries; repository reads expose a derived `cancelled` status without mutating the finalized invoice.
- Added migration v2 for the pre-release v1 draft, including a safety snapshot and an SQL splitter that preserves trigger bodies.
- Added HLC, schema, product identity, migration splitting, and invoice cancellation regression tests.
- Fixed the storage adapter's `execute` method to await the underlying query and made the migration runner compatible with both database interfaces used in this codebase.

## Validation performed

- Canonical schema DDL executed in Python's SQLite engine successfully.
- SQLite behavior checks passed for artisan-linked unique pieces, rejection of unique pieces without a code, finalized-invoice immutability, reversal records, and dues exclusion.
- Migration splitter inspection confirmed complete trigger bodies; HLC runtime assertions passed.
- Targeted TypeScript check passed for the changed data/domain modules and tests using local type stubs for the unavailable test package.

## Not verified

- Full `npm test`, full project typecheck, and production build were not run because dependencies could not be installed within the available timeout (`npm install` timed out). The standard project typecheck also currently lacks the installed `vite/client` type package.
- No real Android device/browser persistence, restart, PWA/offline, or two-tab checks were performed. T1 must not be marked complete until those acceptance checks are run.
- The HLC helper is a timestamp-ordering primitive only. Merge policies, conflict handling, network sync, and the full fault-injection harness remain future T1/T9 work.


## Continued pass — sync simulation and retention primitives

- Added `src/domain/sync-merge.ts` with validated-HLC change ordering and deterministic latest-change selection per `(table_name, row_id)`. This is explicitly a convergence primitive, not a complete sync conflict policy.
- Added `tests/helpers/sync-simulation.ts`: isolated virtual devices each own a fresh in-memory database/service; the fake network supports drop, duplicate, reorder, and delayed delivery. Device clocks can begin skewed.
- Added `tests/sync-simulation.test.ts` covering order-independent merge results, malformed HLC rejection, skewed virtual clocks, dropped messages, delayed delivery, and idempotent duplicate receipt.
- Added `src/domain/snapshot-retention.ts` and `tests/snapshot-retention.test.ts` for deterministic UTC-based retention selection: newest snapshot per day for seven days, newest per ISO week for four weeks, and preservation of pre-migration safety snapshots.
- These additions are testable policy/primitives. The harness is not production sync, and the retention selector is not yet wired to a durable browser snapshot store or scheduled daily job.

## Validation status after this pass

- Reviewed new TypeScript modules and tests for consistency with current repository interfaces.
- The new pure domain modules and test files passed a targeted TypeScript compile with a local Vitest type shim. Runtime Node smoke checks passed for deterministic merge ordering, retention selection, and the virtual-device delayed/duplicate/drop simulation. This is not a substitute for the full Vitest suite.
- Android device acceptance and real persistent snapshot/restart checks remain outstanding.


## Continued pass — Ajrakhika artisan master-data screen

- Added a dedicated Artisans navigation destination and screen, connected to `AppService.artisans` only (no UI imports from the Data layer).
- Added create/edit/archive workflows for artisan name, village, craft specialty, mobile number, optional payment text, and notes. Archive uses the repository soft-delete operation so historical references remain intact.
- Added search across artisan name, village, craft, and phone; active-artisan and distinct-craft summaries; mobile-friendly empty/loading/error states and 44px action targets.
- Added a repository regression test for artisan soft-delete persistence and change-log recording.

## Validation status after artisan screen

- Static inspection confirms the new UI uses Domain services and does not import `src/data` directly.
- Full typecheck/build/test suite remain blocked because package installation timed out; this UI change is not yet accepted on a real Android device.
- Artisan photo capture/storage, artisan payable ledger, and linking an artisan to product creation remain follow-up work; this screen stores the repository-supported photo key only and does not claim photo upload support.


## Continued pass — product catalog supports Ajrakhika identities

- Added an additive Ajrakhika craft/category list alongside the existing tyre/auto-spares categories.
- Extended the existing product form with product kind selection (standard, variant family, variant item, one-of-one piece), optional artisan attribution, required unique-piece code, variant-family selection, and JSON attribute validation.
- Added unique-piece code and variant-family indicators to the catalog list. Variant children must reference an existing variant family; malformed JSON attributes and missing unique-piece codes are rejected before repository writes.
- Product writes continue through the existing Domain service/repository path; no SQL was added to UI components.

## Validation status after catalog update

- TypeScript transpile/syntax checks passed for the changed TSX files and repository tests. Static import-boundary scan confirms UI does not import the Data layer.
- Full typecheck, Vitest, production build, and real Android checks remain unverified because dependencies could not be installed within the available timeout.
- Variant creation is intentionally one item at a time; automatic attribute-grid generation and barcode/camera capture are not implemented in this pass.

## Continued pass — atomic product and opening-stock creation

- Extended `ProductRepo.save` with an optional opening-stock payload for new products. Product row, opening batch, opening ledger movement, and all three change-log records are now written inside one database transaction.
- Added domain validation that opening quantities are positive whole units and opening cost is a non-negative integer number of paise; opening stock cannot be supplied while editing an existing product.
- Updated the product form to validate opening quantity before writes and use the atomic repository operation instead of saving the product and stock in separate transactions.
- Added regression tests for opening-stock creation, stock/change-log linkage, and invalid fractional opening quantity rejection.

## Validation status after atomic opening-stock pass

- TypeScript transpilation/syntax checks passed for the changed repository, product screen, and regression test file.
- Full project typecheck remains blocked because `vite/client` types are not installed; the full Vitest suite and production build remain unverified.
- Android persistence and transaction interruption acceptance tests remain outstanding.

## Continued pass — party master-data validation and address fields

- Expanded customer/supplier entry to capture email, second address line, and notes, in addition to the existing mobile, GSTIN, city, PIN code, and state fields.
- Added form-level validation for Indian mobile numbers (with optional +91/91 formatting), six-digit PIN codes, and basic email shape before repository writes. Mobile values are normalized to ten digits.
- Added a repository regression test covering persistence of party email, second address line, PIN code, and notes.
- Syntax/transpilation checks passed for the changed party screen and tests. Full Vitest/typecheck/build and Android checks remain unverified due missing dependencies/device acceptance.
