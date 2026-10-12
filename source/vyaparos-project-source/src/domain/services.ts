import { getDatabaseClient, IDatabaseClient } from '../data/sqliteClient';
import { runMigrations, type MigrationResult } from '../data/migrations';
import {
  SettingsRepo,
  UserRepo,
  ArtisanRepo,
  CustomerRepo,
  ProductRepo,
  StockRepo,
  StockCheckpointRepo,
  PurchaseRepo,
  InvoiceRepo,
  PaymentRepo,
  ChangeRepo,
  BackupLogRepo,
} from './repos/databaseRepos';
import {
  BusinessSettings,
  User,
  Customer,
  Product,
  Purchase,
  PurchaseItem,
  Invoice,
  InvoiceItem,
  Payment,
  StockLocation,
} from './types';
import { generateUUIDv7 } from './uuid';
import { getFinancialYearCode, formatInvoiceNumber } from './numbering';
import { allocateFifoStock, FifoAllocationResult } from './fifo';
import { calcLineTax, isInterstate } from './gst';
import { roundToRupee, addPaise } from './money';
import { encryptBackup, decryptBackup } from './crypto';
import { generateTallySalesXml, TallyLedgerMapping } from './tally';
import { TYRE_AUTO_STARTER_PACK } from './data/starterPack';

export class AppService {
  private db: IDatabaseClient;
  public settings: SettingsRepo;
  public user: UserRepo;
  public artisans: ArtisanRepo;
  public customers: CustomerRepo;
  public products: ProductRepo;
  public stock: StockRepo;
  public stockCheckpoints: StockCheckpointRepo;
  public purchases: PurchaseRepo;
  public invoices: InvoiceRepo;
  public payments: PaymentRepo;
  public changes: ChangeRepo;
  public backups: BackupLogRepo;

  private isInitialized = false;
  private persistentStorage = false;
  private migrationResult: MigrationResult | null = null;

  constructor(customDb?: IDatabaseClient) {
    this.db = customDb || getDatabaseClient();
    this.settings = new SettingsRepo(this.db);
    this.user = new UserRepo(this.db);
    this.artisans = new ArtisanRepo(this.db);
    this.customers = new CustomerRepo(this.db);
    this.products = new ProductRepo(this.db);
    this.stock = new StockRepo(this.db);
    this.stockCheckpoints = new StockCheckpointRepo(this.db);
    this.purchases = new PurchaseRepo(this.db);
    this.invoices = new InvoiceRepo(this.db);
    this.payments = new PaymentRepo(this.db);
    this.changes = new ChangeRepo(this.db);
    this.backups = new BackupLogRepo(this.db);
  }

  async init(): Promise<{ deviceId: string; isConfigured: boolean; persistentStorage: boolean; migration: { previousVersion: number; newVersion: number; safetyBackupCreated: boolean } }> {
    if (this.isInitialized) {
      const cfg = await this.settings.get();
      return {
        deviceId: cfg?.device_id || '',
        isConfigured: !!cfg,
        persistentStorage: this.persistentStorage,
        migration: { previousVersion: this.migrationResult?.previousVersion ?? 0, newVersion: this.migrationResult?.newVersion ?? 0, safetyBackupCreated: !!this.migrationResult?.safetyBackup },
      };
    }

    // Keep the migration result visible to callers for startup diagnostics and backup auditing.
    this.migrationResult = await runMigrations(this.db);

    // Call navigator.storage.persist() in browser if supported
    let persistentStorage = false;
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        persistentStorage = await navigator.storage.persist();
      } catch {
        // ignore
      }
    }

    const currentSettings = await this.settings.get();
    this.persistentStorage = persistentStorage;
    this.isInitialized = true;

    return {
      deviceId: currentSettings?.device_id || '',
      isConfigured: !!currentSettings,
      persistentStorage,
      migration: { previousVersion: this.migrationResult.previousVersion, newVersion: this.migrationResult.newVersion, safetyBackupCreated: !!this.migrationResult.safetyBackup },
    };
  }

  /**
   * Complete First-Run Business Setup
   */
  async setupBusiness(params: {
    businessName: string;
    tradeName?: string;
    gstin?: string;
    stateCode: string;
    addressLine1?: string;
    city?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    bankName?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
    upiId?: string;
    invoicePrefix?: string;
    loadStarterPack?: boolean;
  }): Promise<BusinessSettings> {
    const deviceId = generateUUIDv7();
    const ownerUserId = generateUUIDv7();
    const now = new Date().toISOString();

    const owner: User = {
      id: ownerUserId,
      name: 'Owner',
      role: 'owner',
      device_id: deviceId,
      user_id: ownerUserId,
      created_at: now,
      updated_at: now,
    };
    await this.user.save(owner);

    const settings: BusinessSettings = {
      id: generateUUIDv7(),
      business_name: params.businessName.trim(),
      trade_name: params.tradeName?.trim() || null,
      gstin: params.gstin?.trim() || '',
      state_code: params.stateCode,
      address_line1: params.addressLine1?.trim() || '',
      city: params.city?.trim() || '',
      pincode: params.pincode?.trim() || '',
      phone: params.phone?.trim() || null,
      email: params.email?.trim() || null,
      bank_name: params.bankName?.trim() || null,
      bank_account_no: params.bankAccountNo?.trim() || null,
      bank_ifsc: params.bankIfsc?.trim() || null,
      upi_id: params.upiId?.trim() || null,
      invoice_prefix: params.invoicePrefix?.trim().toUpperCase() || 'INV',
      financial_year_start: '04-01',
      is_onboarded: 1,
      stock_method: 'FIFO',
      allow_negative_stock: 0,
      financial_year_start_month: 4,
      device_id: deviceId,
      user_id: ownerUserId,
      created_at: now,
      updated_at: now,
    };
    await this.settings.save(settings);

    if (params.loadStarterPack) {
      await this.seedStarterPack(deviceId, ownerUserId);
    }

    return settings;
  }

  /**
   * Seed Tyre and Auto Spares starter catalog
   */
  async seedStarterPack(deviceId?: string, userId?: string): Promise<number> {
    const settings = await this.settings.get();
    const devId = deviceId || settings?.device_id || generateUUIDv7();
    const uId = userId || 'owner';
    const now = new Date().toISOString();

    let count = 0;
    for (const item of TYRE_AUTO_STARTER_PACK) {
      const prod: Product = {
        id: generateUUIDv7(),
        name: item.name,
        sku: item.sku,
        hsn: item.hsn,
        gst_rate_bp: item.gstRateBp,
        unit: item.unit,
        selling_price_paise: item.sellingPricePaise,
        mrp_paise: item.mrpPaise,
        price_includes_tax: item.priceIncludesTax ? 1 : 0,
        category: item.category,
        active: 1,
        min_stock_alert: 5,
        device_id: devId,
        user_id: uId,
        created_at: now,
        updated_at: now,
      };
      await this.products.save(prod);
      count++;
    }
    return count;
  }

  /**
   * Add opening stock for a product
   */
  async addOpeningStock(params: {
    productId: string;
    quantity: number;
    unitCostPaise: number;
    location?: StockLocation;
    date?: string;
  }): Promise<void> {
    const settings = await this.settings.get();
    const deviceId = settings?.device_id || generateUUIDv7();
    const now = new Date().toISOString();
    const loc = params.location || 'Own';
    const batchId = generateUUIDv7();

    const batch = {
      id: batchId,
      product_id: params.productId,
      location: loc,
      cost_paise: params.unitCostPaise,
      purchase_date: params.date || now.split('T')[0],
      quantity_in: params.quantity,
      device_id: deviceId,
      user_id: 'owner',
      created_at: now,
      updated_at: now,
    };
    await this.stock.addBatch(batch);

    const movement = {
      id: generateUUIDv7(),
      product_id: params.productId,
      batch_id: batchId,
      location: loc,
      qty_delta: params.quantity,
      cost_paise: params.unitCostPaise,
      reason: 'opening' as const,
      ref_table: 'manual',
      device_id: deviceId,
      user_id: 'owner',
      created_at: now,
    };
    await this.stock.addMovement(movement);
  }

  /**
   * Create Finalized Sales Invoice with FIFO Stock Allocation
   */
  async createFinalizedSale(params: {
    customer: Customer;
    items: Array<{
      productId: string;
      quantity: number;
      unitPricePaise: number;
      location?: StockLocation;
    }>;
    mode?: 'tax_invoice' | 'simple_bill';
    invoiceDate?: string;
    notes?: string;
  }): Promise<Invoice> {
    const settings = await this.settings.get();
    if (!settings) throw new Error('Business settings not initialized');

    const now = new Date().toISOString();
    const invDate = params.invoiceDate || now.split('T')[0];
    const fyCode = getFinancialYearCode(invDate, settings.financial_year_start_month);
    const series = settings.invoice_prefix;

    // Transactional sequence number allocation (gapless & resets per FY)
    const sequenceNumber = await this.invoices.getNextSequence(fyCode, series);
    const invoiceNumber = formatInvoiceNumber(series, fyCode, sequenceNumber);

    const sellerState = settings.state_code;
    const buyerState = params.customer.state_code || sellerState;
    const interstate = isInterstate(sellerState, buyerState);

    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    let taxTotal = 0;

    const invoiceId = generateUUIDv7();
    const invoiceItems: InvoiceItem[] = [];

    // Process each line item
    for (const line of params.items) {
      const product = await this.products.getById(line.productId);
      if (!product) throw new Error(`Product not found: ${line.productId}`);

      const location = line.location || 'Own';
      const availableBatches = await this.stock.getBatchesWithRemainingQty(product.id, location);

      // FIFO allocation
      const fifoResult: FifoAllocationResult = allocateFifoStock(
        availableBatches,
        product.name,
        line.quantity,
        settings.allow_negative_stock === 1
      );

      const lineTaxablePaise = line.quantity * line.unitPricePaise;
      const taxResult = calcLineTax(lineTaxablePaise, product.gst_rate_bp, interstate);

      taxableTotal = addPaise(taxableTotal, lineTaxablePaise);
      cgstTotal = addPaise(cgstTotal, taxResult.cgstPaise);
      sgstTotal = addPaise(sgstTotal, taxResult.sgstPaise);
      igstTotal = addPaise(igstTotal, taxResult.igstPaise);
      taxTotal = addPaise(taxTotal, taxResult.taxPaise);

      const invItem: InvoiceItem = {
        id: generateUUIDv7(),
        invoice_id: invoiceId,
        product_id: product.id,
        product_name: product.name,
        hsn: product.hsn,
        quantity: line.quantity,
        unit: product.unit,
        unit_price_paise: line.unitPricePaise,
        gst_rate_bp: product.gst_rate_bp,
        taxable_paise: lineTaxablePaise,
        taxable_amount_paise: lineTaxablePaise,
        cgst_paise: taxResult.cgstPaise,
        sgst_paise: taxResult.sgstPaise,
        igst_paise: taxResult.igstPaise,
        total_paise: addPaise(lineTaxablePaise, taxResult.taxPaise),
        cost_paise: fifoResult.totalCostPaise,
        batches_consumed_json: JSON.stringify(fifoResult.allocations),
        device_id: settings.device_id,
        user_id: 'owner',
        created_at: now,
        updated_at: now,
      };

      invoiceItems.push(invItem);
    }

    const rawGrandTotal = addPaise(taxableTotal, taxTotal);
    const { roundedTotalPaise, roundOffPaise } = roundToRupee(rawGrandTotal);

    const snapshot = {
      name: params.customer.name,
      gstin: params.customer.gstin,
      mobile: params.customer.mobile,
      address_line1: params.customer.address_line1,
      address_line2: params.customer.address_line2,
      city: params.customer.city,
      pincode: params.customer.pincode,
      state_code: buyerState,
    };

    const invoice: Invoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      series,
      sequence_number: sequenceNumber,
      financial_year: fyCode,
      invoice_date: invDate,
      customer_id: params.customer.id,
      customer_snapshot_json: JSON.stringify(snapshot),
      mode: params.mode || 'tax_invoice',
      status: 'finalized',
      is_interstate: interstate ? 1 : 0,
      taxable_total_paise: taxableTotal,
      cgst_total_paise: cgstTotal,
      sgst_total_paise: sgstTotal,
      igst_total_paise: igstTotal,
      tax_total_paise: taxTotal,
      round_off_paise: roundOffPaise,
      grand_total_paise: roundedTotalPaise,
      notes: params.notes,
      device_id: settings.device_id,
      user_id: 'owner',
      created_at: now,
      updated_at: now,
      items: invoiceItems,
    };

    await this.invoices.createFinalizedInvoice(invoice, invoiceItems);
    return invoice;
  }

  /**
   * Cancel Invoice (Retains invoice number, reverses stock)
   */
  async cancelSale(invoiceId: string, reason?: string): Promise<void> {
    await this.invoices.cancelInvoice(invoiceId, reason);
  }

  /**
   * Record Customer Payment
   */
  async recordPayment(params: {
    customerId: string;
    invoiceId?: string;
    amountPaise: number;
    mode: 'cash' | 'upi' | 'bank' | 'other';
    reference?: string;
    notes?: string;
    paidAt?: string;
  }): Promise<Payment> {
    const settings = await this.settings.get();
    const now = new Date().toISOString();
    const payment: Payment = {
      id: generateUUIDv7(),
      invoice_id: params.invoiceId,
      customer_id: params.customerId,
      amount_paise: params.amountPaise,
      mode: params.mode,
      reference: params.reference,
      notes: params.notes,
      is_reversal: 0,
      paid_at: params.paidAt || now,
      device_id: settings?.device_id || generateUUIDv7(),
      user_id: 'owner',
      created_at: now,
    };
    await this.payments.addPayment(payment);
    return payment;
  }

  /**
   * Create encrypted database backup (AES-GCM WebCrypto)
   */
  async createEncryptedBackup(passphrase: string): Promise<string> {
    const allData = await this.db.exportAllData();
    const encryptedJson = await encryptBackup(allData, passphrase);

    let totalRecords = 0;
    for (const rows of Object.values(allData)) {
      totalRecords += rows.length;
    }

    const envelope = JSON.parse(encryptedJson);
    await this.backups.log({
      id: generateUUIDv7(),
      backup_type: 'manual',
      checksum: envelope.checksum,
      record_count: totalRecords,
      created_at: new Date().toISOString(),
    });

    return encryptedJson;
  }

  /** Restore encrypted data only after a verified raw SQLite safety backup is persisted. */
  async restoreFromEncryptedBackup(encryptedBackupJson: string, passphrase: string): Promise<void> {
    if (!this.db.exportDatabase || !this.db.persistSafetyBackup) {
      throw new Error('Restore refused: persistent raw SQLite safety-backup storage is unavailable. No data was changed.');
    }

    // Persist and verify the raw SQLite image before any database mutation.
    const rawSnapshot = await this.db.exportDatabase();
    if (!(rawSnapshot instanceof Uint8Array) || rawSnapshot.byteLength === 0) {
      throw new Error('Restore refused: could not export a non-empty SQLite safety backup. No data was changed.');
    }
    let safety: { fileName: string; checksum: string; sizeBytes: number };
    try {
      safety = await this.db.persistSafetyBackup(rawSnapshot);
    } catch (error) {
      throw new Error(`Restore refused: safety backup could not be written and verified. No data was changed. ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!safety.fileName || !safety.checksum || safety.sizeBytes <= 0 || safety.sizeBytes !== rawSnapshot.byteLength) {
      throw new Error('Restore refused: safety backup could not be read back with a non-zero matching size. No data was changed.');
    }

    const currentData = await this.db.exportAllData();
    const recordCount = Object.values(currentData).reduce((sum, rows) => sum + rows.length, 0);

    // Decrypt and validate the incoming snapshot before changing database contents.
    const decryptedData = await decryptBackup<Record<string, unknown[]>>(encryptedBackupJson, passphrase);
    if (!decryptedData || typeof decryptedData !== 'object' || Array.isArray(decryptedData) ||
        Object.entries(decryptedData).some(([table, rows]) => !Object.prototype.hasOwnProperty.call(currentData, table) ||
          !Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))) {
      throw new Error('Invalid backup payload: expected known tables containing arrays of row objects');
    }
    for (const [table, rows] of Object.entries(decryptedData)) {
      const columns = await this.db.query<{ name: string }>(`PRAGMA table_info("${table}")`);
      const knownColumns = new Set(columns.map((column) => column.name));
      for (const row of rows as Record<string, unknown>[]) {
        const names = Object.keys(row);
        if (!names.length || names.some((column) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column) || !knownColumns.has(column))) {
          throw new Error(`Invalid backup payload: unknown columns in table ${table}`);
        }
      }
    }

    const safetyLog = {
      id: generateUUIDv7(), backup_type: 'auto_safety' as const, checksum: safety.checksum,
      file_name: safety.fileName, size_bytes: safety.sizeBytes,
      record_count: recordCount, created_at: new Date().toISOString(),
    };
    // The file exists and read-back passed; record metadata only after input validation.
    await this.backups.log(safetyLog);
    await this.db.restoreAllData(decryptedData);
    // The imported backups_log table may replace the safety row; preserve the audit link.
    await this.backups.log({ ...safetyLog, id: generateUUIDv7(), created_at: new Date().toISOString() });
  }

  /** Restore the newest verified raw SQLite safety image. */
  async restoreLatestSafetyBackup(): Promise<void> {
    if (!this.db.readLatestSafetyBackup || !this.db.restoreDatabaseBytes) {
      throw new Error('Safety backup restore is unavailable for this storage adapter.');
    }
    const backup = await this.db.readLatestSafetyBackup();
    if (!backup || !backup.bytes?.byteLength || backup.sizeBytes <= 0 || backup.sizeBytes !== backup.bytes.byteLength) {
      throw new Error('No valid non-empty safety backup is available to restore.');
    }
    const digest = await crypto.subtle.digest('SHA-256', backup.bytes);
    const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (checksum !== backup.checksum) throw new Error('Safety backup checksum mismatch; restore refused.');
    const log = await this.db.queryOne<{ file_name?: string; checksum: string }>(
      "SELECT file_name, checksum FROM backups_log WHERE backup_type = 'auto_safety' ORDER BY created_at DESC LIMIT 1"
    );
    if (log && (log.file_name !== backup.fileName || log.checksum !== checksum)) {
      throw new Error('Latest safety backup metadata does not match its file; restore refused.');
    }
    await this.db.restoreDatabaseBytes(backup.bytes);
  }

  /**
   * Export Tally Prime Sales Voucher XML
   */
  async exportTallyXml(
    startDate: string,
    endDate: string,
    mapping?: TallyLedgerMapping
  ): Promise<string> {
    const invoices = await this.invoices.getByDateRange(startDate, endDate);
    return generateTallySalesXml(invoices, mapping);
  }
}

let appServiceSingleton: AppService | null = null;

export function getAppService(): AppService {
  if (!appServiceSingleton) {
    appServiceSingleton = new AppService();
  }
  return appServiceSingleton;
}

export function resetAppServiceForTesting(customDb?: IDatabaseClient): AppService {
  appServiceSingleton = new AppService(customDb);
  return appServiceSingleton;
}
