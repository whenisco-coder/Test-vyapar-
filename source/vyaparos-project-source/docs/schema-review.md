# T1 schema review — approved decisions implemented

Owner approved all five decisions on 2026-10-12:

1. HLC and sync metadata are included in v1. `changes` now carries `hlc`, `origin_device_id`, and optional `user_id`; `device_clock` persists the local clock; `sync_checkpoints` stores a cursor per remote device and stream. New repository writes tick and persist HLC in the same transaction as the change record.
2. Ajrakhika support is included in v1: `artisans`, product kinds (`standard`, `variant_parent`, `variant`, `unique_piece`), parent/variant attributes, artisan attribution, and a unique piece code. The existing tyre/auto-spares data remains supported.
3. Foreign keys, check constraints, uniqueness rules, and query indexes are added where appropriate. SKU and customer-mobile uniqueness apply to active rows only; invoice numbers/sequences are unique within series and financial year.
4. Finalized invoices and their items are immutable. Cancellation is represented by an append-only `invoice_reversals` record; the invoice row is not edited or soft-deleted. The dues view excludes invoices with reversal records.
5. `stock_checkpoints` stores immutable stock/FIFO replay snapshots and their checksum/through-ledger marker.

## Implementation notes

- `schema.ts` is the canonical schema; `schema.sql.ts` now re-exports it to prevent the tests and migration runner drifting apart.
- `schema_version.version` remains the documented integer primary-key exception because it is a migration registry, not a business entity.
- HLC format is `physicalMillis:logicalCounter:deviceId`. It provides a deterministic ordering primitive; merge/conflict policy and network sync remain later work.
- The migration runner is now schema version 2. It creates the approved schema for fresh databases and performs an additive, safety-backed upgrade for the pre-release v1 draft before indexes/triggers are installed.
- Acceptance is not yet complete: run the full test/build suite and verify persistence on the owner's Android phone before marking T1 done.
