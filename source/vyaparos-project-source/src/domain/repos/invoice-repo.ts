/**
 * Sales Invoices Repository
 * Sequential gapless numbering, FIFO batch consumption, cancellation reversal.
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { StorageDatabase } from '../../data/storage-backend.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { Invoice, InvoiceItem, InvoiceSeries, Party } from '../types.ts';
import { StockRepo } from './stock-repo.ts';
import { SettingsRepo } from './settings-repo.ts';
import { PartyRepo } from './party-repo.ts';
import { formatInvoiceNumber, getIndianFinancialYearCode } from '../numbering.ts';
import { calculateLineGst } from '../gst.ts';
import { Money } from '../money.ts';
import { allocateFifoBatches, allocateWeightedAverageBatches } from '../fifo.ts';

export interface InvoiceItemInput {
  productId: string;
  productName: string;
  hsn: string;
  quantity: number;
  unit: string;
  unitPricePaise: number;
  gstRateBp: number;
  priceIncludesTax: boolean;
}

export interface CreateInvoiceInput {
  customerId: string;
  date: string; // YYYY-MM-DD
  dueDate?: string | null;
  mode: 'TAX_INVOICE' | 'SIMPLE_BILL';
  notes?: string | null;
  items: InvoiceItemInput[];
  autoFinalize?: boolean;
}

export class InvoiceRepo {
  private stockRepo: StockRepo;
  private settingsRepo: SettingsRepo;
  private partyRepo: PartyRepo;

  constructor(private client: DbClient = getDbClient()) {
    this.stockRepo = new StockRepo(client);
    this.settingsRepo = new SettingsRepo(client);
    this.partyRepo = new PartyRepo(client);
  }

  async list(): Promise<Invoice[]> {
    return this.client.query<Invoice>(
      'SELECT * FROM invoices WHERE deleted_at IS NULL ORDER BY date DESC, sequence_number DESC'
    );
  }

  async getById(id: string): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
    const invoice = await this.client.queryOne<Invoice>(
      'SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!invoice) return null;

    const items = await this.client.query<InvoiceItem>(
      'SELECT * FROM invoice_items WHERE invoice_id = ? AND deleted_at IS NULL',
      [id]
    );
    return { invoice, items };
  }

  async getByNumber(number: string): Promise<Invoice | null> {
    return this.client.queryOne<Invoice>(
      'SELECT * FROM invoices WHERE number = ? AND deleted_at IS NULL',
      [number]
    );
  }

  /**
   * Generates next gapless sequence number for the current FY and series prefix
   */
  private async getNextSequenceNumber(
    tx: StorageDatabase,
    prefix: string,
    fyCode: string
  ): Promise<{ sequence: number; seriesId: string }> {
    const seriesRows = await tx.query<InvoiceSeries>(
      'SELECT * FROM invoice_series WHERE series_prefix = ? AND financial_year = ? AND deleted_at IS NULL',
      [prefix, fyCode]
    );

    const now = new Date().toISOString();
    const deviceId = getDeviceId();

    if (seriesRows.length === 0) {
      const seriesId = generateUUIDv7();
      const nextNum = 1;
      await tx.execute(
        `INSERT INTO invoice_series (
          id, series_prefix, financial_year, last_number,
          created_at, updated_at, deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [seriesId, prefix, fyCode, nextNum, now, now, null, deviceId, 'default-owner']
      );
      return { sequence: nextNum, seriesId };
    } else {
      const existing = seriesRows[0];
      const nextNum = existing.last_number + 1;
      await tx.execute(
        'UPDATE invoice_series SET last_number = ?, updated_at = ? WHERE id = ?',
        [nextNum, now, existing.id]
      );
      return { sequence: nextNum, seriesId: existing.id };
    }
  }

  async create(data: CreateInvoiceInput): Promise<{ invoice: Invoice; items: InvoiceItem[] }> {
    return this.client.transaction(async (tx, c) => {
      const settings = await this.settingsRepo.get();
      const customer = await this.partyRepo.getById(data.customerId);
      if (!customer) throw new Error(`Customer not found: ${data.customerId}`);

      const businessState = settings?.state_code || '27';
      const customerState = customer.state_code || businessState;
      const isInterState = businessState !== customerState;

      const prefix = settings?.invoice_prefix || 'INV';
      const fyCode = getIndianFinancialYearCode(data.date);

      const invoiceId = generateUUIDv7();
      const now = new Date().toISOString();
      const deviceId = getDeviceId();

      // Acquire next gapless sequential number
      const { sequence } = await this.getNextSequenceNumber(tx, prefix, fyCode);
      const invoiceNumber = formatInvoiceNumber(prefix, fyCode, sequence);

      let totalTaxable = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;
      let totalTax = 0;
      let rawLineSum = 0;

      const createdItems: InvoiceItem[] = [];

      // Process lines & calculate taxes
      for (const itm of data.items) {
        const gstResult = calculateLineGst({
          quantity: itm.quantity,
          unitPricePaise: itm.unitPricePaise,
          gstRateBp: itm.gstRateBp,
          priceIncludesTax: itm.priceIncludesTax,
          isInterState,
        });

        totalTaxable = Money.add(totalTaxable, gstResult.taxablePaise);
        totalCgst = Money.add(totalCgst, gstResult.cgstPaise);
        totalSgst = Money.add(totalSgst, gstResult.sgstPaise);
        totalIgst = Money.add(totalIgst, gstResult.igstPaise);
        totalTax = Money.add(totalTax, gstResult.totalTaxPaise);
        rawLineSum = Money.add(rawLineSum, gstResult.totalPaise);

        // Batch allocation for FIFO or Weighted Average cost
        const batches = await this.stockRepo.getAvailableBatches(itm.productId, 'Own');
        const allocation =
          settings?.stock_method === 'WEIGHTED_AVG'
            ? allocateWeightedAverageBatches({
                requestedQty: itm.quantity,
                availableBatches: batches,
                allowNegativeStock: !!settings?.allow_negative_stock,
              })
            : allocateFifoBatches({
                requestedQty: itm.quantity,
                availableBatches: batches,
                allowNegativeStock: !!settings?.allow_negative_stock,
              });

        const invoiceItemId = generateUUIDv7();
        const invoiceItem: InvoiceItem = {
          id: invoiceItemId,
          invoice_id: invoiceId,
          product_id: itm.productId,
          product_name: itm.productName,
          hsn: itm.hsn,
          quantity: itm.quantity,
          unit: itm.unit,
          unit_price_paise: itm.unitPricePaise,
          gst_rate_bp: itm.gstRateBp,
          taxable_paise: gstResult.taxablePaise,
          cgst_paise: gstResult.cgstPaise,
          sgst_paise: gstResult.sgstPaise,
          igst_paise: gstResult.igstPaise,
          total_tax_paise: gstResult.totalTaxPaise,
          total_paise: gstResult.totalPaise,
          cost_paise: allocation.totalCostPaise,
          batches_consumed_json: JSON.stringify(allocation.consumedBatches),
          created_at: now,
          updated_at: now,
          deleted_at: null,
          device_id: deviceId,
          user_id: 'default-owner',
        };

        await tx.execute(
          `INSERT INTO invoice_items (
            id, invoice_id, product_id, product_name, hsn, quantity, unit,
            unit_price_paise, gst_rate_bp, taxable_paise, cgst_paise, sgst_paise,
            igst_paise, total_tax_paise, total_paise, cost_paise, batches_consumed_json,
            created_at, updated_at, deleted_at, device_id, user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceItem.id, invoiceItem.invoice_id, invoiceItem.product_id, invoiceItem.product_name,
            invoiceItem.hsn, invoiceItem.quantity, invoiceItem.unit, invoiceItem.unit_price_paise,
            invoiceItem.gst_rate_bp, invoiceItem.taxable_paise, invoiceItem.cgst_paise,
            invoiceItem.sgst_paise, invoiceItem.igst_paise, invoiceItem.total_tax_paise,
            invoiceItem.total_paise, invoiceItem.cost_paise, invoiceItem.batches_consumed_json,
            invoiceItem.created_at, invoiceItem.updated_at, invoiceItem.deleted_at,
            invoiceItem.device_id, invoiceItem.user_id
          ]
        );

        await c.recordChange(tx, {
          tableName: 'invoice_items',
          rowId: invoiceItem.id,
          op: 'INSERT',
          payload: invoiceItem,
        });

        createdItems.push(invoiceItem);

        // Record stock movements consuming batches
        for (const consumed of allocation.consumedBatches) {
          await this.stockRepo.addMovement(tx, {
            productId: itm.productId,
            batchId: consumed.batch_id,
            location: 'Own',
            qtyDelta: -consumed.quantity, // Negative for sale
            reason: 'SALE',
            refTable: 'invoices',
            refId: invoiceId,
            notes: `Sale on invoice ${invoiceNumber}`,
          });
        }
      }

      // Calculate Round-off to nearest rupee
      const { roundOffPaise, grandTotalPaise } = Money.calcRoundOff(rawLineSum);

      const customerSnapshot = JSON.stringify({
        id: customer.id,
        name: customer.name,
        type: customer.type,
        party_kind: customer.party_kind,
        gstin: customer.gstin,
        mobile: customer.mobile,
        address_line1: customer.address_line1,
        address_line2: customer.address_line2,
        city: customer.city,
        pincode: customer.pincode,
        state_code: customer.state_code,
      });

      const invoice: Invoice = {
        id: invoiceId,
        number: invoiceNumber,
        series: prefix,
        sequence_number: sequence,
        financial_year: fyCode,
        date: data.date,
        due_date: data.dueDate || null,
        mode: data.mode,
        status: 'FINALIZED', // Finalized upon creation with locked number
        customer_id: customer.id,
        customer_snapshot_json: customerSnapshot,
        taxable_paise: totalTaxable,
        cgst_paise: totalCgst,
        sgst_paise: totalSgst,
        igst_paise: totalIgst,
        total_tax_paise: totalTax,
        round_off_paise: roundOffPaise,
        grand_total_paise: grandTotalPaise,
        notes: data.notes || null,
        cancellation_reason: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
        user_id: 'default-owner',
      };

      await tx.execute(
        `INSERT INTO invoices (
          id, number, series, sequence_number, financial_year, date, due_date,
          mode, status, customer_id, customer_snapshot_json, taxable_paise,
          cgst_paise, sgst_paise, igst_paise, total_tax_paise, round_off_paise,
          grand_total_paise, notes, cancellation_reason, created_at, updated_at,
          deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice.id, invoice.number, invoice.series, invoice.sequence_number,
          invoice.financial_year, invoice.date, invoice.due_date, invoice.mode,
          invoice.status, invoice.customer_id, invoice.customer_snapshot_json,
          invoice.taxable_paise, invoice.cgst_paise, invoice.sgst_paise,
          invoice.igst_paise, invoice.total_tax_paise, invoice.round_off_paise,
          invoice.grand_total_paise, invoice.notes, invoice.cancellation_reason,
          invoice.created_at, invoice.updated_at, invoice.deleted_at,
          invoice.device_id, invoice.user_id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'invoices',
        rowId: invoice.id,
        op: 'INSERT',
        payload: invoice,
      });

      return { invoice, items: createdItems };
    });
  }

  /**
   * Cancels invoice: keeps the invoice number, marks status CANCELLED,
   * and creates opposite stock movements (CANCEL_SALE) to restore stock safely.
   */
  async cancel(invoiceId: string, reason: string): Promise<Invoice> {
    return this.client.transaction(async (tx, c) => {
      const full = await this.getById(invoiceId);
      if (!full) throw new Error(`Invoice not found: ${invoiceId}`);
      if (full.invoice.status === 'CANCELLED') {
        return full.invoice;
      }

      const now = new Date().toISOString();

      await tx.execute(
        'UPDATE invoices SET status = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?',
        ['CANCELLED', reason, now, invoiceId]
      );

      // Restore stock via opposite stock movements for each item
      for (const itm of full.items) {
        let consumedBatches: Array<{ batch_id: string | null; quantity: number }> = [];
        if (itm.batches_consumed_json) {
          try {
            consumedBatches = JSON.parse(itm.batches_consumed_json);
          } catch {
            consumedBatches = [];
          }
        }

        if (consumedBatches.length > 0) {
          for (const cb of consumedBatches) {
            await this.stockRepo.addMovement(tx, {
              productId: itm.product_id,
              batchId: cb.batch_id,
              location: 'Own',
              qtyDelta: cb.quantity, // Positive to restore stock
              reason: 'CANCEL_SALE',
              refTable: 'invoices',
              refId: invoiceId,
              notes: `Stock reversal for cancelled invoice ${full.invoice.number}`,
            });
          }
        } else {
          // If no specific batch recorded, restore general product stock
          await this.stockRepo.addMovement(tx, {
            productId: itm.product_id,
            location: 'Own',
            qtyDelta: itm.quantity,
            reason: 'CANCEL_SALE',
            refTable: 'invoices',
            refId: invoiceId,
            notes: `Stock reversal for cancelled invoice ${full.invoice.number}`,
          });
        }
      }

      const updatedInvoice: Invoice = {
        ...full.invoice,
        status: 'CANCELLED',
        cancellation_reason: reason,
        updated_at: now,
      };

      await c.recordChange(tx, {
        tableName: 'invoices',
        rowId: invoiceId,
        op: 'UPDATE',
        payload: updatedInvoice,
      });

      return updatedInvoice;
    });
  }
}
