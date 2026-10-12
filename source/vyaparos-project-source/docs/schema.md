# Database Schema Specification (v1)

All primary keys are UUIDv7 text strings. Autoincrement keys are strictly forbidden. All timestamps are ISO 8601 strings in UTC. Money is stored as integer paise. GST rates are stored as basis points (1% = 100 bp).

### 1. `business_settings`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `business_name` TEXT NOT NULL
- `trade_name` TEXT
- `gstin` TEXT
- `state_code` TEXT NOT NULL
- `address_line1` TEXT
- `address_line2` TEXT
- `city` TEXT
- `pincode` TEXT
- `phone` TEXT
- `email` TEXT
- `bank_name` TEXT
- `bank_account_no` TEXT
- `bank_ifsc` TEXT
- `bank_branch` TEXT
- `upi_id` TEXT
- `invoice_prefix` TEXT NOT NULL DEFAULT 'INV'
- `stock_method` TEXT NOT NULL DEFAULT 'FIFO' -- 'FIFO' | 'WEIGHTED_AVG'
- `allow_negative_stock` INTEGER NOT NULL DEFAULT 0 -- 0: false, 1: true
- `financial_year_start_month` INTEGER NOT NULL DEFAULT 4 -- April
- `device_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 2. `users`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `name` TEXT NOT NULL
- `role` TEXT NOT NULL DEFAULT 'owner'
- `pin_hash` TEXT
- `device_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 3. `customers` (Parties - Customers & Suppliers)
- `id` TEXT PRIMARY KEY (UUIDv7)
- `name` TEXT NOT NULL
- `type` TEXT NOT NULL DEFAULT 'customer' -- 'customer' | 'supplier' | 'both'
- `party_kind` TEXT NOT NULL DEFAULT 'B2C' -- 'B2B' | 'B2C'
- `gstin` TEXT
- `mobile` TEXT
- `email` TEXT
- `address_line1` TEXT
- `address_line2` TEXT
- `city` TEXT
- `pincode` TEXT
- `state_code` TEXT NOT NULL DEFAULT '27'
- `notes` TEXT
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 4. `products`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `name` TEXT NOT NULL
- `sku` TEXT
- `hsn` TEXT NOT NULL
- `gst_rate_bp` INTEGER NOT NULL DEFAULT 1800 -- 18% = 1800 basis points
- `unit` TEXT NOT NULL DEFAULT 'NOS' -- 'NOS', 'SET', 'KGS', 'MTR', 'LTR'
- `selling_price_paise` INTEGER NOT NULL DEFAULT 0
- `mrp_paise` INTEGER NOT NULL DEFAULT 0
- `price_includes_tax` INTEGER NOT NULL DEFAULT 0 -- 0: exclusive, 1: inclusive
- `category` TEXT NOT NULL DEFAULT 'General'
- `active` INTEGER NOT NULL DEFAULT 1
- `min_stock_alert` INTEGER NOT NULL DEFAULT 0
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 5. `stock_batches`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `product_id` TEXT NOT NULL
- `location` TEXT NOT NULL DEFAULT 'Own' -- 'Own' | 'Damaged' | 'Returns' | 'Amazon FBA'
- `supplier_id` TEXT
- `purchase_id` TEXT
- `cost_paise` INTEGER NOT NULL
- `purchase_date` TEXT NOT NULL
- `quantity_in` INTEGER NOT NULL
- `attributes_json` TEXT -- e.g. {"tyre_dot": "2423", "mfg_date": "2024-06"}
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 6. `stock_movements` (Append-Only Ledger)
- `id` TEXT PRIMARY KEY (UUIDv7)
- `product_id` TEXT NOT NULL
- `batch_id` TEXT
- `location` TEXT NOT NULL DEFAULT 'Own'
- `qty_delta` INTEGER NOT NULL -- Positive for stock in, negative for stock out
- `cost_paise` INTEGER NOT NULL DEFAULT 0
- `reason` TEXT NOT NULL -- 'opening' | 'purchase' | 'sale' | 'cancel_sale' | 'adjustment'
- `ref_table` TEXT -- 'purchases' | 'invoices' | 'manual'
- `ref_id` TEXT
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### 7. `purchases`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `supplier_id` TEXT NOT NULL
- `supplier_invoice_no` TEXT
- `purchase_date` TEXT NOT NULL
- `status` TEXT NOT NULL DEFAULT 'posted' -- 'draft' | 'posted' | 'cancelled'
- `subtotal_paise` INTEGER NOT NULL DEFAULT 0
- `tax_paise` INTEGER NOT NULL DEFAULT 0
- `total_paise` INTEGER NOT NULL DEFAULT 0
- `notes` TEXT
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 8. `purchase_items`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `purchase_id` TEXT NOT NULL
- `product_id` TEXT NOT NULL
- `quantity` INTEGER NOT NULL
- `unit_cost_paise` INTEGER NOT NULL
- `gst_rate_bp` INTEGER NOT NULL
- `tax_paise` INTEGER NOT NULL
- `total_paise` INTEGER NOT NULL
- `batch_attributes_json` TEXT
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 9. `orders`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `order_no` TEXT NOT NULL
- `customer_id` TEXT NOT NULL
- `order_date` TEXT NOT NULL
- `status` TEXT NOT NULL DEFAULT 'pending' -- 'pending' | 'invoiced' | 'cancelled'
- `total_paise` INTEGER NOT NULL DEFAULT 0
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 10. `order_items`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `order_id` TEXT NOT NULL
- `product_id` TEXT NOT NULL
- `quantity` INTEGER NOT NULL
- `unit_price_paise` INTEGER NOT NULL
- `total_paise` INTEGER NOT NULL
- `created_at` TEXT NOT NULL
- `deleted_at` TEXT

### 11. `invoices`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `invoice_number` TEXT NOT NULL
- `series` TEXT NOT NULL DEFAULT 'INV'
- `sequence_number` INTEGER NOT NULL
- `financial_year` TEXT NOT NULL -- e.g. '2627'
- `invoice_date` TEXT NOT NULL
- `customer_id` TEXT NOT NULL
- `customer_snapshot_json` TEXT NOT NULL -- Snapshot of customer details at time of sale
- `mode` TEXT NOT NULL DEFAULT 'tax_invoice' -- 'tax_invoice' | 'simple_bill'
- `status` TEXT NOT NULL DEFAULT 'finalized' -- 'draft' | 'finalized' | 'cancelled'
- `is_interstate` INTEGER NOT NULL DEFAULT 0
- `taxable_total_paise` INTEGER NOT NULL DEFAULT 0
- `cgst_total_paise` INTEGER NOT NULL DEFAULT 0
- `sgst_total_paise` INTEGER NOT NULL DEFAULT 0
- `igst_total_paise` INTEGER NOT NULL DEFAULT 0
- `tax_total_paise` INTEGER NOT NULL DEFAULT 0
- `round_off_paise` INTEGER NOT NULL DEFAULT 0
- `grand_total_paise` INTEGER NOT NULL DEFAULT 0
- `notes` TEXT
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 12. `invoice_items`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `invoice_id` TEXT NOT NULL
- `product_id` TEXT NOT NULL
- `product_name` TEXT NOT NULL
- `hsn` TEXT NOT NULL
- `quantity` INTEGER NOT NULL
- `unit` TEXT NOT NULL DEFAULT 'NOS'
- `unit_price_paise` INTEGER NOT NULL
- `gst_rate_bp` INTEGER NOT NULL
- `taxable_amount_paise` INTEGER NOT NULL
- `cgst_paise` INTEGER NOT NULL DEFAULT 0
- `sgst_paise` INTEGER NOT NULL DEFAULT 0
- `igst_paise` INTEGER NOT NULL DEFAULT 0
- `total_paise` INTEGER NOT NULL
- `cost_paise` INTEGER NOT NULL DEFAULT 0 -- Derived from consumed FIFO batches
- `batches_consumed_json` TEXT -- Details of batch IDs and splits
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `deleted_at` TEXT

### 13. `payments` (Append-Only Ledger)
- `id` TEXT PRIMARY KEY (UUIDv7)
- `invoice_id` TEXT -- Nullable for on-account receipts
- `customer_id` TEXT NOT NULL
- `amount_paise` INTEGER NOT NULL
- `mode` TEXT NOT NULL DEFAULT 'cash' -- 'cash' | 'upi' | 'bank' | 'other'
- `reference` TEXT
- `notes` TEXT
- `is_reversal` INTEGER NOT NULL DEFAULT 0
- `reversal_of_id` TEXT
- `paid_at` TEXT NOT NULL
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### 14. `audit_log`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `action` TEXT NOT NULL
- `entity_type` TEXT NOT NULL
- `entity_id` TEXT NOT NULL
- `details_json` TEXT
- `device_id` TEXT NOT NULL
- `user_id` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### 15. `changes` (Append-Only Write Audit Log)
- `id` TEXT PRIMARY KEY (UUIDv7)
- `device_id` TEXT NOT NULL
- `table_name` TEXT NOT NULL
- `row_id` TEXT NOT NULL
- `op` TEXT NOT NULL -- 'INSERT' | 'UPDATE' | 'DELETE'
- `payload` TEXT NOT NULL
- `timestamp` TEXT NOT NULL

### 16. `schema_version`
- `version` INTEGER PRIMARY KEY
- `applied_at` TEXT NOT NULL
- `description` TEXT NOT NULL

### 17. `backups_log`
- `id` TEXT PRIMARY KEY (UUIDv7)
- `backup_type` TEXT NOT NULL -- 'manual' | 'auto_safety'
- `checksum` TEXT NOT NULL
- `record_count` INTEGER NOT NULL
- `created_at` TEXT NOT NULL


## Approved v1 additions (2026-10-12)

- `artisans` stores craftsperson identity and optional village, craft, contact, payment-text, and photo-key metadata.
- `products.product_kind` distinguishes `standard`, `variant_parent`, `variant`, and `unique_piece`. Variants link to `parent_product_id` and carry `variant_attributes_json`; products may link to an `artisan_id`. A unique piece can carry a stable `unique_piece_code`.
- `changes.hlc`, `changes.origin_device_id`, and `changes.user_id` provide change ordering and origin metadata. `device_clock` persists the local HLC state. HLC wire format is `physicalMillis:logicalCounter:deviceId`.
- `sync_checkpoints` stores per-remote-device stream cursors. `stock_checkpoints` stores immutable, checksummed snapshots for stock/FIFO replay.
- `invoice_reversals` is append-only and unique per invoice. Finalized invoice headers and lines cannot be updated/deleted; cancellation is represented by a reversal record and not by changing the finalized invoice row. Draft invoices are editable until finalization.
- Partial unique indexes enforce active customer mobile and active SKU uniqueness; invoice series/financial-year/number and sequence are unique. Additional indexes cover artisan/product lookup, change ordering/entity lookup, stock batch replay, invoice date/customer, and item parent lookups.
- The schema version registry uses an integer key as an explicit system-table exception to UUIDv7.
