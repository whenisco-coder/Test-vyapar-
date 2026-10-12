PRAGMA foreign_keys = ON;
-- Historical schema v1 fixture captured from the v1 source snapshot.
PRAGMA foreign_keys = ON;

-- 1. Schema version tracking table
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT NOT NULL
);

-- 2. Business Settings
CREATE TABLE IF NOT EXISTS business_settings (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  trade_name TEXT,
  gstin TEXT,
  state_code TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  bank_name TEXT,
  bank_account_no TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  upi_id TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  stock_method TEXT NOT NULL DEFAULT 'FIFO' CHECK (stock_method IN ('FIFO', 'WEIGHTED_AVG')),
  allow_negative_stock INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_stock IN (0, 1)),
  financial_year_start_month INTEGER NOT NULL DEFAULT 4 CHECK (financial_year_start_month BETWEEN 1 AND 12),
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 3. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'cashier', 'manager')),
  pin_hash TEXT,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 4. Customers / Parties (Customers & Suppliers)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'customer' CHECK (type IN ('customer', 'supplier', 'both')),
  party_kind TEXT NOT NULL DEFAULT 'B2C' CHECK (party_kind IN ('B2B', 'B2C')),
  gstin TEXT,
  mobile TEXT,
  email TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  pincode TEXT,
  state_code TEXT NOT NULL DEFAULT '27',
  notes TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 5. Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  hsn TEXT NOT NULL,
  gst_rate_bp INTEGER NOT NULL DEFAULT 1800 CHECK (gst_rate_bp >= 0),
  unit TEXT NOT NULL DEFAULT 'NOS' CHECK (unit IN ('NOS', 'SET', 'KGS', 'MTR', 'LTR')),
  selling_price_paise INTEGER NOT NULL DEFAULT 0 CHECK (selling_price_paise >= 0),
  mrp_paise INTEGER NOT NULL DEFAULT 0 CHECK (mrp_paise >= 0),
  price_includes_tax INTEGER NOT NULL DEFAULT 0 CHECK (price_includes_tax IN (0, 1)),
  category TEXT NOT NULL DEFAULT 'General',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  min_stock_alert INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_alert >= 0),
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 6. Stock Batches
CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  location TEXT NOT NULL DEFAULT 'Own',
  supplier_id TEXT REFERENCES customers(id),
  purchase_id TEXT,
  cost_paise INTEGER NOT NULL CHECK (cost_paise >= 0),
  purchase_date TEXT NOT NULL,
  quantity_in INTEGER NOT NULL CHECK (quantity_in > 0),
  attributes_json TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 7. Stock Movements (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_id TEXT REFERENCES stock_batches(id),
  location TEXT NOT NULL DEFAULT 'Own',
  qty_delta INTEGER NOT NULL CHECK (qty_delta != 0),
  cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (cost_paise >= 0),
  reason TEXT NOT NULL CHECK (reason IN ('opening', 'purchase', 'sale', 'cancel_sale', 'adjustment')),
  ref_table TEXT CHECK (ref_table IN ('purchases', 'invoices', 'manual')),
  ref_id TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 8. Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES customers(id),
  supplier_invoice_no TEXT,
  purchase_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'cancelled')),
  subtotal_paise INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
  tax_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise INTEGER NOT NULL DEFAULT 0 CHECK (total_paise >= 0),
  notes TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 9. Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_paise INTEGER NOT NULL CHECK (unit_cost_paise >= 0),
  gst_rate_bp INTEGER NOT NULL CHECK (gst_rate_bp >= 0),
  tax_paise INTEGER NOT NULL CHECK (tax_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  batch_attributes_json TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 10. Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  order_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'cancelled')),
  total_paise INTEGER NOT NULL DEFAULT 0 CHECK (total_paise >= 0),
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 11. Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);

-- 12. Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id),
  invoice_number TEXT NOT NULL,
  series TEXT NOT NULL DEFAULT 'INV',
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  financial_year TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_snapshot_json TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'tax_invoice' CHECK (mode IN ('tax_invoice', 'simple_bill')),
  status TEXT NOT NULL DEFAULT 'finalized' CHECK (status IN ('draft', 'finalized', 'cancelled')),
  is_interstate INTEGER NOT NULL DEFAULT 0 CHECK (is_interstate IN (0, 1)),
  taxable_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (taxable_total_paise >= 0),
  cgst_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (cgst_total_paise >= 0),
  sgst_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (sgst_total_paise >= 0),
  igst_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (igst_total_paise >= 0),
  tax_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (tax_total_paise >= 0),
  round_off_paise INTEGER NOT NULL DEFAULT 0,
  grand_total_paise INTEGER NOT NULL DEFAULT 0 CHECK (grand_total_paise >= 0),
  notes TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 13. Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  hsn TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'NOS',
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  gst_rate_bp INTEGER NOT NULL CHECK (gst_rate_bp >= 0),
  taxable_amount_paise INTEGER NOT NULL CHECK (taxable_amount_paise >= 0),
  cgst_paise INTEGER NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise INTEGER NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise INTEGER NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (cost_paise >= 0),
  batches_consumed_json TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 14. Payments (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  mode TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'upi', 'bank', 'other')),
  reference TEXT,
  notes TEXT,
  is_reversal INTEGER NOT NULL DEFAULT 0 CHECK (is_reversal IN (0, 1)),
  reversal_of_id TEXT REFERENCES payments(id),
  paid_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 15. Audit Log (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 16. Universal Changes Log (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  payload TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  deleted_at TEXT
);

-- 17. Backups Log
CREATE TABLE IF NOT EXISTS backups_log (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('manual', 'auto_safety')),
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  size_bytes INTEGER CHECK (size_bytes >= 0),
  device_id TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Historical schema v1 fixture captured from the v1 source snapshot.
-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_mobile_active ON customers(mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON stock_movements(product_id, location);
CREATE INDEX IF NOT EXISTS idx_stock_batches_prod ON stock_batches(product_id, location);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_series_fy_num ON invoices(series, financial_year, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_series_fy_seq ON invoices(series, financial_year, sequence_number);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes(timestamp);

-- Historical schema v1 fixture captured from the v1 source snapshot.
-- Append-only ledger triggers: reject UPDATE and DELETE
CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is an append-only ledger: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is an append-only ledger: DELETE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_no_update
BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments is an append-only ledger: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_no_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments is an append-only ledger: DELETE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is an append-only ledger: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is an append-only ledger: DELETE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_changes_no_update
BEFORE UPDATE ON changes
BEGIN
  SELECT RAISE(ABORT, 'changes is an append-only ledger: UPDATE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_changes_no_delete
BEFORE DELETE ON changes
BEGIN
  SELECT RAISE(ABORT, 'changes is an append-only ledger: DELETE forbidden');
END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_no_delete
BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoices rows are immutable: hard DELETE forbidden');
END;

-- Historical schema v1 fixture captured from the v1 source snapshot.
-- Derived views
CREATE VIEW IF NOT EXISTS stock_on_hand AS
SELECT
  product_id,
  location,
  COALESCE(SUM(qty_delta), 0) AS on_hand_qty
FROM stock_movements
GROUP BY product_id, location;

CREATE VIEW IF NOT EXISTS customer_dues AS
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  COALESCE(inv.total_invoiced_paise, 0) AS total_invoiced_paise,
  COALESCE(pmt.total_paid_paise, 0) AS total_paid_paise,
  (COALESCE(inv.total_invoiced_paise, 0) - COALESCE(pmt.total_paid_paise, 0)) AS balance_paise
FROM customers c
LEFT JOIN (
  SELECT
    customer_id,
    SUM(grand_total_paise) AS total_invoiced_paise
  FROM invoices
  WHERE status != 'cancelled'
  GROUP BY customer_id
) inv ON c.id = inv.customer_id
LEFT JOIN (
  SELECT
    customer_id,
    SUM(CASE WHEN is_reversal = 1 THEN -amount_paise ELSE amount_paise END) AS total_paid_paise
  FROM payments
  GROUP BY customer_id
) pmt ON c.id = pmt.customer_id;

CREATE VIEW IF NOT EXISTS stock_valuation AS
SELECT
  sm.product_id,
  p.name AS product_name,
  sm.location,
  COALESCE(SUM(sm.qty_delta), 0) AS on_hand_qty,
  COALESCE(SUM(sm.qty_delta * sm.cost_paise), 0) AS total_valuation_paise
FROM stock_movements sm
JOIN products p ON sm.product_id = p.id
GROUP BY sm.product_id, sm.location;
