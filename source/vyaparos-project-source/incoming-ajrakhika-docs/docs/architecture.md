# Ajrakhika Business OS: Architecture (v0.1)

Items marked **OPEN** still need a decision. See decisions.md for the settled list.

## 1. Goals and non-goals

**Goals**
- Offline-first: works with no internet; data stays on the device.
- Phone and desktop used equally; staff phones share the same data through sync.
- Beautiful, calm, easy for non-technical users, in English, Hindi and Gujarati.
- Tally-aware: file-based export, live sync later.
- Zero budget: free tiers and open source only.
- One business per install. Core is vertical-agnostic; seed data differs per business.

**Non-goals**
- Cloud-first SaaS, Tally replacement, native apps, marketplace or bank integrations, payroll/HR/CRM.

## 2. Layers

```
UI      views, invoice templates, print/PDF
Domain  repos, services, tally, sync, hooks
Data    worker, sqlite, schema, migrations
```

- Each layer talks only to the one below. UI never touches SQL.
- Sync and Tally are Domain modules.
- Hooks are thin: call Domain services, hold view state only.
- Enforced by a lint rule or test that fails if `src/ui/` imports `src/data/`.
- Layout: `src/data/`, `src/domain/`, `src/ui/`, `functions/` (relay), `docs/`.

## 3. Storage and schema

- SQLite WASM in a dedicated Web Worker, persisted in OPFS; typed client between UI and worker.
- **OPEN:** wa-sqlite vs official sqlite-wasm (`opfs-sahpool`), decided in T0 on a real Android phone (Brave, Firefox).
- `navigator.storage.persist()` at first run; result shown in Settings.
- Conventions: UUIDv7 keys, `created_at`, `updated_at`, `deleted_at`, `device_id`, `user_id` on every table; money in paise; GST rates in basis points.
- Append-only ledgers: `stock_movements`, `payments`, `artisan_payments`, `audit_log`.
- `changes` table: id, device_id, hlc, table, row_id, op, payload, timestamp; written in the same transaction as the data write.
- Derived, never stored: stock on hand, customer dues, artisan payables, valuation, invoice paid/balance.
- The full target schema, with phase markers, is in `docs/schema.md` (D45). The list below is a summary.
- Tables: business_settings, users, devices, parties (customer/supplier/both), artisans, products, product_attributes, variants, stock_batches, stock_movements, purchases, purchase_items, orders, order_items, invoices, invoice_items, payments, artisan_payments, media, audit_log, changes, sync_state, schema_version, backups_log, gst_rules.
- Migrations: versioned, safety backup first, refuse downgrade.

## 4. Products, stock and costing

- Three kinds: standard item, variant item, unique piece (qty 1, own photo and code).
- Stock locations: Own, Damaged, Returns, Amazon FBA, Consignment.
- Purchases create batches (supplier or artisan, cost, date, optional attributes).
- **Costing by replay:** sale movements do not store batch allocation. Cost and batch consumption are derived by replaying all movements in (hlc, device_id, id) order. All devices converge on identical numbers after sync. Weighted average uses the same replay.
- Negative stock allowed with warning (D26); uncovered quantity uses the latest batch cost and is flagged.
- Cancelling an invoice adds reversing movements.
- Unique piece sold on two devices: both invoices stay valid, piece is flagged "oversold", owner resolves.

## 4a. Scale and performance (D40, D41)

- Target: 100,000 orders a year, up to 10 devices, 5 years of history. SQLite handles this easily; the risks are replay time, sync volume and phone storage.
- **Checkpoints (D40):** at financial year end and on demand, save a snapshot of stock on hand, FIFO batch remainders, customer dues and artisan payables. Costing replay starts from the latest checkpoint, not from day one. Checkpoints are derived and can be rebuilt from the ledgers.
- **Indexes:** movements by (product, location, hlc); invoices by (date, customer); changes by (hlc); parties by mobile; search table or FTS for names, SKUs, artisans, attributes.
- **Sync volume:** one invoice produces roughly 10 to 20 changes. Relay stores encrypted batches (one D1 row per batch, not per change) to stay inside the free write limits. After a checkpoint, old batches can be replaced by an encrypted snapshot so new devices join quickly.
- **Photos:** compressed to 800px WebP; thumbnails first; quota guard.
- **Performance test:** a seed script generates 5 years of data (about 500,000 invoices-worth of rows) and the test measures search, invoice save and a day's sync. Run on the owner's phone, not only in a desktop test.
- **E-invoicing:** at this turnover the business may need GST e-invoicing (IRN and QR from the government portal). Owner confirmed it is not in this phase. Out of scope for v0.1; confirm the threshold with the CA.

## 4b. Robustness (D42, D43)

- **Transactions:** an invoice finalize (number, lines, movements, changes, audit) is one transaction; it fully succeeds or leaves nothing.
- **Immutability:** finalized invoices and all ledgers are never edited or deleted; corrections are reversing entries.
- **Rolling snapshots:** automatic local snapshots daily (keep last 7 plus 4 weekly) and before migrations, restores and key rotation. Stored separately from application state.
- **Integrity check** (startup and on demand), reporting in plain language: stock on hand equals the sum of movements; invoice totals equal line totals plus tax plus round-off; invoice numbers have no gaps within a series and year; no orphan rows; checkpoint equals full replay (sampled); duplicate change ids absent.
- **Health screen:** storage used and persistence status, last backup, last sync, pending changes, integrity result, app and schema version.
- **Crash and power safety:** SQLite journaling is on; the app recovers cleanly if closed mid-write; tested by killing the worker mid-transaction.
- **Lost device:** a new device can join and restore from the relay's encrypted snapshot. The relay copy does not replace manual encrypted backups.
- **Rate of change:** every schema change goes through a versioned migration with a safety snapshot; rollbacks are by restore, never by editing data.
- **Tally export at volume:** chunked by month or 2,000 vouchers per file, with an "exported up to" marker per invoice so re-exports do not duplicate vouchers.

## 4c. Admin Lab and traceability (D48 to D52)

- **Where:** Settings, Admin (owner only; typed phrase before T8, PIN after).
- **Sandbox:** a second SQLite database file with the same schema. Switching to it shows a permanent banner. Sync, relay, Tally export and backup-to-share are disabled there. Delete or reset the sandbox at any time; the real database is untouched (tested).
- **Generator:** presets Small (1,000 invoices), Year (100,000) and Five years (500,000), plus custom. Parameters: seed, products and variants, unique-piece share, artisans, consignment share, customers, staff users, devices, invoices per day pattern, cancelled share, partial-payment share, interstate share, price spread, return-to-stock share. It calls the same Domain services as the UI. Same seed, same data (hash compared in a test). Runs in the background with progress, pause and cancel; target 100,000 invoices in under 15 minutes on the owner's phone (report the actual figure).
- **Multi-device simulation** (arrives with T9): create several simulated devices in the sandbox, let them make overlapping offline edits, then merge in different orders and compare results.
- **Benchmark panel:** runs the D41 checks (search, invoice save, a day's sync, replay from checkpoint) and stores timings in `lab_runs`.
- **Audit explorer:** filter by user, device, action, date, record or source; open any action to see its rows with before and after; export CSV (UTF-8 BOM).
- **Trace and Explain:** a Trace button on every record (invoices, payments, purchases, products, artisans, movements) and an Explain view for stock, dues, payables, invoice totals and FIFO cost, showing the exact contributing rows. Target under 1 second at 500,000 invoices.
- **Reconciliation reports:** sales register vs payments; stock vs movements; invoice number gaps; GST by rate; Tally export totals vs sales for the same period.
- **Rebuild tools:** rebuild checkpoints and derived caches and compare with a full replay; report differences, never silently fix them.
- **Fault injection:** kill the worker mid-transaction; deliver a change twice; deliver out of order; skew a device clock. Each test reports pass or fail.
- **Safety:** Admin actions are audited (`admin.*` kinds). The generator refuses to run on the real database, and an integrity check fails if any `source = demo` row is found there.
- **Storage guard (D53):** storage meter; estimated size shown before generating; refuse above 60% of free quota; data is built one financial year at a time with a checkpoint after each year and old `changes` and audit rows archived or pruned, as in real use; lean mode for load-only tests; one-click sandbox delete. Rough size to be measured in T1 (about 5 to 10 KB per invoice), so a one-year dataset fits on most phones and a five-year dataset is best built on the desktop.
- **Real app storage:** `changes` rows that every registered device has acknowledged and a checkpoint covers can be pruned; old audit rows are archived yearly to an encrypted file kept with backups.
- **Sync fault tests (D54):** the simulation harness and pure merge tests come first (T1); the full fault suite is part of T9.

## 5. GST and money

- Integer paise; half-up rounding; no floats.
- CGST+SGST when customer state equals business state, else IGST. Business state from GSTIN first two digits.
- CGST and SGST halves sum exactly to line tax.
- Per-line tax rounded to paise; invoice total rounded to the rupee with a round-off line (D25).
- GST rate resolved per line from `gst_rules` (HSN plus optional price slab). Seeded rules are samples to verify with the CA.
- GSTIN validated by format, state code and checksum.

## 6. Artisans

- Purchase: you own stock; payable at purchase.
- Consignment: artisan owns stock in location Consignment with an agreed payout price; payable when a unit is sold.
- Artisan ledger is append-only and derived; payouts are ledger entries; corrections are reversals.
- GST treatment of artisan purchases is not computed in v0.1 (question for the CA).

## 7. Sync

One engine over the `changes` log; transports hold no business logic.

- Hybrid logical clock for ordering; apply is idempotent by change id.
- Merge: ledgers union; master data LWW per row by (hlc, device_id); finalized invoices immutable; tombstones beat older updates.
- Invoice series per device (D10), so devices never collide.
- Sync status always visible: last synced, pending count, active transport. Failed syncs retry with backoff and never block the app.

**Transport A: cloud relay.** Cloudflare Pages Functions + D1 in `functions/api/`. Stores encrypted change batches and photo blobs keyed by workspace id. Endpoints: push, pull since cursor, blob upload/fetch, health. Sync on open, on reconnect, on save (debounced) and every 30 s while open and online. Rate and size limits; quota guard for photos.

**Transport B: same-WiFi direct.** WebRTC data channels, QR (or copy/paste) signaling, no internet needed. Best effort; must fail gracefully with a plain-language message. Not verified until tested on real phones and routers.

**Transport C: file.** Change file via the share sheet; idempotent import.

## 8. Pairing, roles and security

- Owner device creates the workspace and a random workspace key. Staff join via invite QR (10 minutes, single use). Payloads are AES-GCM encrypted before leaving the device. Revoke a device by rotating the key.
- Roles: owner and staff. Local PIN per user (PBKDF2, lockout, auto-lock). Staff default: can sell, record payments, view stock; cannot see costs or profit, cancel finalized invoices, view artisan payables, change settings, back up or invite devices. Owner can change per staff.
- Every mutation goes to `audit_log` with `user_id`.
- Honest limits (documented in `docs/sync-security.md`): permissions are enforced on the client only; a PIN is a lock, not strong security; the device is the trust boundary.

## 9. Backup and restore

- Single file, AES-GCM with a PBKDF2-derived key, version and checksum.
- Manual via the share sheet with a download fallback; reminder after 7 days without a backup.
- Restore validates first, takes an automatic safety backup, and a wrong passphrase or tampered file changes nothing.
- Google Drive backup later.

## 10. Tally integration

- v0.1: Sales voucher XML for Tally Prime, by date range.
- Data-driven mapping (ledgers, GST splits, party, bill reference) and a ledger-name mapping screen since names must match Tally exactly.
- Amounts in rupees with 2 decimals converted from paise without floats; dates YYYYMMDD; XML escaped.
- Golden-file tests from a real Tally Sales export (owner supplies a sample). Until then, a synthetic file, labelled as such.
- Receipt and Purchase vouchers later; live sync later via a desktop bridge.

## 11. PWA, hosting, print

- Cloudflare Pages; service worker precaches the shell; update-available prompt; migrations at startup.
- Print/PDF with native print or a vector PDF library; never html2canvas. First template: one Tally-style A5 invoice with a subtle ajrakh border. Warn if content overflows. On phones, Print opens the PDF with Save and Share; a "File ready" bar follows any export. CSV exports use UTF-8 with BOM.

## 12. Design

- Palette inspired by ajrakh: indigo, madder red, ochre, cream, sage. WCAG AA. Optional dark mode.
- Photo-first cards, 48px tap targets, one-handed bottom navigation with a central "New sale" button.
- Plain language, gentle empty states, undo where possible. Details in `docs/design-system.md`.

## 13. Testing

- Vitest: money, GST and slab rules, GSTIN, amount in words, invoice numbering, FIFO and average by replay, consignment payables, oversold pieces, PIN, sync merge and idempotency, encrypted round trips, backup, Tally XML.
- Real Android phone checks for every storage change.

## 14. Risks

| Risk | Mitigation |
|---|---|
| SQLite WASM + OPFS differs across Android browsers | T0 spike on real phone; IndexedDB fallback |
| Same-WiFi WebRTC fails on some routers | Best effort; relay and file as fallbacks |
| Costs diverge between devices | Deterministic replay costing, tested both sync orders |
| Same unique piece sold twice | Oversold flag and owner resolution |
| Staff permissions are client-side only | Documented honestly; device is the trust boundary |
| Photo storage exceeds free tier | Compression, thumbnails first, quota guard |
| Tally XML complexity | Data-driven mapping, golden files |
| GST slab or artisan GST misinterpreted | Rules as data, "verify with CA" labels |
| Silent data corruption or a bad write | Transactions, immutability, integrity check, rolling snapshots (D42) |
| Replay and balances slow down after years of data | Yearly checkpoints (D40), indexes, performance test (D41) |
| Relay free-tier write or storage limits | Batched encrypted rows, snapshots, quota guard |
| One person building everything | Strict task order, shippable steps |

## 15. Open questions

1. wa-sqlite vs official sqlite-wasm (T0).
2. Counter mode (D33) and barcode/QR (D34).
3. Exact Tally ledger naming scheme (before T7).
4. Google Drive backup earlier (D44).
5. CA review: GST slabs, artisan purchases, invoice series.
6. E-invoicing applicability and timing (CA).
7. Pricing and plan limits if this is later sold to other businesses.
