/**
 * Domain Entities and Type Definitions
 */

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  device_id: string;
  user_id: string;
}

export interface BusinessSettings extends BaseEntity {
  business_name: string;
  trade_name?: string | null;
  gstin: string;
  state_code: string;
  phone?: string | null;
  email?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  pincode: string;
  invoice_prefix: string;
  financial_year_start: string;
  financial_year_start_month?: number;
  stock_method: 'FIFO' | 'WEIGHTED_AVG';
  allow_negative_stock: number; // 0 or 1
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
  upi_id?: string | null;
  tally_sales_ledger?: string;
  tally_cgst_ledger?: string;
  tally_sgst_ledger?: string;
  tally_igst_ledger?: string;
  tally_round_off_ledger?: string;
  is_onboarded: number; // 0 or 1
}

export interface User extends BaseEntity {
  name: string;
  role: 'OWNER' | 'owner';
  pin_hash?: string | null;
}

export interface Party extends BaseEntity {
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'customer' | 'supplier' | 'both';
  party_kind: 'B2B' | 'B2C';
  gstin?: string | null;
  mobile?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  pincode?: string | null;
  state_code: string;
  notes?: string | null;
}

export type Customer = Party;
export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'customer' | 'supplier' | 'both';
export type PartyKind = 'B2B' | 'B2C';
export type StockLocation = 'Own' | 'Damaged' | 'Returns' | 'Amazon FBA' | string;
export type StockReason =
  | 'OPENING'
  | 'PURCHASE'
  | 'SALE'
  | 'CANCEL_SALE'
  | 'ADJUSTMENT'
  | 'opening'
  | 'purchase'
  | 'sale'
  | 'cancel_sale'
  | 'adjustment';
export type InvoiceMode = 'TAX_INVOICE' | 'SIMPLE_BILL' | 'tax_invoice' | 'simple_bill';
export type InvoiceStatus = 'DRAFT' | 'FINALIZED' | 'CANCELLED' | 'draft' | 'finalized' | 'cancelled';
export type PurchaseStatus = 'DRAFT' | 'POSTED' | 'draft' | 'posted' | 'cancelled';
export type PaymentMode =
  | 'CASH'
  | 'UPI'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'OTHER'
  | 'cash'
  | 'upi'
  | 'bank'
  | 'other';
export type StockValuationMethod = 'FIFO' | 'WEIGHTED_AVG';

export type ProductKind = 'standard' | 'variant_parent' | 'variant' | 'unique_piece';

export interface Artisan extends BaseEntity {
  name: string;
  village?: string | null;
  craft?: string | null;
  mobile?: string | null;
  upi_or_bank_text?: string | null;
  photo_blob_key?: string | null;
  notes?: string | null;
}

export interface Product extends BaseEntity {
  name: string;
  sku?: string | null;
  hsn: string;
  gst_rate_bp: number;
  unit: string;
  selling_price_paise: number;
  mrp_paise: number;
  price_includes_tax: number; // 0 or 1
  category?: string | null;
  active: number; // 0 or 1
  min_stock_alert?: number;
  product_kind?: ProductKind;
  parent_product_id?: string | null;
  variant_attributes_json?: string | null;
  artisan_id?: string | null;
  unique_piece_code?: string | null;
}

export interface StockBatch extends BaseEntity {
  product_id: string;
  location: string;
  supplier_id?: string | null;
  purchase_id?: string | null;
  cost_paise: number;
  purchase_date: string;
  quantity_in: number;
  attributes_json?: string | null;
  remainingQty?: number;
}

export interface StockCheckpointRecord extends BaseEntity {
  checkpoint_at: string;
  through_movement_id?: string | null;
  through_created_at: string;
  snapshot_json: string;
  checksum: string;
  row_count: number;
}

export interface StockMovement extends BaseEntity {
  product_id: string;
  batch_id?: string | null;
  location: string;
  qty_delta: number;
  cost_paise?: number;
  reason: StockReason;
  ref_table?: string | null;
  ref_id?: string | null;
  notes?: string | null;
}

export interface PurchaseItem extends BaseEntity {
  purchase_id: string;
  product_id: string;
  quantity: number;
  cost_paise?: number;
  unit_cost_paise?: number;
  gst_rate_bp: number;
  taxable_paise?: number;
  tax_paise: number;
  total_paise: number;
  batch_attributes_json?: string | null;
}

export interface Purchase extends BaseEntity {
  supplier_id: string;
  invoice_number?: string | null;
  supplier_invoice_no?: string | null;
  purchase_date: string;
  status: PurchaseStatus;
  total_taxable_paise?: number;
  subtotal_paise?: number;
  total_tax_paise?: number;
  tax_paise?: number;
  total_amount_paise?: number;
  total_paise?: number;
  notes?: string | null;
  items?: PurchaseItem[];
}

export interface InvoiceSeries extends BaseEntity {
  series_prefix: string;
  financial_year: string;
  last_number: number;
}

export interface Invoice extends BaseEntity {
  number?: string;
  invoice_number?: string;
  series: string;
  sequence_number: number;
  financial_year: string;
  date?: string;
  invoice_date?: string;
  due_date?: string | null;
  mode: InvoiceMode;
  status: InvoiceStatus;
  customer_id: string;
  customer_snapshot_json: string;
  is_interstate?: number;
  taxable_paise?: number;
  taxable_total_paise?: number;
  cgst_paise?: number;
  cgst_total_paise?: number;
  sgst_paise?: number;
  sgst_total_paise?: number;
  igst_paise?: number;
  igst_total_paise?: number;
  total_tax_paise?: number;
  tax_total_paise?: number;
  round_off_paise: number;
  grand_total_paise: number;
  notes?: string | null;
  cancellation_reason?: string | null;
  items?: InvoiceItem[];
}

export interface InvoiceItem extends BaseEntity {
  invoice_id: string;
  product_id: string;
  product_name: string;
  hsn: string;
  quantity: number;
  unit: string;
  unit_price_paise: number;
  gst_rate_bp: number;
  taxable_paise: number;
  taxable_amount_paise?: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_tax_paise?: number;
  total_paise: number;
  cost_paise: number;
  batches_consumed_json?: string | null;
}

export interface Payment extends BaseEntity {
  customer_id: string;
  invoice_id?: string | null;
  amount_paise: number;
  mode: PaymentMode;
  reference?: string | null;
  notes?: string | null;
  paid_at: string;
  is_reversal: number; // 0 or 1
  reversal_of_id?: string | null;
}

export interface AuditLog extends BaseEntity {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details_json?: string | null;
  timestamp: string;
}

export interface ChangeRecord {
  id: string;
  table_name: string;
  row_id: string;
  op: 'insert' | 'update' | 'delete' | 'INSERT' | 'UPDATE' | 'DELETE';
  payload?: string;
  payload_json?: string;
  timestamp: string;
  device_id: string;
  origin_device_id?: string;
  hlc?: string;
  user_id?: string | null;
}

export interface BackupLog {
  id: string;
  backup_type: 'manual' | 'auto_safety' | string;
  checksum: string;
  file_name?: string | null;
  size_bytes?: number | null;
  record_count: number;
  created_at: string;
}

export interface ProductStockInfo {
  product: Product;
  quantityOnHand: number;
  totalCostPaise: number;
  avgCostPaise: number;
  locations: Record<string, number>;
}

export interface CustomerDueInfo {
  customer: Customer;
  totalInvoicedPaise: number;
  totalPaidPaise: number;
  totalDuePaise: number;
  lastInvoiceDate?: string;
  lastPaymentDate?: string;
}

export interface CustomerLedgerEntry {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'REVERSAL';
  refNumber: string;
  debitPaise: number;
  creditPaise: number;
  runningBalancePaise: number;
  description: string;
}

export const STANDARD_UNITS = [
  'NOS',
  'SET',
  'PCS',
  'KGS',
  'LTR',
  'MTR',
  'PKT',
  'BDL',
  'DOZ',
  'PRS',
  'ROL',
] as const;

export const AUTO_CATEGORIES = [
  'Tyres',
  'Tubes & Flaps',
  'Lubricants & Oils',
  'Batteries',
  'Brake Parts',
  'Suspension & Steering',
  'Engine Spares',
  'Filters & Belts',
  'Electrical & Bulbs',
  'Accessories',
  'General',
] as const;
