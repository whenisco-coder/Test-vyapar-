# Schema: the big picture (draft for owner approval)

This is the full target schema, designed once so the business can grow (more staff, more shops, returns, daily tasks, e-invoicing, marketplaces) without rebuilding the database or losing accountability.

**Phase legend**
- **[v0.1]** table is created and used in v0.1.
- **[R]** reserved: designed here, created later by an additive migration when its task arrives. Nothing in v0.1 may block it.
- Columns marked *(hook)* exist in v0.1 tables but stay empty or default until a later phase. They are the cheap future-proofing.

---

## 1. Conventions (every table)

| Convention | Rule |
|---|---|
| `id` | UUIDv7 text primary key. Never autoincrement. |
| Timestamps | `created_at`, `updated_at`, `deleted_at`: integer milliseconds, UTC. `deleted_at` null means live (soft delete). |
| Accountability | `created_by`, `updated_by` (user ids), `device_id`, `hlc` (hybrid logical clock of the last write). `user_id` in D5 is `updated_by`. |
| Traceability | Every row also carries `action_id` (the user action that wrote it, one id per tap or transaction) and `source` (manual, sync, import, system, demo). All rows written in one action share one `action_id`, so any record can be traced back to who did what, when, on which device. |
| Money | Integer paise, column suffix `_paise`. Never floats. |
| Tax rates | Integer basis points, suffix `_bp` (18% = 1800). |
| Quantity | Integer thousandths, suffix `_milli` (1 piece = 1000, 2.5 metres = 2500). Allows metres and kilos without floats. Line amount = qty_milli x rate_paise / 1000, rounded half up. |
| Dates | Business dates (invoice date, due date) as `YYYY-MM-DD` text; instants as integer ms. |
| Flexible fields | `attributes` JSON text for non-queried extras only. Anything searched, filtered or totalled gets a real column. |
| Append-only tables | `stock_movements`, `payments`, `artisan_payments`, `audit_log`, `task_events`, `approval_events`. Rows are never updated or deleted; corrections are reversing rows. |
| Snapshots on documents | Invoices copy the customer name, GSTIN, address and state at the time of sale, so later edits never change a past invoice. |
| Naming | snake_case, singular concept per table, plural table names. |

---

## 2. Domain map

```
SYSTEM        business_settings  users  devices  number_series  media  settings_kv
SYNC & SAFETY changes  sync_state  audit_log  checkpoints  backups_log  schema_version  lab_runs (sandbox only)
PARTIES       parties  party_addresses  artisans  artisan_rates
CATALOG       categories  products  attribute_defs  variants  variant_codes  gst_rules  price_lists[R]
LOCATIONS     locations
INVENTORY     stock_batches  stock_movements  stock_adjustments  stock_transfers[R]  stocktakes[R]
BUYING        purchases  purchase_items  purchase_returns[R]
SELLING       orders  order_items  invoices  invoice_items  shipments[R]
MONEY         accounts  payments  payment_allocations  artisan_payments  expenses[R]  day_close[R]
TALLY         tally_ledger_map  tally_exports  tally_export_items
WORK & CONTROL tasks[R]  task_templates[R]  task_events[R]  approvals[R]  approval_events[R]  notifications[R]
```

---

## 3. System

**business_settings** [v0.1] (single row)
`business_name, legal_name, gstin, pan, gst_scheme (regular | composition | unregistered), address lines, city, pincode, state_code, phone, email, financial_year_start_month (4), invoice_prefix, stock_method (fifo | wavg), allow_negative_stock, default_language, currency ('INR'), bank_details (text), upi_id, logo_media_id, workspace_id (sync), einvoice_enabled (0) *(hook)*, einvoice_threshold_note *(hook)*`

**users** [v0.1]
`name, mobile, role (owner | staff | custom), permissions (JSON of allow flags), pin_hash, pin_salt, failed_attempts, locked_until, active, photo_media_id, display_color, last_login_at`
Permissions are stored per user so the owner can tune staff without new roles. Roles beyond owner and staff arrive without a schema change.

**devices** [v0.1]
`name, series_letter (invoice series), public_key, registered_at, revoked_at, last_seen_at, app_version`

**number_series** [v0.1]
`device_id, doc_type (invoice | credit_note | purchase | receipt), prefix, financial_year, last_number`
One row per device, document type and financial year. The invoice number is allocated here inside the finalize transaction, so there are no gaps and no duplicates.

**media** [v0.1]
`kind (product | artisan | logo | document), owner_table, owner_id, opfs_path, thumb_path, mime, width, height, bytes, sha256, synced_at`

**settings_kv** [v0.1]
`key, value` for small app settings that do not deserve a column (language, last export marker, UI prefs).

---

## 4. Sync and safety

**changes** [v0.1]: `id, action_id, device_id, hlc, table_name, row_id, op (insert | update | delete), payload (JSON, the new values), before (JSON, previous values for update and delete), source, created_at, pushed_at, applied_from_device`
**sync_state** [v0.1]: `transport, cursor, last_pull_at, last_push_at, pending_count, last_error`
**audit_log** [v0.1] append-only, one row per user action (`id` is the `action_id`): `id, at, user_id, device_id, source, kind (e.g. invoice.finalize, invoice.cancel, payment.record, price.override, stock.adjust, purchase.post, artisan.payout, user.create, backup.restore, admin.generate_demo), subject_table, subject_id, summary (plain-language one line), row_count, reason_code, reason_text, parent_action_id (for reversals and cancels), app_version, prev_hash, hash` (hash chain per device, D55)
Row-level before and after values live in `changes` linked by `action_id`, so the audit log stays small (about one row per action) while every changed row is still traceable. Old audit rows can be archived yearly to a compressed encrypted file kept with backups.
**lab_runs** [sandbox only]: `id, kind (generate | bench | fault | reconcile), params (JSON), seed, started_at, finished_at, result (JSON)`. This table exists only inside the sandbox database (D48).
**checkpoints** [v0.1] (D40): `id, as_of_hlc, financial_year, kind (year_end | manual), stock_json, batches_json, dues_json, artisan_payables_json, verified (0/1)`
**backups_log** [v0.1]: `at, kind (manual | auto_local | pre_migration | pre_restore | relay), bytes, checksum, location`
**schema_version** [v0.1]: `version, applied_at, app_version, snapshot_ref`

---

## 4a. Traceability and the Admin Lab

- **One action id per transaction.** Finalizing an invoice, for example, writes the invoice, items, stock movements, number allocation, changes and audit row, all with the same `action_id`.
- **Trace a record** (any invoice, payment, purchase, movement, artisan payout, product): follow `changes` and `audit_log` by `row_id` and `action_id` to show who, when, device, source, before and after values; and follow links up and down (invoice to order to items to movements to batches to purchase to artisan to payouts, and payments to allocations to invoices).
- **Explain a number:** for stock on hand, customer dues, artisan payables, invoice total and FIFO cost, list the exact rows that add up to it, from the latest checkpoint forward.
- **Sandbox database (D48):** dummy data and stress tests live in a separate database file that has the same schema but a different name. Nothing in the sandbox can reach the real database, the relay or Tally.
- Reconciliation views: sales register vs payments; stock vs movements; invoice number gaps; GST by rate; Tally export totals vs sales totals for the same period.

---

## 5. Parties and artisans

**parties** [v0.1] (customers, suppliers, or both)
`name, type (customer | supplier | both), kind (b2b | b2c), gstin, pan, mobile, alt_mobile, email, billing_address_id, default_state_code, credit_limit_paise *(hook)*, credit_days *(hook)*, opening_balance_paise, notes, tags, tally_ledger_name, source (shop | whatsapp | instagram | marketplace | other)`
Unique on mobile where not null (dedupe by mobile).

**party_addresses** [v0.1]
`party_id, label (billing | shipping | other), name, line1, line2, city, district, pincode, state_code, country, is_default`
Separate table so a customer can have several ship-to addresses later.

**artisans** [v0.1]
`name, village, craft, mobile, upi_id, bank_text, photo_media_id, notes, active, opening_payable_paise, party_id (optional link if the artisan is also a supplier)`

**artisan_rates** [v0.1]
`artisan_id, variant_id, mode (purchase | consignment), rate_paise, valid_from, valid_to`
Agreed purchase cost or consignment payout price per item. History is kept; the rate in force on the sale date applies.

---

## 6. Catalog

**categories** [v0.1]: `name, parent_id, sort, active`
**attribute_defs** [v0.1]: `name (size | colour | fabric | print | ...), values (JSON list), sort`
**products** [v0.1]
`name, kind (standard | variant_parent | unique_piece), category_id, hsn, unit, description, craft, origin_village, default_artisan_id, tax_inclusive, gst_rule_id (optional override), photo_media_id, tags, active, name_hi, name_gu`
**variants** [v0.1] (the sellable unit; every product has at least one)
`product_id, sku, label, attributes (JSON: size, colour, ...), selling_price_paise, mrp_paise, min_price_paise (staff floor), reorder_level_milli, photo_media_id, is_unique (0/1), sold_state (available | sold | oversold) *(only for unique pieces)*, active`
**variant_codes** [v0.1]: `variant_id, code, code_type (sku | barcode | qr | piece_tag), printed_at`  *(supports D34 scan/print later)*
**gst_rules** [v0.1] (D37): `hsn_prefix, rate_bp, price_from_paise, price_to_paise, per_unit_basis, cess_bp, valid_from, valid_to, label, verified_by_ca (0/1)`
**price_lists** [R]: `price_lists(id, name, kind retail | wholesale | marketplace)` and `price_list_items(price_list_id, variant_id, price_paise)`

---

## 7. Locations

**locations** [v0.1]
`name, kind (own | damaged | returns | marketplace | consignment | other), shop_or_godown, owner_artisan_id (for consignment), address, active`
Seeded with the D6 locations (Own, Damaged, Returns, Amazon FBA, Consignment). Adding a second shop or godown later is a new row, not a schema change.

---

## 8. Inventory

**stock_batches** [v0.1]
`variant_id, location_id, source (purchase | opening | consignment | adjustment | transfer), purchase_item_id, party_id, artisan_id, cost_paise, qty_in_milli, received_on, attributes (JSON: e.g. dye lot), notes`
**stock_movements** [v0.1] append-only
`variant_id, location_id, qty_delta_milli, reason (opening | purchase | consignment_in | consignment_return | sale | sale_cancel | adjustment | transfer_out | transfer_in | return_in | damage), ref_table, ref_id, batch_id (nullable, informational only), occurred_at, hlc, note`
Stock on hand is the sum of `qty_delta_milli`. Cost is derived by replay (D7), not stored here.
**stock_adjustments** [v0.1]: `variant_id, location_id, qty_delta_milli, reason_code (damage | loss | found | correction | gift | sample), reason_text, approved_by, movement_id`
**stock_transfers** [R]: `from_location_id, to_location_id, status, items (rows), sent_by, received_by`
**stocktakes** [R]: `location_id, started_by, status, stocktake_items(variant_id, counted_milli, system_milli, variance_milli)`

---

## 9. Buying

**purchases** [v0.1]
`party_id, artisan_id, kind (supplier_purchase | artisan_purchase | consignment_receipt | consignment_return), bill_no, bill_date, location_id, subtotal_paise, tax_paise, round_off_paise, total_paise, status (draft | posted | cancelled), notes, attachment_media_id, tax_treatment (regular | rcm_pending | exempt) *(hook, not computed in v0.1)*`
**purchase_items** [v0.1]: `purchase_id, variant_id, qty_milli, rate_paise, gst_rate_bp, hsn, tax_paise, line_total_paise, batch_id, attributes`
**purchase_returns** [R]: debit note against a purchase.

---

## 10. Selling

**orders** [v0.1] (a draft or confirmed sale before or without an invoice)
`party_id, channel (shop | whatsapp | instagram | amazon | website | other), channel_ref (marketplace order id), status (draft | confirmed | invoiced | cancelled), order_date, notes, assigned_to, ship_by`
**order_items** [v0.1]: `order_id, variant_id, qty_milli, rate_paise, discount_paise, notes`

**invoices** [v0.1]
```
doc_type              invoice | bill_of_supply | simple_bill | credit_note[R] | debit_note[R]
number, series_id, financial_year, invoice_date, status (draft | finalized | cancelled)
order_id, original_invoice_id (for credit notes)
party_id + snapshot: customer_name, customer_gstin, customer_address, customer_state_code, customer_mobile
supply: place_of_supply_state, is_igst, reverse_charge (0)
amounts: subtotal_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, cess_paise,
         round_off_paise, total_paise, amount_in_words
status fields: finalized_at, finalized_by, cancelled_at, cancelled_by, cancel_reason_code, cancel_reason_text
channel, channel_ref, salesperson_id, location_id
print: template, remarks, declaration
e-invoice (hook, nullable): einvoice_status, irn, ack_no, ack_date, signed_qr, signed_invoice_media_id, einvoice_error
e-way bill (hook, nullable): eway_bill_no, eway_bill_date, transport_mode, vehicle_no, transporter_id, distance_km
tally: tally_exported_at, tally_export_id
```
**invoice_items** [v0.1]
`invoice_id, variant_id, description, hsn, qty_milli, unit, rate_paise, discount_paise, taxable_paise, gst_rate_bp, cgst_paise, sgst_paise, igst_paise, cess_paise, line_total_paise, cost_paise_derived (cache, rebuildable), artisan_id, batch_hint, show_on_print`
Credit notes later use the same tables with `doc_type = credit_note` and their own series, so returns need no new line structure.
**shipments** [R]: `invoice_id, courier, awb, status, label_media_id, shipped_at, delivered_at, cod_amount_paise`

---

## 11. Money

**accounts** [v0.1]: `name, kind (cash | bank | upi | wallet | card), opening_balance_paise, active, tally_ledger_name`
**payments** [v0.1] append-only
`party_id, direction (in | out), amount_paise, mode (cash | upi | bank | card | cheque | other), account_id, reference, paid_on, received_by, note, reverses_payment_id`
**payment_allocations** [v0.1]: `payment_id, invoice_id (nullable = on account), amount_paise`
One payment can settle several invoices or sit as an advance. Dues are derived: invoice totals minus allocations, plus on-account balances.
**artisan_payments** [v0.1] append-only: `artisan_id, amount_paise, mode, account_id, reference, paid_on, paid_by, note, reverses_id`
**expenses** [R]: `category_id, amount_paise, account_id, paid_on, party_id, note, attachment_media_id`
**day_close** [R]: `date, location_id, opening_cash_paise, expected_cash_paise, counted_cash_paise, variance_paise, closed_by, notes`

---

## 12. Tally

**tally_ledger_map** [v0.1]: `purpose (party_default | sales | cgst | sgst | igst | cess | round_off | discount | cash | bank | upi), our_key, tally_ledger_name`
**tally_exports** [v0.1]: `exported_at, exported_by, from_date, to_date, voucher_type, file_name, voucher_count, status`
**tally_export_items** [v0.1]: `export_id, invoice_id, voucher_no, status`
Enables the "exported up to" marker (D43) and safe re-export.

---

## 13. Work and control (daily tasks and accountability) [R, designed now]

**tasks** [R]
`title, description, assigned_to, assigned_by, due_at, priority, status (open | doing | done | cancelled), linked_table, linked_id (e.g. an invoice, order, artisan), template_id, completed_at, completed_by, proof_media_id`
**task_templates** [R] (daily and recurring work): `title, description, role_or_user, recurrence_rule (daily | weekly | monthly | custom), time_of_day, active`
Examples: open shop checklist, daily cash count, daily backup check, follow up unpaid dues, check low stock, pay artisan weekly.
**task_events** [R] append-only: `task_id, at, user_id, event (created | assigned | started | commented | done | reopened), comment`
**approvals** [R]
`kind (discount_above_limit | price_below_floor | invoice_cancel | stock_adjustment | credit_note | payout_above_limit), requested_by, requested_at, subject_table, subject_id, details (JSON), status (pending | approved | rejected), decided_by, decided_at, decision_note`
**approval_events** [R] append-only: history of each approval.
**notifications** [R]: `user_id, kind, message, ref_table, ref_id, read_at`

**How accountability works across the whole schema**
- Every row records who created it, who changed it last, on which device, and when (`created_by`, `updated_by`, `device_id`, `hlc`).
- Every sensitive action writes an `audit_log` row with before and after values and a reason.
- Cancels, adjustments and price overrides require a reason code. In v0.1 the code is captured; in later phases the same events can require an approval from the owner without any schema change.
- Staff permissions live on `users.permissions`, so new rules need no migration.
- Tasks and approvals link to any record by `linked_table` and `linked_id`.

---

## 14. Derived, never stored as truth

Stock on hand per variant and location; FIFO cost and batch consumption (by replay from the latest checkpoint); inventory valuation; invoice paid, balance and status; customer dues and ledger; artisan payables and ledger; sales and tax summaries; HSN summaries; low-stock lists; day totals. Caches (such as `invoice_items.cost_paise_derived`) must be rebuildable and are checked by the integrity check.

---

## 15. Integrity rules (used by the integrity check, D42)

1. Stock on hand equals the sum of movements, per variant and location.
2. Invoice `total_paise` equals the sum of line totals plus tax plus round-off; round-off is within 50 paise.
3. CGST equals SGST per line; IGST appears only when `is_igst`.
4. Invoice numbers are consecutive per series and financial year; cancelled numbers still exist.
5. Finalized invoices have no draft-only edits after `finalized_at` (audit_log must show none).
6. Every payment allocation total is at most its payment amount; no negative allocations.
7. Consignment payables exist only for consignment units that were sold.
8. A unique piece has at most one live sale; otherwise `sold_state = oversold`.
9. No orphan foreign keys; no duplicate change ids; no autoincrement keys.
10. Checkpoint figures equal a sampled full replay.
11. Every row's `action_id` exists in `audit_log`; every audit row with `row_count > 0` has that many `changes`.
12. Every `changes` row with `op` update or delete has a `before` value.
13. No `source = demo` row exists in the real database.
14. The audit hash chain is unbroken for every device (each row's `prev_hash` equals the previous row's `hash`).

---

## 16. Indexes (v0.1)

- `stock_movements(variant_id, location_id, hlc)` and `(ref_table, ref_id)`
- `stock_batches(variant_id, location_id, received_on)`
- `invoices(invoice_date)`, `(party_id, invoice_date)`, `(series_id, number)` unique, `(status)`, `(tally_exported_at)`
- `invoice_items(invoice_id)`, `(variant_id)`
- `payments(party_id, paid_on)`, `payment_allocations(invoice_id)`
- `parties(mobile)` unique where not null, `(name)`
- `variants(sku)` unique, full-text search over name, SKU, artisan, craft, attributes
- `changes(hlc)`, `(pushed_at)` where null
- `audit_log(at)`, `(table_name, row_id)`, `(user_id, at)`
- `tasks(assigned_to, status, due_at)` when created

---

## 17. Migration rules for the reserved tables

- Reserved tables are added by additive migrations only (new tables, new nullable columns). No renames or drops of live columns; if unavoidable, use a two-step migration across versions.
- Every migration takes a safety snapshot first, refuses downgrade, and has a test with real-looking data.
- A reserved table created later must follow section 1 conventions and write to `changes`, so it syncs from day one.

---

## 18. What the owner is approving

1. The conventions in section 1, especially quantities in thousandths and invoice snapshots.
2. The invoice table with e-invoice and e-way bill hook columns, left empty in v0.1.
3. A `locations` table instead of a fixed list, so more shops and godowns are easy later.
4. `payment_allocations`, so partial payments and advances work correctly from the start.
5. Reserved task, approval and expense tables designed now, built later.
6. `business_settings.gst_scheme` (regular, composition, unregistered) to support Bill of Supply if needed.
