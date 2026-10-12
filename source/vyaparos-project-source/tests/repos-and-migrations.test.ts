import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabaseClientForTesting } from '../src/data/sqliteClient';
import { runMigrations, DowngradeNotAllowedError, splitMigrationStatements } from '../src/data/migrations';
import { AppService } from '../src/domain/services';
import { generateUUIDv7 } from '../src/domain/uuid';
import { Customer, Product } from '../src/domain/types';

describe('Data Layer Repositories, Changes Log & Migrations (T1, D2, D5, D6)', () => {
  let appService: AppService;
  let db = resetDatabaseClientForTesting();

  beforeEach(async () => {
    db = resetDatabaseClientForTesting();
    appService = new AppService(db);
    await appService.init();
  });

  it('splits SQL migrations without breaking trigger bodies', () => {
    const statements = splitMigrationStatements(`CREATE TABLE IF NOT EXISTS example (id TEXT PRIMARY KEY);
CREATE TRIGGER example_guard BEFORE UPDATE ON example BEGIN SELECT RAISE(ABORT, 'no update'); END;
CREATE INDEX example_id ON example(id);`);
    expect(statements).toHaveLength(3);
    expect(statements[1]).toContain('BEGIN SELECT RAISE');
    expect(statements[1]).toContain('END;');
  });

  it('runs migration up and records schema version 2', async () => {
    const v = await db.queryOne<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    expect(Number(v?.version)).toBe(2);
  });

  it('refuses database downgrade and throws DowngradeNotAllowedError', async () => {
    await expect(runMigrations(db, 0)).rejects.toThrowError(DowngradeNotAllowedError);
  });

  it('does not export or back up a database when the schema version is already current', async () => {
    const res = await runMigrations(db, 2);
    expect(res).toEqual({ previousVersion: 2, newVersion: 2 });
  });

  it('appends an audit row to the changes table on EVERY write operation', async () => {
    const customer: Customer = {
      id: generateUUIDv7(),
      name: 'Rohan Patil',
      type: 'customer',
      party_kind: 'B2C',
      state_code: '27',
      device_id: 'test-device',
      user_id: 'test-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const changesBefore = await appService.changes.getAll();
    await appService.customers.save(customer);
    const changesAfter = await appService.changes.getAll();

    expect(changesAfter.length).toBeGreaterThan(changesBefore.length);
    const latestChange = changesAfter[0];
    expect(latestChange.table_name).toBe('customers');
    expect(latestChange.row_id).toBe(customer.id);
    expect(latestChange.op.toLowerCase()).toBe('insert');
    expect(latestChange.hlc).toMatch(/^\d+:\d+:test-device$/);
    expect(latestChange.origin_device_id).toBe('test-device');
    const clock = await db.queryOne<{ last_hlc: string }>(
      'SELECT last_hlc FROM device_clock WHERE device_id = ?', ['test-device']
    );
    expect(clock?.last_hlc).toBe(latestChange.hlc);
  });

  it('persists full party contact and address details', async () => {
    const customer: Customer = {
      id: generateUUIDv7(), name: 'Ajrakhika Wholesale Buyer', type: 'customer', party_kind: 'B2B',
      mobile: '9876543210', email: 'accounts@example.in', gstin: '24AAABC1234A1Z5',
      address_line1: 'Workshop Road', address_line2: 'Near Main Market', city: 'Anjar',
      pincode: '370110', state_code: '24', notes: 'Call before dispatch',
      device_id: 'test-device', user_id: 'test-user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    await appService.customers.save(customer);
    const stored = await appService.customers.getById(customer.id);
    expect(stored?.email).toBe('accounts@example.in');
    expect(stored?.address_line2).toBe('Near Main Market');
    expect(stored?.pincode).toBe('370110');
    expect(stored?.notes).toBe('Call before dispatch');
  });

  it('supports soft delete without removing data from disk', async () => {
    const customerId = generateUUIDv7();
    const customer: Customer = {
      id: customerId,
      name: 'Akash Deshmukh',
      type: 'customer',
      party_kind: 'B2C',
      state_code: '27',
      device_id: 'test-device',
      user_id: 'test-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await appService.customers.save(customer);
    expect(await appService.customers.getById(customerId)).not.toBeNull();

    await appService.customers.softDelete(customerId);
    expect(await appService.customers.getById(customerId)).toBeNull();

    // Row still exists in raw DB with deleted_at populated
    const rawRow = await db.queryOne<{ id: string; deleted_at: string }>(
      'SELECT id, deleted_at FROM customers WHERE id = ?',
      [customerId]
    );
    expect(rawRow).not.toBeNull();
    expect(rawRow?.deleted_at).toBeDefined();
  });

  it('cancels a finalized invoice through an immutable reversal record', async () => {
    const now = new Date().toISOString();
    const customer: Customer = {
      id: generateUUIDv7(), name: 'Invoice Test Customer', type: 'customer', party_kind: 'B2C', state_code: '24',
      device_id: 'test-device', user_id: 'test-user', created_at: now, updated_at: now,
    };
    await appService.customers.save(customer);
    const invoice = {
      id: generateUUIDv7(), invoice_number: 'INV/2026-27/0001', series: 'INV', sequence_number: 1,
      financial_year: '2026-27', invoice_date: now, customer_id: customer.id, customer_snapshot_json: JSON.stringify({ name: customer.name }),
      mode: 'tax_invoice' as const, status: 'finalized' as const, is_interstate: 0,
      taxable_total_paise: 10000, cgst_total_paise: 900, sgst_total_paise: 900, igst_total_paise: 0,
      tax_total_paise: 1800, round_off_paise: 0, grand_total_paise: 11800,
      device_id: 'test-device', user_id: 'test-user', created_at: now, updated_at: now,
    };
    await appService.invoices.createFinalizedInvoice(invoice, []);
    await appService.invoices.cancelInvoice(invoice.id, 'Customer return');
    const raw = await db.queryOne<{ status: string; notes: string | null }>('SELECT status, notes FROM invoices WHERE id = ?', [invoice.id]);
    expect(raw?.status).toBe('finalized');
    expect(raw?.notes).toBeNull();
    expect((await appService.invoices.getById(invoice.id))?.status).toBe('cancelled');
    const reversal = await db.queryOne<{ reason: string }>('SELECT reason FROM invoice_reversals WHERE invoice_id = ?', [invoice.id]);
    expect(reversal?.reason).toBe('Customer return');
  });

  it('soft-deletes artisans while preserving the record and recording the change', async () => {
    const now = new Date().toISOString();
    const artisan = {
      id: generateUUIDv7(), name: 'Archive Test Artisan', village: 'Bhuj', craft: 'Embroidery',
      device_id: 'test-device', user_id: 'test-user', created_at: now, updated_at: now,
    };
    await appService.artisans.save(artisan);
    expect(await appService.artisans.getById(artisan.id)).not.toBeNull();

    await appService.artisans.softDelete(artisan.id);

    expect(await appService.artisans.getById(artisan.id)).toBeNull();
    const raw = await db.queryOne<{ id: string; deleted_at: string | null }>(
      'SELECT id, deleted_at FROM artisans WHERE id = ?', [artisan.id]
    );
    expect(raw?.id).toBe(artisan.id);
    expect(raw?.deleted_at).toBeTruthy();
    const deletion = (await appService.changes.getAll()).find((change) => change.table_name === 'artisans' && change.row_id === artisan.id && change.op.toLowerCase() === 'delete');
    expect(deletion).toBeDefined();
  });

  it('persists artisan attribution and unique-piece product identity', async () => {
    const now = new Date().toISOString();
    const artisan = {
      id: generateUUIDv7(), name: 'Kutch Artisan', village: 'Ajrakhpur', craft: 'Ajrakh block print',
      device_id: 'test-device', user_id: 'test-user', created_at: now, updated_at: now,
    };
    await appService.artisans.save(artisan);
    const product: Product = {
      id: generateUUIDv7(), name: 'One-of-one Ajrakh Dupatta', hsn: '6214', gst_rate_bp: 500,
      unit: 'PCS', selling_price_paise: 125000, mrp_paise: 125000, price_includes_tax: 1,
      category: 'Ajrakh block print', active: 1, min_stock_alert: 0,
      product_kind: 'unique_piece', artisan_id: artisan.id, unique_piece_code: 'AJR-UNQ-0001',
      variant_attributes_json: JSON.stringify({ colour: 'indigo', length: '2.5m' }),
      device_id: 'test-device', user_id: 'test-user', created_at: now, updated_at: now,
    };
    await appService.products.save(product);
    const stored = await appService.products.getById(product.id);
    expect(stored?.product_kind).toBe('unique_piece');
    expect(stored?.artisan_id).toBe(artisan.id);
    expect(stored?.unique_piece_code).toBe('AJR-UNQ-0001');
    expect((await appService.artisans.getById(artisan.id))?.craft).toBe('Ajrakh block print');
  });

  it('creates a product and its opening stock atomically with change records', async () => {
    const productId = generateUUIDv7();
    const now = new Date().toISOString();
    const product: Product = {
      id: productId,
      name: 'Ajrakh One-of-one Dupatta',
      hsn: '6214',
      gst_rate_bp: 500,
      unit: 'PCS',
      selling_price_paise: 125000,
      mrp_paise: 125000,
      price_includes_tax: 1,
      category: 'Ajrakh',
      active: 1,
      product_kind: 'unique_piece',
      unique_piece_code: 'AJR-OPEN-001',
      device_id: 'test-device',
      user_id: 'test-user',
      created_at: now,
      updated_at: now,
    };

    await appService.products.save(product, { quantity: 1, unitCostPaise: 60000 });

    expect(await appService.products.getById(productId)).toBeTruthy();
    expect(await appService.stock.getQuantityOnHand(productId)).toBe(1);
    const batches = await appService.stock.getBatchesForProduct(productId);
    expect(batches).toHaveLength(1);
    expect(batches[0].quantity_in).toBe(1);
    expect(batches[0].cost_paise).toBe(60000);

    const productChanges = (await appService.changes.getAll(1000)).filter((change) =>
      [productId, batches[0].id].includes(change.row_id),
    );
    expect(productChanges.some((change) => change.table_name === 'products' && change.op.toUpperCase() === 'INSERT')).toBe(true);
    expect(productChanges.some((change) => change.table_name === 'stock_batches' && change.op.toUpperCase() === 'INSERT')).toBe(true);
    const movements = await appService.stock.getMovementsForProduct(productId);
    expect(movements).toHaveLength(1);
    expect(movements[0].reason.toLowerCase()).toBe('opening');
  });

  it('rejects invalid opening stock before creating a product', async () => {
    const productId = generateUUIDv7();
    const now = new Date().toISOString();
    const product: Product = {
      id: productId, name: 'Invalid Quantity Test', hsn: '', gst_rate_bp: 0, unit: 'PCS',
      selling_price_paise: 100, mrp_paise: 100, price_includes_tax: 0, active: 1,
      device_id: 'test-device', user_id: 'test-user', created_at: now, updated_at: now,
    };
    await expect(appService.products.save(product, { quantity: 1.5, unitCostPaise: 100 })).rejects.toThrow(/whole number/);
    expect(await appService.products.getById(productId)).toBeNull();
  });

  it('derives stock quantity entirely from stock_movements ledger', async () => {
    const productId = generateUUIDv7();
    const product: Product = {
      id: productId,
      name: 'Castrol 20W40 1L',
      hsn: '2710',
      gst_rate_bp: 1800,
      unit: 'LTR',
      selling_price_paise: 38000,
      mrp_paise: 42000,
      price_includes_tax: 1,
      category: 'Lubricants & Oils',
      active: 1,
      min_stock_alert: 2,
      device_id: 'test-device',
      user_id: 'test-user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await appService.products.save(product);

    // Initial stock is 0
    expect(await appService.stock.getQuantityOnHand(productId)).toBe(0);

    // Add 10 units via opening stock
    await appService.addOpeningStock({
      productId,
      quantity: 10,
      unitCostPaise: 29000,
      location: 'Own',
    });
    expect(await appService.stock.getQuantityOnHand(productId)).toBe(10);

    // Movements list has 1 entry
    const movements = await appService.stock.getMovementsForProduct(productId);
    expect(movements).toHaveLength(1);
    expect(movements[0].qty_delta).toBe(10);
    expect(movements[0].reason).toBe('opening');
  });
});
