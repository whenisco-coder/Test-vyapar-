import { IDatabaseClient } from '../../data/sqliteClient';
import {
  ISettingsRepo,
  IUserRepo,
  IArtisanRepo,
  ICustomerRepo,
  IProductRepo,
  IStockRepo,
  IPurchaseRepo,
  IInvoiceRepo,
  IPaymentRepo,
  IChangeRepo,
  IBackupLogRepo,
} from './interfaces';
import {
  BusinessSettings,
  User,
  Artisan,
  Customer,
  Product,
  StockBatch,
  StockMovement,
  StockCheckpointRecord,
  Purchase,
  PurchaseItem,
  Invoice,
  InvoiceItem,
  Payment,
  ChangeRecord,
  BackupLog,
  ProductStockInfo,
  CustomerDueInfo,
  CustomerLedgerEntry,
  StockLocation,
} from '../types';
import { generateUUIDv7 } from '../uuid';
import { subPaise, addPaise } from '../money';
import { tickHLC, parseHLC } from '../hlc';
import { buildStockCheckpoint, verifyStockCheckpoint } from '../checkpoints';

export class ChangeRepo implements IChangeRepo {
  constructor(private db: IDatabaseClient) {}

  async appendChange(change: ChangeRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      const hlc = change.hlc ?? await nextPersistedHLC(tx, change.device_id);
      await tx.execute(
        'INSERT INTO changes (id, device_id, origin_device_id, hlc, table_name, row_id, op, payload, timestamp, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [change.id, change.device_id, change.origin_device_id ?? change.device_id, hlc, change.table_name, change.row_id, change.op, change.payload ?? change.payload_json ?? '{}', change.timestamp, change.user_id ?? null]
      );
    });
  }

  async getAll(limit = 100): Promise<ChangeRecord[]> {
    return await this.db.query<ChangeRecord>(
      'SELECT * FROM changes ORDER BY timestamp DESC LIMIT ' + limit
    );
  }
}

async function nextPersistedHLC(tx: IDatabaseClient, deviceId: string): Promise<string> {
  const existing = await tx.queryOne<{ id: string; last_hlc: string }>(
    'SELECT id, last_hlc FROM device_clock WHERE device_id = ?', [deviceId]
  );
  const hlc = tickHLC(existing?.last_hlc, Date.now(), deviceId);
  const parsed = parseHLC(hlc);
  const now = new Date().toISOString();
  if (existing) {
    await tx.execute(
      'UPDATE device_clock SET physical_ms = ?, logical_counter = ?, last_hlc = ?, updated_at = ? WHERE id = ?',
      [parsed.physicalMs, parsed.logical, hlc, now, existing.id]
    );
  } else {
    await tx.execute(
      'INSERT INTO device_clock (id, device_id, physical_ms, logical_counter, last_hlc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [generateUUIDv7(), deviceId, parsed.physicalMs, parsed.logical, hlc, now, now]
    );
  }
  return hlc;
}

async function recordChange(
  tx: IDatabaseClient,
  deviceId: string,
  tableName: string,
  rowId: string,
  op: 'insert' | 'update' | 'delete' | 'INSERT' | 'UPDATE' | 'DELETE',
  payload: unknown
) {
  const normalizedOp = op.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE';
  const change: ChangeRecord = {
    id: generateUUIDv7(),
    device_id: deviceId,
    origin_device_id: deviceId,
    hlc: await nextPersistedHLC(tx, deviceId),
    user_id: typeof payload === 'object' && payload !== null && 'user_id' in payload
      ? String((payload as { user_id?: unknown }).user_id ?? '') || null
      : null,
    table_name: tableName,
    row_id: rowId,
    op: normalizedOp,
    payload: JSON.stringify(payload),
    timestamp: new Date().toISOString(),
  };
  await tx.execute(
    'INSERT INTO changes (id, device_id, origin_device_id, hlc, table_name, row_id, op, payload, timestamp, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      change.id, change.device_id, change.origin_device_id, change.hlc, change.table_name,
      change.row_id, change.op, change.payload, change.timestamp, change.user_id ?? null,
    ]
  );
}

export class SettingsRepo implements ISettingsRepo {
  constructor(private db: IDatabaseClient) {}

  async get(): Promise<BusinessSettings | null> {
    const rows = await this.db.query<BusinessSettings>('SELECT * FROM business_settings LIMIT 1');
    return rows.length > 0 ? rows[0] : null;
  }

  async save(settings: BusinessSettings): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<BusinessSettings>(
        'SELECT id FROM business_settings WHERE id = ?',
        [settings.id]
      );
      if (existing) {
        await tx.execute(
          `UPDATE business_settings SET 
            business_name = ?, trade_name = ?, gstin = ?, state_code = ?,
            address_line1 = ?, address_line2 = ?, city = ?, pincode = ?,
            phone = ?, email = ?, bank_name = ?, bank_account_no = ?,
            bank_ifsc = ?, bank_branch = ?, upi_id = ?, invoice_prefix = ?,
            stock_method = ?, allow_negative_stock = ?, financial_year_start_month = ?,
            device_id = ?, updated_at = ?
           WHERE id = ?`,
          [
            settings.business_name,
            settings.trade_name ?? null,
            settings.gstin ?? null,
            settings.state_code,
            settings.address_line1 ?? null,
            settings.address_line2 ?? null,
            settings.city ?? null,
            settings.pincode ?? null,
            settings.phone ?? null,
            settings.email ?? null,
            settings.bank_name ?? null,
            settings.bank_account_no ?? null,
            settings.bank_ifsc ?? null,
            settings.bank_branch ?? null,
            settings.upi_id ?? null,
            settings.invoice_prefix,
            settings.stock_method,
            settings.allow_negative_stock,
            settings.financial_year_start_month,
            settings.device_id,
            new Date().toISOString(),
            settings.id,
          ]
        );
        await recordChange(tx, settings.device_id, 'business_settings', settings.id, 'UPDATE', settings);
      } else {
        await tx.execute(
          `INSERT INTO business_settings (
            id, business_name, trade_name, gstin, state_code,
            address_line1, address_line2, city, pincode,
            phone, email, bank_name, bank_account_no,
            bank_ifsc, bank_branch, upi_id, invoice_prefix,
            stock_method, allow_negative_stock, financial_year_start_month,
            device_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            settings.id,
            settings.business_name,
            settings.trade_name ?? null,
            settings.gstin ?? null,
            settings.state_code,
            settings.address_line1 ?? null,
            settings.address_line2 ?? null,
            settings.city ?? null,
            settings.pincode ?? null,
            settings.phone ?? null,
            settings.email ?? null,
            settings.bank_name ?? null,
            settings.bank_account_no ?? null,
            settings.bank_ifsc ?? null,
            settings.bank_branch ?? null,
            settings.upi_id ?? null,
            settings.invoice_prefix,
            settings.stock_method,
            settings.allow_negative_stock,
            settings.financial_year_start_month,
            settings.device_id,
            settings.created_at,
            settings.updated_at,
          ]
        );
        await recordChange(tx, settings.device_id, 'business_settings', settings.id, 'INSERT', settings);
      }
    });
  }
}

export class UserRepo implements IUserRepo {
  constructor(private db: IDatabaseClient) {}

  async getOwner(): Promise<User | null> {
    const rows = await this.db.query<User>('SELECT * FROM users WHERE deleted_at IS NULL LIMIT 1');
    return rows.length > 0 ? rows[0] : null;
  }

  async save(user: User): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<User>('SELECT id FROM users WHERE id = ?', [user.id]);
      if (existing) {
        await tx.execute(
          'UPDATE users SET name = ?, role = ?, pin_hash = ?, updated_at = ? WHERE id = ?',
          [user.name, user.role, user.pin_hash ?? null, new Date().toISOString(), user.id]
        );
        await recordChange(tx, user.device_id, 'users', user.id, 'UPDATE', user);
      } else {
        await tx.execute(
          'INSERT INTO users (id, name, role, pin_hash, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, user.name, user.role, user.pin_hash ?? null, user.device_id, user.created_at, user.updated_at]
        );
        await recordChange(tx, user.device_id, 'users', user.id, 'INSERT', user);
      }
    });
  }
}

export class CustomerRepo implements ICustomerRepo {
  constructor(private db: IDatabaseClient) {}

  async getAll(): Promise<Customer[]> {
    return await this.db.query<Customer>('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name ASC');
  }

  async getById(id: string): Promise<Customer | null> {
    return await this.db.queryOne<Customer>('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id]);
  }

  async findByMobile(mobile: string): Promise<Customer | null> {
    const clean = mobile.trim();
    if (!clean) return null;
    return await this.db.queryOne<Customer>(
      'SELECT * FROM customers WHERE mobile = ? AND deleted_at IS NULL LIMIT 1',
      [clean]
    );
  }

  async save(customer: Customer): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<Customer>('SELECT id FROM customers WHERE id = ?', [customer.id]);
      if (existing) {
        await tx.execute(
          `UPDATE customers SET 
            name = ?, type = ?, party_kind = ?, gstin = ?, mobile = ?,
            email = ?, address_line1 = ?, address_line2 = ?, city = ?,
            pincode = ?, state_code = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [
            customer.name,
            customer.type,
            customer.party_kind,
            customer.gstin ?? null,
            customer.mobile ?? null,
            customer.email ?? null,
            customer.address_line1 ?? null,
            customer.address_line2 ?? null,
            customer.city ?? null,
            customer.pincode ?? null,
            customer.state_code,
            customer.notes ?? null,
            new Date().toISOString(),
            customer.id,
          ]
        );
        await recordChange(tx, customer.device_id, 'customers', customer.id, 'UPDATE', customer);
      } else {
        await tx.execute(
          `INSERT INTO customers (
            id, name, type, party_kind, gstin, mobile, email,
            address_line1, address_line2, city, pincode, state_code,
            notes, device_id, user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customer.id,
            customer.name,
            customer.type,
            customer.party_kind,
            customer.gstin ?? null,
            customer.mobile ?? null,
            customer.email ?? null,
            customer.address_line1 ?? null,
            customer.address_line2 ?? null,
            customer.city ?? null,
            customer.pincode ?? null,
            customer.state_code,
            customer.notes ?? null,
            customer.device_id,
            customer.user_id,
            customer.created_at,
            customer.updated_at,
          ]
        );
        await recordChange(tx, customer.device_id, 'customers', customer.id, 'INSERT', customer);
      }
    });
  }

  async softDelete(id: string): Promise<void> {
    const cust = await this.getById(id);
    if (!cust) return;
    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      await tx.execute('UPDATE customers SET deleted_at = ? WHERE id = ?', [now, id]);
      await recordChange(tx, cust.device_id, 'customers', id, 'DELETE', { id, deleted_at: now });
    });
  }

  async getDues(): Promise<CustomerDueInfo[]> {
    const customers = await this.getAll();
    const invoices = await this.db.query<Invoice>(
      "SELECT id, customer_id, grand_total_paise, invoice_date FROM invoices WHERE status != 'cancelled' AND deleted_at IS NULL"
    );
    const reversalRows = await this.db.query<{ invoice_id: string }>('SELECT invoice_id FROM invoice_reversals');
    const reversedInvoiceIds = new Set(reversalRows.map((row) => row.invoice_id));
    const activeInvoices = invoices.filter((invoice) => !reversedInvoiceIds.has(invoice.id));
    const payments = await this.db.query<Payment>('SELECT customer_id, amount_paise, paid_at FROM payments');

    const invoicedMap = new Map<string, number>();
    const lastInvoiceMap = new Map<string, string>();
    for (const inv of activeInvoices) {
      const current = invoicedMap.get(inv.customer_id) || 0;
      invoicedMap.set(inv.customer_id, current + inv.grand_total_paise);
      const invDate = inv.invoice_date || inv.date || '';
      const last = lastInvoiceMap.get(inv.customer_id);
      if (!last || invDate > last) {
        lastInvoiceMap.set(inv.customer_id, invDate);
      }
    }

    const paidMap = new Map<string, number>();
    const lastPaymentMap = new Map<string, string>();
    for (const p of payments) {
      const current = paidMap.get(p.customer_id) || 0;
      paidMap.set(p.customer_id, current + p.amount_paise);
      const last = lastPaymentMap.get(p.customer_id);
      if (!last || p.paid_at > last) {
        lastPaymentMap.set(p.customer_id, p.paid_at);
      }
    }

    const results: CustomerDueInfo[] = [];
    for (const customer of customers) {
      const totalInvoicedPaise = invoicedMap.get(customer.id) || 0;
      const totalPaidPaise = paidMap.get(customer.id) || 0;
      const totalDuePaise = subPaise(totalInvoicedPaise, totalPaidPaise);

      results.push({
        customer,
        totalInvoicedPaise,
        totalPaidPaise,
        totalDuePaise,
        lastInvoiceDate: lastInvoiceMap.get(customer.id),
        lastPaymentDate: lastPaymentMap.get(customer.id),
      });
    }

    // Sorted by due amount descending
    return results.sort((a, b) => b.totalDuePaise - a.totalDuePaise);
  }

  async getLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    const invoices = await this.db.query<Invoice>(
      "SELECT id, invoice_number, invoice_date, grand_total_paise FROM invoices WHERE customer_id = ? AND status != 'cancelled' AND deleted_at IS NULL",
      [customerId]
    );
    const reversalRows = await this.db.query<{ invoice_id: string }>('SELECT invoice_id FROM invoice_reversals');
    const reversedInvoiceIds = new Set(reversalRows.map((row) => row.invoice_id));
    const activeInvoices = invoices.filter((invoice) => !reversedInvoiceIds.has(invoice.id));
    const payments = await this.db.query<Payment>(
      'SELECT id, reference, mode, amount_paise, is_reversal, paid_at FROM payments WHERE customer_id = ?',
      [customerId]
    );

    type RawEntry = {
      id: string;
      date: string;
      type: 'INVOICE' | 'PAYMENT' | 'REVERSAL';
      refNumber: string;
      debitPaise: number;
      creditPaise: number;
      description: string;
    };

    const entries: RawEntry[] = [];

    for (const inv of activeInvoices) {
      const iDate = inv.invoice_date || inv.date || '';
      const iNum = inv.invoice_number || inv.number || '';
      entries.push({
        id: inv.id,
        date: iDate,
        type: 'INVOICE',
        refNumber: iNum,
        debitPaise: inv.grand_total_paise,
        creditPaise: 0,
        description: `Tax Invoice ${iNum}`,
      });
    }

    for (const p of payments) {
      const isRev = p.is_reversal === 1;
      entries.push({
        id: p.id,
        date: p.paid_at,
        type: isRev ? 'REVERSAL' : 'PAYMENT',
        refNumber: p.reference || 'RECEIPT',
        debitPaise: isRev ? Math.abs(p.amount_paise) : 0,
        creditPaise: isRev ? 0 : p.amount_paise,
        description: isRev
          ? `Payment Reversal (${p.mode.toUpperCase()})`
          : `Payment Received (${p.mode.toUpperCase()})`,
      });
    }

    // Sort chronologically
    entries.sort((a, b) => a.date.localeCompare(b.date));

    let runningBalancePaise = 0;
    const ledger: CustomerLedgerEntry[] = [];

    for (const e of entries) {
      runningBalancePaise = runningBalancePaise + e.debitPaise - e.creditPaise;
      ledger.push({
        ...e,
        runningBalancePaise,
      });
    }

    return ledger;
  }

  async getCustomerDues(customerId: string): Promise<CustomerDueInfo> {
    const all = await this.getDues();
    const found = all.find((d) => d.customer.id === customerId);
    if (found) return found;
    const cust = await this.getById(customerId);
    return {
      customer: cust || ({ id: customerId, name: 'Unknown' } as any),
      totalInvoicedPaise: 0,
      totalPaidPaise: 0,
      totalDuePaise: 0,
    };
  }

  async getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    return this.getLedger(customerId);
  }
}

export class ArtisanRepo implements IArtisanRepo {
  constructor(private db: IDatabaseClient) {}

  async getAll(): Promise<Artisan[]> {
    return this.db.query<Artisan>('SELECT * FROM artisans WHERE deleted_at IS NULL ORDER BY name ASC');
  }

  async getById(id: string): Promise<Artisan | null> {
    return this.db.queryOne<Artisan>('SELECT * FROM artisans WHERE id = ? AND deleted_at IS NULL', [id]);
  }

  async save(artisan: Artisan): Promise<Artisan> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<Artisan>('SELECT id FROM artisans WHERE id = ?', [artisan.id]);
      const now = new Date().toISOString();
      if (existing) {
        await tx.execute(
          'UPDATE artisans SET name = ?, village = ?, craft = ?, mobile = ?, upi_or_bank_text = ?, photo_blob_key = ?, notes = ?, updated_at = ? WHERE id = ?',
          [artisan.name, artisan.village ?? null, artisan.craft ?? null, artisan.mobile ?? null, artisan.upi_or_bank_text ?? null, artisan.photo_blob_key ?? null, artisan.notes ?? null, now, artisan.id]
        );
        await recordChange(tx, artisan.device_id, 'artisans', artisan.id, 'UPDATE', artisan);
      } else {
        await tx.execute(
          'INSERT INTO artisans (id, name, village, craft, mobile, upi_or_bank_text, photo_blob_key, notes, device_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [artisan.id, artisan.name, artisan.village ?? null, artisan.craft ?? null, artisan.mobile ?? null, artisan.upi_or_bank_text ?? null, artisan.photo_blob_key ?? null, artisan.notes ?? null, artisan.device_id, artisan.user_id, artisan.created_at, artisan.updated_at ?? now]
        );
        await recordChange(tx, artisan.device_id, 'artisans', artisan.id, 'INSERT', artisan);
      }
    });
    return artisan;
  }

  async softDelete(id: string): Promise<void> {
    const artisan = await this.getById(id);
    if (!artisan) return;
    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      await tx.execute('UPDATE artisans SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
      await recordChange(tx, artisan.device_id, 'artisans', id, 'DELETE', { id, deleted_at: now });
    });
  }
}

export class ProductRepo implements IProductRepo {
  constructor(private db: IDatabaseClient) {}

  async getAll(): Promise<Product[]> {
    return await this.db.query<Product>('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name ASC');
  }

  async getById(id: string): Promise<Product | null> {
    return await this.db.queryOne<Product>('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [id]);
  }

  async search(query: string): Promise<Product[]> {
    const q = query.trim().toLowerCase();
    if (!q) return await this.getAll();
    const all = await this.getAll();
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        p.hsn.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }

  /**
   * Save a product and, for a new product, optionally create its opening stock
   * batch and ledger movement in the same transaction. This prevents a product
   * being left behind if its initial stock write fails.
   */
  async save(
    product: Product,
    openingStock?: { quantity: number; unitCostPaise: number; location?: StockLocation },
  ): Promise<Product> {
    if (openingStock) {
      if (!Number.isSafeInteger(openingStock.quantity) || openingStock.quantity <= 0) {
        throw new Error('Opening stock quantity must be a positive whole number.');
      }
      if (!Number.isSafeInteger(openingStock.unitCostPaise) || openingStock.unitCostPaise < 0) {
        throw new Error('Opening stock unit cost must be a non-negative integer number of paise.');
      }
    }

    await this.db.transaction(async (tx) => {
      const existing = await tx.queryOne<Product>('SELECT id FROM products WHERE id = ?', [product.id]);
      if (existing && openingStock) {
        throw new Error('Opening stock can only be added while creating a new product. Use a stock adjustment for existing products.');
      }
      if (existing) {
        await tx.execute(
          `UPDATE products SET 
            name = ?, sku = ?, hsn = ?, gst_rate_bp = ?, unit = ?,
            selling_price_paise = ?, mrp_paise = ?, price_includes_tax = ?,
            category = ?, active = ?, min_stock_alert = ?, product_kind = ?, parent_product_id = ?,
            variant_attributes_json = ?, artisan_id = ?, unique_piece_code = ?, updated_at = ?
           WHERE id = ?`,
          [
            product.name,
            product.sku ?? null,
            product.hsn,
            product.gst_rate_bp,
            product.unit,
            product.selling_price_paise,
            product.mrp_paise,
            product.price_includes_tax,
            product.category,
            product.active,
            product.min_stock_alert,
            product.product_kind ?? 'standard',
            product.parent_product_id ?? null,
            product.variant_attributes_json ?? null,
            product.artisan_id ?? null,
            product.unique_piece_code ?? null,
            new Date().toISOString(),
            product.id,
          ]
        );
        await recordChange(tx, product.device_id, 'products', product.id, 'UPDATE', product);
      } else {
        await tx.execute(
          `INSERT INTO products (
            id, name, sku, hsn, gst_rate_bp, unit,
            selling_price_paise, mrp_paise, price_includes_tax,
            category, active, min_stock_alert, product_kind, parent_product_id, variant_attributes_json,
            artisan_id, unique_piece_code, device_id, user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.id,
            product.name,
            product.sku ?? null,
            product.hsn,
            product.gst_rate_bp,
            product.unit,
            product.selling_price_paise,
            product.mrp_paise,
            product.price_includes_tax,
            product.category,
            product.active,
            product.min_stock_alert,
            product.product_kind ?? 'standard',
            product.parent_product_id ?? null,
            product.variant_attributes_json ?? null,
            product.artisan_id ?? null,
            product.unique_piece_code ?? null,
            product.device_id,
            product.user_id,
            product.created_at,
            product.updated_at,
          ]
        );
        await recordChange(tx, product.device_id, 'products', product.id, 'INSERT', product);

        if (openingStock) {
          const now = new Date().toISOString();
          const batchId = generateUUIDv7();
          const location = openingStock.location ?? 'Own';
          const batch: StockBatch = {
            id: batchId,
            product_id: product.id,
            location,
            supplier_id: null,
            purchase_id: null,
            cost_paise: openingStock.unitCostPaise,
            purchase_date: now.slice(0, 10),
            quantity_in: openingStock.quantity,
            attributes_json: JSON.stringify({ isOpening: true }),
            created_at: now,
            updated_at: now,
            deleted_at: null,
            device_id: product.device_id,
            user_id: product.user_id,
          };
          await tx.execute(
            `INSERT INTO stock_batches (
              id, product_id, location, supplier_id, purchase_id, cost_paise,
              purchase_date, quantity_in, attributes_json, created_at, updated_at,
              deleted_at, device_id, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [batch.id, batch.product_id, batch.location, batch.supplier_id, batch.purchase_id,
              batch.cost_paise, batch.purchase_date, batch.quantity_in, batch.attributes_json,
              batch.created_at, batch.updated_at, batch.deleted_at, batch.device_id, batch.user_id]
          );
          await recordChange(tx, product.device_id, 'stock_batches', batch.id, 'INSERT', batch);

          const movement: StockMovement = {
            id: generateUUIDv7(),
            product_id: product.id,
            batch_id: batch.id,
            location,
            qty_delta: openingStock.quantity,
            cost_paise: openingStock.unitCostPaise,
            reason: 'opening',
            ref_table: 'manual',
            ref_id: product.id,
            created_at: now,
            deleted_at: null,
            device_id: product.device_id,
            user_id: product.user_id,
          };
          await tx.execute(
            `INSERT INTO stock_movements (
              id, product_id, batch_id, location, qty_delta, cost_paise, reason,
              ref_table, ref_id, created_at, deleted_at, device_id, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [movement.id, movement.product_id, movement.batch_id, movement.location,
              movement.qty_delta, movement.cost_paise, movement.reason, movement.ref_table,
              movement.ref_id, movement.created_at, movement.deleted_at, movement.device_id, movement.user_id]
          );
          await recordChange(tx, product.device_id, 'stock_movements', movement.id, 'INSERT', movement);
        }
      }
    });
    return product;
  }

  async softDelete(id: string): Promise<void> {
    const prod = await this.getById(id);
    if (!prod) return;
    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      await tx.execute('UPDATE products SET deleted_at = ? WHERE id = ?', [now, id]);
      await recordChange(tx, prod.device_id, 'products', id, 'DELETE', { id, deleted_at: now });
    });
  }

  async getStockInfo(productId?: string): Promise<ProductStockInfo[]> {
    const products = productId
      ? (await this.getById(productId) ? [await this.getById(productId) as Product] : [])
      : await this.getAll();

    const movements = await this.db.query<StockMovement>('SELECT * FROM stock_movements');
    const batches = await this.db.query<StockBatch>('SELECT * FROM stock_batches WHERE deleted_at IS NULL');

    // Group movements by product and location
    const prodMovements = new Map<string, StockMovement[]>();
    for (const m of movements) {
      if (!prodMovements.has(m.product_id)) prodMovements.set(m.product_id, []);
      prodMovements.get(m.product_id)!.push(m);
    }

    // Group batches by product
    const prodBatches = new Map<string, StockBatch[]>();
    for (const b of batches) {
      if (!prodBatches.has(b.product_id)) prodBatches.set(b.product_id, []);
      prodBatches.get(b.product_id)!.push(b);
    }

    const infos: ProductStockInfo[] = [];

    for (const prod of products) {
      const mList = prodMovements.get(prod.id) || [];
      const bList = prodBatches.get(prod.id) || [];

      const locations: Record<StockLocation, number> = {
        Own: 0,
        Damaged: 0,
        Returns: 0,
        'Amazon FBA': 0,
      };

      let quantityOnHand = 0;
      for (const m of mList) {
        locations[m.location] = (locations[m.location] || 0) + m.qty_delta;
        quantityOnHand += m.qty_delta;
      }

      // Calculate valuation from active remaining batches
      let totalCostPaise = 0;
      if (quantityOnHand > 0 && bList.length > 0) {
        // Compute consumption per batch
        const batchConsumed = new Map<string, number>();
        for (const m of mList) {
          if (m.batch_id && m.qty_delta < 0) {
            const c = batchConsumed.get(m.batch_id) || 0;
            batchConsumed.set(m.batch_id, c + Math.abs(m.qty_delta));
          }
        }

        for (const b of bList) {
          const consumed = batchConsumed.get(b.id) || 0;
          const remaining = Math.max(0, b.quantity_in - consumed);
          totalCostPaise += remaining * b.cost_paise;
        }
      }

      const avgCostPaise = quantityOnHand > 0 ? Math.floor(totalCostPaise / quantityOnHand) : 0;

      infos.push({
        product: prod,
        quantityOnHand,
        totalCostPaise,
        avgCostPaise,
        locations,
      });
    }

    return infos;
  }
}

export class StockCheckpointRepo {
  constructor(private db: IDatabaseClient) {}

  async create(deviceId: string, userId: string): Promise<StockCheckpointRecord> {
    const movements = await this.db.query<StockMovement>('SELECT * FROM stock_movements ORDER BY created_at ASC');
    const batches = await this.db.query<StockBatch>('SELECT * FROM stock_batches WHERE deleted_at IS NULL');
    const built = await buildStockCheckpoint(movements, batches);
    const now = new Date().toISOString();
    const checkpoint: StockCheckpointRecord = {
      id: generateUUIDv7(),
      checkpoint_at: now,
      through_movement_id: built.payload.through_movement_id,
      through_created_at: built.payload.through_created_at,
      snapshot_json: built.snapshot_json,
      checksum: built.checksum,
      row_count: built.row_count,
      device_id: deviceId,
      user_id: userId,
      created_at: now,
      updated_at: now,
    };
    await this.db.transaction(async (tx) => {
      await tx.execute(
        'INSERT INTO stock_checkpoints (id, checkpoint_at, through_movement_id, through_created_at, snapshot_json, checksum, row_count, device_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [checkpoint.id, checkpoint.checkpoint_at, checkpoint.through_movement_id ?? null, checkpoint.through_created_at, checkpoint.snapshot_json, checkpoint.checksum, checkpoint.row_count, checkpoint.device_id, checkpoint.user_id, checkpoint.created_at]
      );
      await recordChange(tx, deviceId, 'stock_checkpoints', checkpoint.id, 'INSERT', checkpoint);
    });
    return checkpoint;
  }

  async getLatestVerified(): Promise<StockCheckpointRecord | null> {
    const checkpoint = await this.db.queryOne<StockCheckpointRecord>(
      'SELECT * FROM stock_checkpoints ORDER BY checkpoint_at DESC LIMIT 1'
    );
    if (!checkpoint) return null;
    return await verifyStockCheckpoint(checkpoint.snapshot_json, checkpoint.checksum) ? checkpoint : null;
  }
}

export class StockRepo implements IStockRepo {
  constructor(private db: IDatabaseClient) {}

  async getBatchesForProduct(productId: string, location?: StockLocation): Promise<StockBatch[]> {
    let sql = 'SELECT * FROM stock_batches WHERE product_id = ? AND deleted_at IS NULL';
    const params: unknown[] = [productId];
    if (location) {
      sql += ' AND location = ?';
      params.push(location);
    }
    sql += ' ORDER BY purchase_date ASC, created_at ASC';
    return await this.db.query<StockBatch>(sql, params);
  }

  async getMovementsForProduct(productId: string): Promise<StockMovement[]> {
    return await this.db.query<StockMovement>(
      'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at ASC',
      [productId]
    );
  }

  async addBatch(batch: StockBatch): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO stock_batches (
          id, product_id, location, supplier_id, purchase_id,
          cost_paise, purchase_date, quantity_in, attributes_json,
          device_id, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batch.id,
          batch.product_id,
          batch.location,
          batch.supplier_id ?? null,
          batch.purchase_id ?? null,
          batch.cost_paise,
          batch.purchase_date,
          batch.quantity_in,
          batch.attributes_json ?? null,
          batch.device_id,
          batch.user_id,
          batch.created_at,
          batch.updated_at,
        ]
      );
      await recordChange(tx, batch.device_id, 'stock_batches', batch.id, 'INSERT', batch);
    });
  }

  async addMovement(movement: StockMovement): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO stock_movements (
          id, product_id, batch_id, location, qty_delta,
          cost_paise, reason, ref_table, ref_id, device_id,
          user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movement.id,
          movement.product_id,
          movement.batch_id ?? null,
          movement.location,
          movement.qty_delta,
          movement.cost_paise,
          movement.reason,
          movement.ref_table ?? null,
          movement.ref_id ?? null,
          movement.device_id,
          movement.user_id,
          movement.created_at,
        ]
      );
      await recordChange(tx, movement.device_id, 'stock_movements', movement.id, 'INSERT', movement);
    });
  }

  async getQuantityOnHand(productId: string, location?: StockLocation): Promise<number> {
    let sql = 'SELECT SUM(qty_delta) AS sum FROM stock_movements WHERE product_id = ?';
    const params: unknown[] = [productId];
    if (location) {
      sql += ' AND location = ?';
      params.push(location);
    }
    const res = await this.db.queryOne<{ sum: number }>(sql, params);
    return res ? Number(res.sum || 0) : 0;
  }

  async getProductStock(productId: string): Promise<{ currentStock: number; totalCostPaise: number }> {
    const currentStock = await this.getQuantityOnHand(productId);
    return { currentStock, totalCostPaise: 0 };
  }

  async getBatchesWithRemainingQty(
    productId: string,
    location?: StockLocation
  ): Promise<Array<StockBatch & { remainingQty: number }>> {
    const batches = await this.getBatchesForProduct(productId, location);
    const movements = await this.getMovementsForProduct(productId);

    // Sum negative deltas (consumed stock) per batch
    const consumedMap = new Map<string, number>();
    for (const m of movements) {
      if (m.batch_id && m.qty_delta < 0) {
        const cur = consumedMap.get(m.batch_id) || 0;
        consumedMap.set(m.batch_id, cur + Math.abs(m.qty_delta));
      }
    }

    const results: Array<StockBatch & { remainingQty: number }> = [];
    for (const b of batches) {
      const consumed = consumedMap.get(b.id) || 0;
      const remainingQty = Math.max(0, b.quantity_in - consumed);
      if (remainingQty > 0) {
        results.push({
          ...b,
          remainingQty,
        });
      }
    }

    // Sorted FIFO: purchase_date ASC, created_at ASC
    return results.sort((a, b) => {
      const dCmp = a.purchase_date.localeCompare(b.purchase_date);
      if (dCmp !== 0) return dCmp;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  async getAllProductsStockInfo(): Promise<ProductStockInfo[]> {
    const products = await this.db.query<Product>('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name ASC');
    const movements = await this.db.query<StockMovement>('SELECT product_id, location, qty_delta, cost_paise FROM stock_movements');

    const qtyMap = new Map<string, { total: number; locations: Record<string, number>; totalCost: number }>();
    for (const m of movements) {
      let cur = qtyMap.get(m.product_id);
      if (!cur) {
        cur = { total: 0, locations: {}, totalCost: 0 };
        qtyMap.set(m.product_id, cur);
      }
      cur.total += m.qty_delta;
      cur.locations[m.location] = (cur.locations[m.location] || 0) + m.qty_delta;
      if (m.qty_delta > 0 && m.cost_paise) {
        cur.totalCost += m.qty_delta * m.cost_paise;
      }
    }

    return products.map((p) => {
      const info = qtyMap.get(p.id) || { total: 0, locations: {}, totalCost: 0 };
      const avgCost = info.total > 0 ? Math.floor(info.totalCost / info.total) : 0;
      return {
        product: p,
        quantityOnHand: info.total,
        totalCostPaise: info.totalCost,
        avgCostPaise: avgCost,
        locations: info.locations,
      };
    });
  }

  async getMovementsByProduct(productId: string): Promise<StockMovement[]> {
    return this.getMovementsForProduct(productId);
  }
}

export class PurchaseRepo implements IPurchaseRepo {
  constructor(private db: IDatabaseClient) {}

  async createPurchase(purchase: Purchase, items: PurchaseItem[]): Promise<void> {
    if (!purchase.id) {
      purchase.id = generateUUIDv7();
    }
    for (const it of items) {
      if (!it.id) it.id = generateUUIDv7();
      it.purchase_id = purchase.id;
    }
    return this.save(purchase, items);
  }

  async getAll(): Promise<Purchase[]> {
    const purchases = await this.db.query<Purchase>(
      'SELECT * FROM purchases WHERE deleted_at IS NULL ORDER BY purchase_date DESC'
    );
    const items = await this.db.query<PurchaseItem>('SELECT * FROM purchase_items WHERE deleted_at IS NULL');

    const itemsMap = new Map<string, PurchaseItem[]>();
    for (const it of items) {
      if (!itemsMap.has(it.purchase_id)) itemsMap.set(it.purchase_id, []);
      itemsMap.get(it.purchase_id)!.push(it);
    }

    return purchases.map((p) => ({
      ...p,
      items: itemsMap.get(p.id) || [],
    }));
  }

  async getById(id: string): Promise<Purchase | null> {
    const p = await this.db.queryOne<Purchase>('SELECT * FROM purchases WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!p) return null;
    const items = await this.db.query<PurchaseItem>(
      'SELECT * FROM purchase_items WHERE purchase_id = ? AND deleted_at IS NULL',
      [id]
    );
    return { ...p, items };
  }

  async save(purchase: Purchase, items: PurchaseItem[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO purchases (
          id, supplier_id, supplier_invoice_no, purchase_date,
          status, subtotal_paise, tax_paise, total_paise,
          notes, device_id, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchase.id,
          purchase.supplier_id,
          purchase.supplier_invoice_no ?? null,
          purchase.purchase_date,
          purchase.status,
          purchase.subtotal_paise,
          purchase.tax_paise,
          purchase.total_paise,
          purchase.notes ?? null,
          purchase.device_id,
          purchase.user_id,
          purchase.created_at,
          purchase.updated_at,
        ]
      );
      await recordChange(tx, purchase.device_id, 'purchases', purchase.id, 'INSERT', purchase);

      for (const item of items) {
        await tx.execute(
          `INSERT INTO purchase_items (
            id, purchase_id, product_id, quantity, unit_cost_paise,
            gst_rate_bp, tax_paise, total_paise, batch_attributes_json,
            device_id, user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.purchase_id,
            item.product_id,
            item.quantity,
            item.unit_cost_paise,
            item.gst_rate_bp,
            item.tax_paise,
            item.total_paise,
            item.batch_attributes_json ?? null,
            item.device_id,
            item.user_id,
            item.created_at,
            item.updated_at,
          ]
        );
        await recordChange(tx, item.device_id, 'purchase_items', item.id, 'INSERT', item);

        // If status is posted, immediately create stock batch & movement
        if (purchase.status === 'posted') {
          const batchId = generateUUIDv7();
          const batch: StockBatch = {
            id: batchId,
            product_id: item.product_id,
            location: 'Own',
            supplier_id: purchase.supplier_id,
            purchase_id: purchase.id,
            cost_paise: item.unit_cost_paise ?? item.cost_paise ?? 0,
            purchase_date: purchase.purchase_date,
            quantity_in: item.quantity,
            attributes_json: item.batch_attributes_json ?? null,
            device_id: purchase.device_id,
            user_id: purchase.user_id,
            created_at: purchase.created_at,
            updated_at: purchase.updated_at,
          };
          await tx.execute(
            `INSERT INTO stock_batches (
              id, product_id, location, supplier_id, purchase_id,
              cost_paise, purchase_date, quantity_in, attributes_json,
              device_id, user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              batch.id,
              batch.product_id,
              batch.location,
              batch.supplier_id,
              batch.purchase_id,
              batch.cost_paise,
              batch.purchase_date,
              batch.quantity_in,
              batch.attributes_json,
              batch.device_id,
              batch.user_id,
              batch.created_at,
              batch.updated_at,
            ]
          );
          await recordChange(tx, batch.device_id, 'stock_batches', batch.id, 'INSERT', batch);

          const movementId = generateUUIDv7();
          const movement: StockMovement = {
            id: movementId,
            product_id: item.product_id,
            batch_id: batchId,
            location: 'Own',
            qty_delta: item.quantity,
            cost_paise: item.unit_cost_paise,
            reason: 'purchase',
            ref_table: 'purchases',
            ref_id: purchase.id,
            device_id: purchase.device_id,
            user_id: purchase.user_id,
            created_at: purchase.created_at,
          };
          await tx.execute(
            `INSERT INTO stock_movements (
              id, product_id, batch_id, location, qty_delta,
              cost_paise, reason, ref_table, ref_id,
              device_id, user_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              movement.id,
              movement.product_id,
              movement.batch_id,
              movement.location,
              movement.qty_delta,
              movement.cost_paise,
              movement.reason,
              movement.ref_table,
              movement.ref_id,
              movement.device_id,
              movement.user_id,
              movement.created_at,
            ]
          );
          await recordChange(tx, movement.device_id, 'stock_movements', movement.id, 'INSERT', movement);
        }
      }
    });
  }

  async postPurchase(purchaseId: string): Promise<void> {
    const purchase = await this.getById(purchaseId);
    if (!purchase || purchase.status === 'posted') return;

    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      await tx.execute('UPDATE purchases SET status = ?, updated_at = ? WHERE id = ?', [
        'posted',
        now,
        purchaseId,
      ]);
      await recordChange(tx, purchase.device_id, 'purchases', purchaseId, 'UPDATE', {
        id: purchaseId,
        status: 'posted',
      });

      for (const item of purchase.items || []) {
        const batchId = generateUUIDv7();
        const batch: StockBatch = {
          id: batchId,
          product_id: item.product_id,
          location: 'Own',
          supplier_id: purchase.supplier_id,
          purchase_id: purchase.id,
          cost_paise: item.unit_cost_paise ?? item.cost_paise ?? 0,
          purchase_date: purchase.purchase_date,
          quantity_in: item.quantity,
          attributes_json: item.batch_attributes_json ?? null,
          device_id: purchase.device_id,
          user_id: purchase.user_id,
          created_at: now,
          updated_at: now,
        };
        await tx.execute(
          `INSERT INTO stock_batches (
            id, product_id, location, supplier_id, purchase_id,
            cost_paise, purchase_date, quantity_in, attributes_json,
            device_id, user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            batch.id,
            batch.product_id,
            batch.location,
            batch.supplier_id,
            batch.purchase_id,
            batch.cost_paise,
            batch.purchase_date,
            batch.quantity_in,
            batch.attributes_json,
            batch.device_id,
            batch.user_id,
            batch.created_at,
            batch.updated_at,
          ]
        );
        await recordChange(tx, batch.device_id, 'stock_batches', batch.id, 'INSERT', batch);

        const movementId = generateUUIDv7();
        const movement: StockMovement = {
          id: movementId,
          product_id: item.product_id,
          batch_id: batchId,
          location: 'Own',
          qty_delta: item.quantity,
          cost_paise: item.unit_cost_paise,
          reason: 'purchase',
          ref_table: 'purchases',
          ref_id: purchase.id,
          device_id: purchase.device_id,
          user_id: purchase.user_id,
          created_at: now,
        };
        await tx.execute(
          `INSERT INTO stock_movements (
            id, product_id, batch_id, location, qty_delta,
            cost_paise, reason, ref_table, ref_id,
            device_id, user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movement.id,
            movement.product_id,
            movement.batch_id,
            movement.location,
            movement.qty_delta,
            movement.cost_paise,
            movement.reason,
            movement.ref_table,
            movement.ref_id,
            movement.device_id,
            movement.user_id,
            movement.created_at,
          ]
        );
        await recordChange(tx, movement.device_id, 'stock_movements', movement.id, 'INSERT', movement);
      }
    });
  }
}

export class InvoiceRepo implements IInvoiceRepo {
  constructor(private db: IDatabaseClient) {}

  async getAll(): Promise<Invoice[]> {
    const invoices = await this.db.query<Invoice>(
      'SELECT * FROM invoices WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    const items = await this.db.query<InvoiceItem>('SELECT * FROM invoice_items WHERE deleted_at IS NULL');

    const itemsMap = new Map<string, InvoiceItem[]>();
    for (const it of items) {
      if (!itemsMap.has(it.invoice_id)) itemsMap.set(it.invoice_id, []);
      itemsMap.get(it.invoice_id)!.push(it);
    }

    const reversalRows = await this.db.query<{ invoice_id: string }>('SELECT invoice_id FROM invoice_reversals');
    const reversed = new Set(reversalRows.map((row) => row.invoice_id));
    return invoices.map((inv) => ({
      ...inv,
      status: reversed.has(inv.id) ? 'cancelled' : inv.status,
      items: itemsMap.get(inv.id) || [],
    }));
  }

  async getById(id: string): Promise<Invoice | null> {
    const inv = await this.db.queryOne<Invoice>('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!inv) return null;
    const items = await this.db.query<InvoiceItem>(
      'SELECT * FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
      [id]
    );
    const reversal = await this.db.queryOne<{ id: string; reason: string }>(
      'SELECT id, reason FROM invoice_reversals WHERE invoice_id = ?', [id]
    );
    return { ...inv, status: reversal ? 'cancelled' : inv.status, cancellation_reason: reversal?.reason, items };
  }

  async getByDateRange(startDate: string, endDate: string): Promise<Invoice[]> {
    const all = await this.getAll();
    return all.filter((inv) => {
      const d = inv.invoice_date || inv.date || '';
      return d >= startDate && d <= endDate;
    });
  }

  async getNextSequence(financialYear: string, series: string): Promise<number> {
    // Find highest sequence_number for this FY and series across all invoices (even cancelled ones!)
    const row = await this.db.queryOne<{ max: number }>(
      'SELECT MAX(sequence_number) AS max FROM invoices WHERE financial_year = ? AND series = ?',
      [financialYear, series]
    );
    const currentMax = row ? Number(row.max || 0) : 0;
    return currentMax + 1;
  }

  async createFinalizedInvoice(invoice: Invoice, items: InvoiceItem[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // 1. Insert Invoice
      await tx.execute(
        `INSERT INTO invoices (
          id, invoice_number, series, sequence_number, financial_year,
          invoice_date, customer_id, customer_snapshot_json, mode,
          status, is_interstate, taxable_total_paise, cgst_total_paise,
          sgst_total_paise, igst_total_paise, tax_total_paise,
          round_off_paise, grand_total_paise, notes,
          device_id, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id,
          invoice.invoice_number,
          invoice.series,
          invoice.sequence_number,
          invoice.financial_year,
          invoice.invoice_date,
          invoice.customer_id,
          invoice.customer_snapshot_json,
          invoice.mode,
          'draft',
          invoice.is_interstate,
          invoice.taxable_total_paise,
          invoice.cgst_total_paise,
          invoice.sgst_total_paise,
          invoice.igst_total_paise,
          invoice.tax_total_paise,
          invoice.round_off_paise,
          invoice.grand_total_paise,
          invoice.notes ?? null,
          invoice.device_id,
          invoice.user_id,
          invoice.created_at,
          invoice.updated_at,
        ]
      );
      await recordChange(tx, invoice.device_id, 'invoices', invoice.id, 'INSERT', invoice);

      // 2. Insert Invoice Items and consumed Stock Movements
      for (const item of items) {
        await tx.execute(
          `INSERT INTO invoice_items (
            id, invoice_id, product_id, product_name, hsn,
            quantity, unit, unit_price_paise, gst_rate_bp,
            taxable_amount_paise, cgst_paise, sgst_paise, igst_paise,
            total_paise, cost_paise, batches_consumed_json,
            device_id, user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.invoice_id,
            item.product_id,
            item.product_name,
            item.hsn,
            item.quantity,
            item.unit,
            item.unit_price_paise,
            item.gst_rate_bp,
            item.taxable_amount_paise,
            item.cgst_paise,
            item.sgst_paise,
            item.igst_paise,
            item.total_paise,
            item.cost_paise,
            item.batches_consumed_json ?? null,
            item.device_id,
            item.user_id,
            item.created_at,
            item.updated_at,
          ]
        );
        await recordChange(tx, item.device_id, 'invoice_items', item.id, 'INSERT', item);

        // Parse consumed batches to record individual stock movements
        if (item.batches_consumed_json) {
          try {
            const allocations = JSON.parse(item.batches_consumed_json) as Array<{
              batchId: string;
              quantity: number;
              costPaise: number;
            }>;
            for (const alloc of allocations) {
              const moveId = generateUUIDv7();
              const m: StockMovement = {
                id: moveId,
                product_id: item.product_id,
                batch_id: alloc.batchId,
                location: 'Own',
                qty_delta: -alloc.quantity, // Negative for sale out
                cost_paise: alloc.costPaise,
                reason: 'sale',
                ref_table: 'invoices',
                ref_id: invoice.id,
                device_id: invoice.device_id,
                user_id: invoice.user_id,
                created_at: invoice.created_at,
              };
              await tx.execute(
                `INSERT INTO stock_movements (
                  id, product_id, batch_id, location, qty_delta,
                  cost_paise, reason, ref_table, ref_id,
                  device_id, user_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  m.id,
                  m.product_id,
                  m.batch_id,
                  m.location,
                  m.qty_delta,
                  m.cost_paise,
                  m.reason,
                  m.ref_table,
                  m.ref_id,
                  m.device_id,
                  m.user_id,
                  m.created_at,
                ]
              );
              await recordChange(tx, m.device_id, 'stock_movements', m.id, 'INSERT', m);
            }
          } catch {
            // Uncosted or negative movement fallback
          }
        }
      }
      // Finalize only after all invoice lines and stock movements are written.
      await tx.execute(
        'UPDATE invoices SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
        ['finalized', invoice.updated_at, invoice.id, 'draft']
      );
    });
  }

  async cancelInvoice(invoiceId: string, reason = 'Invoice cancelled by user'): Promise<void> {
    const inv = await this.getById(invoiceId);
    if (!inv || inv.status === 'cancelled') return;

    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const reversalId = generateUUIDv7();
      const reversalPayload = { invoice_id: invoiceId, reason, reversed_at: now, grand_total_paise: inv.grand_total_paise };
      await tx.execute(
        'INSERT INTO invoice_reversals (id, invoice_id, reason, reversed_at, reversal_payload_json, device_id, user_id, hlc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [reversalId, invoiceId, reason, now, JSON.stringify(reversalPayload), inv.device_id, inv.user_id, await nextPersistedHLC(tx, inv.device_id), now]
      );
      await recordChange(tx, inv.device_id, 'invoice_reversals', reversalId, 'INSERT', { id: reversalId, ...reversalPayload });

      // Reverse stock movements by creating new opposite movements (never deleting old ones)
      for (const item of inv.items || []) {
        if (item.batches_consumed_json) {
          try {
            const allocations = JSON.parse(item.batches_consumed_json) as Array<{
              batchId: string;
              quantity: number;
              costPaise: number;
            }>;
            for (const alloc of allocations) {
              const revMoveId = generateUUIDv7();
              const revMove: StockMovement = {
                id: revMoveId,
                product_id: item.product_id,
                batch_id: alloc.batchId,
                location: 'Own',
                qty_delta: alloc.quantity, // Positive reversal
                cost_paise: alloc.costPaise,
                reason: 'cancel_sale',
                ref_table: 'invoices',
                ref_id: invoiceId,
                device_id: inv.device_id,
                user_id: inv.user_id,
                created_at: now,
              };
              await tx.execute(
                `INSERT INTO stock_movements (
                  id, product_id, batch_id, location, qty_delta,
                  cost_paise, reason, ref_table, ref_id,
                  device_id, user_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  revMove.id,
                  revMove.product_id,
                  revMove.batch_id,
                  revMove.location,
                  revMove.qty_delta,
                  revMove.cost_paise,
                  revMove.reason,
                  revMove.ref_table,
                  revMove.ref_id,
                  revMove.device_id,
                  revMove.user_id,
                  revMove.created_at,
                ]
              );
              await recordChange(tx, revMove.device_id, 'stock_movements', revMove.id, 'INSERT', revMove);
            }
          } catch {
            // fallback
          }
        }
      }
    });
  }
}

export class PaymentRepo implements IPaymentRepo {
  constructor(private db: IDatabaseClient) {}

  async getAll(): Promise<Payment[]> {
    return await this.db.query<Payment>('SELECT * FROM payments ORDER BY paid_at DESC');
  }

  async getByCustomerId(customerId: string): Promise<Payment[]> {
    return await this.db.query<Payment>('SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC', [
      customerId,
    ]);
  }

  async getByInvoiceId(invoiceId: string): Promise<Payment[]> {
    return await this.db.query<Payment>('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC', [
      invoiceId,
    ]);
  }

  async addPayment(payment: Payment): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO payments (
          id, invoice_id, customer_id, amount_paise, mode,
          reference, notes, is_reversal, reversal_of_id,
          paid_at, device_id, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id,
          payment.invoice_id ?? null,
          payment.customer_id,
          payment.amount_paise,
          payment.mode,
          payment.reference ?? null,
          payment.notes ?? null,
          payment.is_reversal,
          payment.reversal_of_id ?? null,
          payment.paid_at,
          payment.device_id,
          payment.user_id,
          payment.created_at,
        ]
      );
      await recordChange(tx, payment.device_id, 'payments', payment.id, 'INSERT', payment);
    });
  }

  async reversePayment(paymentId: string, reason = 'Payment reversed'): Promise<void> {
    const original = await this.db.queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!original || original.is_reversal === 1) return;

    await this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const revPaymentId = generateUUIDv7();
      const reversal: Payment = {
        id: revPaymentId,
        invoice_id: original.invoice_id ?? null,
        customer_id: original.customer_id,
        amount_paise: -original.amount_paise,
        mode: original.mode,
        reference: `REV-${original.reference || original.id.substring(0, 8)}`,
        notes: reason,
        is_reversal: 1,
        reversal_of_id: original.id,
        paid_at: now,
        device_id: original.device_id,
        user_id: original.user_id,
        created_at: now,
      };

      await tx.execute(
        `INSERT INTO payments (
          id, invoice_id, customer_id, amount_paise, mode,
          reference, notes, is_reversal, reversal_of_id,
          paid_at, device_id, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reversal.id,
          reversal.invoice_id ?? null,
          reversal.customer_id,
          reversal.amount_paise,
          reversal.mode,
          reversal.reference,
          reversal.notes,
          reversal.is_reversal,
          reversal.reversal_of_id,
          reversal.paid_at,
          reversal.device_id,
          reversal.user_id,
          reversal.created_at,
        ]
      );
      await recordChange(tx, reversal.device_id, 'payments', reversal.id, 'INSERT', reversal);
    });
  }

  async getCustomerDues(customerId: string): Promise<CustomerDueInfo> {
    const customerRepo = new CustomerRepo(this.db);
    return customerRepo.getCustomerDues(customerId);
  }

  async getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    const customerRepo = new CustomerRepo(this.db);
    return customerRepo.getCustomerLedger(customerId);
  }
}

export class BackupLogRepo implements IBackupLogRepo {
  constructor(private db: IDatabaseClient) {}

  async log(entry: BackupLog): Promise<void> {
    await this.db.execute(
      'INSERT INTO backups_log (id, backup_type, checksum, file_name, size_bytes, record_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [entry.id, entry.backup_type, entry.checksum, entry.file_name ?? null, entry.size_bytes ?? null, entry.record_count, entry.created_at]
    );
  }

  async getLatest(): Promise<BackupLog | null> {
    return await this.db.queryOne<BackupLog>('SELECT * FROM backups_log ORDER BY created_at DESC LIMIT 1');
  }
}
