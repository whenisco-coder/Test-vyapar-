/**
 * Payments & Customer Dues Repository
 * Append-only payments ledger, reversing entries, and running dues calculation.
 */

import { getDbClient, DbClient, getDeviceId } from '../../data/client.ts';
import { generateUUIDv7 } from '../uuid.ts';
import { Payment } from '../types.ts';
import { Money } from '../money.ts';

export interface RecordPaymentInput {
  customerId: string;
  invoiceId?: string | null;
  amountPaise: number;
  mode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
  reference?: string | null;
  notes?: string | null;
  paidAt: string; // ISO date or YYYY-MM-DD
}

export interface CustomerDueSummary {
  customerId: string;
  customerName: string;
  mobile?: string | null;
  totalInvoicedPaise: number;
  totalPaidPaise: number;
  dueBalancePaise: number;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'REVERSAL';
  refNumber: string;
  debitPaise: number;  // Increases dues (Invoice)
  creditPaise: number; // Decreases dues (Payment)
  runningBalancePaise: number;
  notes?: string | null;
}

export class PaymentRepo {
  constructor(private client: DbClient = getDbClient()) {}

  async list(customerId?: string): Promise<Payment[]> {
    let sql = 'SELECT * FROM payments WHERE deleted_at IS NULL';
    const params: any[] = [];
    if (customerId) {
      sql += ' AND customer_id = ?';
      params.push(customerId);
    }
    sql += ' ORDER BY paid_at DESC, created_at DESC';
    return this.client.query<Payment>(sql, params);
  }

  async getPaymentsForInvoice(invoiceId: string): Promise<Payment[]> {
    return this.client.query<Payment>(
      'SELECT * FROM payments WHERE invoice_id = ? AND deleted_at IS NULL ORDER BY paid_at ASC',
      [invoiceId]
    );
  }

  async recordPayment(data: RecordPaymentInput): Promise<Payment> {
    return this.client.transaction(async (tx, c) => {
      const id = generateUUIDv7();
      const now = new Date().toISOString();
      const deviceId = getDeviceId();

      const payment: Payment = {
        id,
        customer_id: data.customerId,
        invoice_id: data.invoiceId || null,
        amount_paise: Math.trunc(data.amountPaise),
        mode: data.mode,
        reference: data.reference || null,
        notes: data.notes || null,
        paid_at: data.paidAt,
        is_reversal: 0,
        reversal_of_id: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
        user_id: 'default-owner',
      };

      await tx.execute(
        `INSERT INTO payments (
          id, customer_id, invoice_id, amount_paise, mode, reference,
          notes, paid_at, is_reversal, reversal_of_id, created_at,
          updated_at, deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id, payment.customer_id, payment.invoice_id, payment.amount_paise,
          payment.mode, payment.reference, payment.notes, payment.paid_at,
          payment.is_reversal, payment.reversal_of_id, payment.created_at,
          payment.updated_at, payment.deleted_at, payment.device_id, payment.user_id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'payments',
        rowId: payment.id,
        op: 'INSERT',
        payload: payment,
      });

      return payment;
    });
  }

  /**
   * Reverses a payment entry by creating an opposite reversing payment entry
   */
  async reversePayment(paymentId: string, reason: string): Promise<Payment> {
    return this.client.transaction(async (tx, c) => {
      const orig = await this.client.queryOne<Payment>(
        'SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL',
        [paymentId]
      );
      if (!orig) throw new Error(`Payment not found: ${paymentId}`);
      if (orig.is_reversal === 1) throw new Error('Cannot reverse an already reversed entry');

      const id = generateUUIDv7();
      const now = new Date().toISOString();
      const deviceId = getDeviceId();

      const reversal: Payment = {
        id,
        customer_id: orig.customer_id,
        invoice_id: orig.invoice_id,
        amount_paise: -orig.amount_paise, // Negative amount
        mode: orig.mode,
        reference: orig.reference,
        notes: `Reversal of payment ${orig.id.slice(0, 8)}: ${reason}`,
        paid_at: now.slice(0, 10),
        is_reversal: 1,
        reversal_of_id: orig.id,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        device_id: deviceId,
        user_id: 'default-owner',
      };

      await tx.execute(
        `INSERT INTO payments (
          id, customer_id, invoice_id, amount_paise, mode, reference,
          notes, paid_at, is_reversal, reversal_of_id, created_at,
          updated_at, deleted_at, device_id, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reversal.id, reversal.customer_id, reversal.invoice_id, reversal.amount_paise,
          reversal.mode, reversal.reference, reversal.notes, reversal.paid_at,
          reversal.is_reversal, reversal.reversal_of_id, reversal.created_at,
          reversal.updated_at, reversal.deleted_at, reversal.device_id, reversal.user_id
        ]
      );

      await c.recordChange(tx, {
        tableName: 'payments',
        rowId: reversal.id,
        op: 'INSERT',
        payload: reversal,
      });

      return reversal;
    });
  }

  /**
   * Computes payment status for an invoice (total paid, balance, status)
   */
  async getInvoicePaymentStatus(
    invoiceId: string,
    grandTotalPaise: number
  ): Promise<{ paidPaise: number; balancePaise: number; status: 'UNPAID' | 'PARTIAL' | 'PAID' }> {
    const rows = await this.client.query<{ total: number }>(
      'SELECT SUM(amount_paise) as total FROM payments WHERE invoice_id = ? AND deleted_at IS NULL',
      [invoiceId]
    );
    const paidPaise = rows.length > 0 && rows[0].total !== null ? Number(rows[0].total) : 0;
    const balancePaise = Money.subtract(grandTotalPaise, paidPaise);

    let status: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';
    if (balancePaise <= 0 && grandTotalPaise > 0) {
      status = 'PAID';
    } else if (paidPaise > 0 && balancePaise > 0) {
      status = 'PARTIAL';
    }

    return { paidPaise, balancePaise, status };
  }

  /**
   * Generates customer ledger with running balance in chronological order
   */
  async getCustomerLedger(customerId: string): Promise<LedgerEntry[]> {
    const invoices = await this.client.query<{
      id: string;
      number: string;
      date: string;
      grand_total_paise: number;
      status: string;
    }>(
      'SELECT id, number, date, grand_total_paise, status FROM invoices WHERE customer_id = ? AND status = ? AND deleted_at IS NULL',
      [customerId, 'FINALIZED']
    );

    const payments = await this.client.query<Payment>(
      'SELECT * FROM payments WHERE customer_id = ? AND deleted_at IS NULL',
      [customerId]
    );

    const rawEntries: Array<{
      id: string;
      date: string;
      type: 'INVOICE' | 'PAYMENT' | 'REVERSAL';
      refNumber: string;
      debitPaise: number;
      creditPaise: number;
      notes?: string | null;
      created_at: string;
    }> = [];

    for (const inv of invoices) {
      rawEntries.push({
        id: inv.id,
        date: inv.date,
        type: 'INVOICE',
        refNumber: inv.number,
        debitPaise: inv.grand_total_paise,
        creditPaise: 0,
        notes: `Sales Invoice #${inv.number}`,
        created_at: inv.date,
      });
    }

    for (const p of payments) {
      rawEntries.push({
        id: p.id,
        date: p.paid_at,
        type: p.is_reversal ? 'REVERSAL' : 'PAYMENT',
        refNumber: p.reference || p.mode,
        debitPaise: p.amount_paise < 0 ? -p.amount_paise : 0,
        creditPaise: p.amount_paise > 0 ? p.amount_paise : 0,
        notes: p.notes || `Payment via ${p.mode}`,
        created_at: p.paid_at,
      });
    }

    // Sort chronologically by date
    rawEntries.sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const ledger: LedgerEntry[] = [];

    for (const entry of rawEntries) {
      running = running + entry.debitPaise - entry.creditPaise;
      ledger.push({
        id: entry.id,
        date: entry.date,
        type: entry.type,
        refNumber: entry.refNumber,
        debitPaise: entry.debitPaise,
        creditPaise: entry.creditPaise,
        runningBalancePaise: running,
        notes: entry.notes,
      });
    }

    return ledger;
  }

  /**
   * Retrieves summary of customer dues sorted by highest amount due
   */
  async getAllCustomerDues(): Promise<CustomerDueSummary[]> {
    const customers = await this.client.query<{ id: string; name: string; mobile: string | null }>(
      'SELECT id, name, mobile FROM customers WHERE deleted_at IS NULL ORDER BY name ASC'
    );

    const invoices = await this.client.query<{ customer_id: string; total: number }>(
      'SELECT customer_id, SUM(grand_total_paise) as total FROM invoices WHERE status = ? AND deleted_at IS NULL GROUP BY customer_id',
      ['FINALIZED']
    );

    const payments = await this.client.query<{ customer_id: string; total: number }>(
      'SELECT customer_id, SUM(amount_paise) as total FROM payments WHERE deleted_at IS NULL GROUP BY customer_id'
    );

    const invMap = new Map<string, number>();
    for (const r of invoices) invMap.set(r.customer_id, Number(r.total) || 0);

    const payMap = new Map<string, number>();
    for (const r of payments) payMap.set(r.customer_id, Number(r.total) || 0);

    const summaries: CustomerDueSummary[] = [];

    for (const c of customers) {
      const totalInvoiced = invMap.get(c.id) || 0;
      const totalPaid = payMap.get(c.id) || 0;
      const due = Money.subtract(totalInvoiced, totalPaid);

      summaries.push({
        customerId: c.id,
        customerName: c.name,
        mobile: c.mobile,
        totalInvoicedPaise: totalInvoiced,
        totalPaidPaise: totalPaid,
        dueBalancePaise: due,
      });
    }

    return summaries.sort((a, b) => b.dueBalancePaise - a.dueBalancePaise);
  }
}
