# Testing plan

Tests protect money, stock, sync and security. UI tests come later (D20). Every task ends with tests passing plus an owner check on a real phone.

## 1. Automated (Vitest, run with `npm test`)

| Area | What must be covered | From |
|---|---|---|
| Money | Paise math, half-up rounding, quantities in thousandths, line amount = qty x rate | T1 |
| GST | CGST/SGST odd-paise split, IGST vs intra-state, price-slab rule resolution, tax-inclusive split, round-off, amount in words, HSN summary | T2, T4 |
| GSTIN | Format, state code, checksum; valid and invalid samples | T2 |
| Data layer | Soft delete, changes written in the same transaction, action id on every row, stock derived from movements, no autoincrement, migration up, downgrade refused | T1 |
| Layer rule | UI cannot import Data code (lint or test) | T1 |
| Stock | FIFO across batches, weighted average, replay from checkpoint, negative stock warning, cancel reversal, unique-piece oversell flag | T3, T4 |
| Artisans | Purchase payable, consignment payable only on sale, payouts, reversals, consignment return | T3, T5 |
| Numbering | Per-device series, six digits, FY reset, no gaps, cancel keeps number | T4 |
| Payments | Allocation across invoices, advances, dues derivation, reversals | T5 |
| Backup | Round trip, wrong passphrase, tampered and truncated files, safety snapshot before restore | T6 |
| Admin Lab | Same seed gives identical data, generator refuses real database, no demo rows in real DB, sandbox delete leaves real DB untouched, integrity check passes at 1,000 and 100,000 invoices | T6A |
| Tally | Golden-file XML, escaping, chunking, exported-up-to marker, sign conventions | T7 |
| Security | PIN hashing and lockout, permission checks, encryption round trips, replay rejection, invite expiry, hash-chain tamper detection, CSP present, no external URLs | T8, T9, T10 |
| Sync | Merge rules, idempotent apply, out-of-order, duplicate, dropped, delayed, clock skew, tombstone vs update, two devices selling one unique piece, identical FIFO cost in either order | T1 harness, T9 |

## 2. Simulation harness (built in T1, D54)
Virtual devices with in-memory databases, a fake network that can drop, duplicate, reorder and delay messages, and skewed clocks. Used by the sync tests and the Admin Lab fault tests.

## 3. Performance (D41)
Seed 5 years of data (year by year with checkpoints). Targets on the owner's phone: search under 200 ms, invoice save under 500 ms, a day's sync under 10 s, Trace under 1 s at 500,000 invoices. Record bytes per invoice and generation time.

## 4. Manual checks on a real Android phone (owner)
Browsers: Brave and Firefox, Android 10 or newer.
1. Install as an app; open offline in airplane mode.
2. Create data, close the browser, restart the phone; data is still there.
3. Two tabs open: no corruption.
4. Camera permission and QR scan (if D34 approved).
5. Print/PDF opens, Save and Share work; text readable at A5.
6. Hindi and Gujarati text display correctly on screen and on the PDF.
7. Pair a second phone; edit on both while offline; reconnect; results match.
8. Same-WiFi sync with no internet (best effort; report result honestly).
9. Backup, then restore on a spare device.
10. Low storage message appears and nothing is lost.

## 5. Release checklist
- All tests pass; type check and build pass; `npm audit` reviewed.
- Integrity check passes on the sandbox 100,000 invoice dataset.
- Security headers verified on the deployed preview.
- Manual phone checks above completed or listed under "Not verified".
- docs updated; decisions changed only with owner approval.

## GSTIN checksum regression

The GSTIN validator must apply its Mod-36 checksum uniformly. Do not add exceptions for example GSTINs. `29ABCDE1234F1Z5` is deliberately tested as a checksum-invalid example; `27AAPFU0939F1ZV` and `29ABCDE1234F1ZW` are checksum-valid format examples. Passing this check confirms format/checksum only, not registration status on the GST portal.

## Schema v2 and HLC regression coverage

- `tests/hlc.test.ts` covers local clock increments, backwards wall-clock movement, remote clock observation, deterministic tie ordering, and malformed values.
- `tests/checkpoints.test.ts` covers deterministic ledger-derived balances, checksum verification/tamper detection, missing-batch references, and negative batch balances.
- `tests/schema.test.ts` asserts the approved artisan/variant/unique-piece tables and fields, HLC metadata, checkpoint tables, invoice reversal records, and uniqueness indexes.
- `tests/repos-and-migrations.test.ts` covers migration statement splitting around trigger bodies, persisted local HLC state, artisan/product identity round-trip, and invoice cancellation without mutating the finalized invoice row.
- The migration runner upgrades the pre-release schema version 1 draft additively to version 2 after taking a safety snapshot; downgrades remain refused.

## SQLite worker integration review regressions

- `tests/sqlite-real-migrations.test.ts` uses Node's real `node:sqlite` engine, not `MemoryStorageDatabase`, for fresh migration, same-version no-op, downgrade refusal, persisted backup on v1-to-v2 upgrade, backup retention, append-only ledger triggers, foreign-key enforcement, and stock/dues views.
- `tests/fixtures/schema-v1.sql` is a historical v1 schema snapshot captured from the pre-v2 source. It is separate from `SCHEMA_CURRENT_SQL`, which names the current canonical schema.
- `tests/worker-driver.test.ts` checks that Web Locks uses `{ ifAvailable: true }` without `signal`, releases the held lock after initialization failure, and preserves distinct tab-lock and OPFS errors.
- Existing-database migrations require a raw SQLite export and successful persistence to the OPFS `vyapar-os-backups/` directory before schema changes. Only the newest three `safety-*.sqlite3` files are retained; same-version launches do not export the database.
- `npm run build` includes a post-build assertion that the generated service worker precaches emitted `.wasm` assets. A production build is required to confirm this assertion against the actual package output.
