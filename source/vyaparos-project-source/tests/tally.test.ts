import { describe, it, expect } from 'vitest';
import { generateTallySalesXml, escapeXml, formatTallyDate } from '../src/domain/tally';
import { Invoice } from '../src/domain/types';

describe('Tally Prime Sales Voucher XML Export (T7, D11)', () => {
  it('strictly escapes XML entities', () => {
    expect(escapeXml('A & B < C > "D" \'E\'')).toBe(
      'A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;'
    );
  });

  it('formats dates strictly to YYYYMMDD for Tally', () => {
    expect(formatTallyDate('2026-10-10')).toBe('20261010');
    expect(formatTallyDate('2027-03-31')).toBe('20270331');
  });

  it('generates valid Tally XML matching the standard voucher structure (Golden Test)', () => {
    const mockInvoices: Invoice[] = [
      {
        id: 'inv-1',
        invoice_number: 'INV/2627/0001',
        series: 'INV',
        sequence_number: 1,
        financial_year: '2627',
        invoice_date: '2026-10-10',
        customer_id: 'cust-1',
        customer_snapshot_json: JSON.stringify({ name: 'Shree Krishna Auto & Tyres' }),
        mode: 'tax_invoice',
        status: 'finalized',
        is_interstate: 0,
        taxable_total_paise: 1000000, // ₹ 10,000.00
        cgst_total_paise: 90000,      // ₹ 900.00
        sgst_total_paise: 90000,      // ₹ 900.00
        igst_total_paise: 0,
        tax_total_paise: 180000,      // ₹ 1,800.00
        round_off_paise: 0,
        grand_total_paise: 1180000,   // ₹ 11,800.00
        device_id: 'dev-1',
        user_id: 'owner',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'inv-cancelled',
        invoice_number: 'INV/2627/0002',
        series: 'INV',
        sequence_number: 2,
        financial_year: '2627',
        invoice_date: '2026-10-10',
        customer_id: 'cust-2',
        customer_snapshot_json: JSON.stringify({ name: 'Void Client' }),
        mode: 'tax_invoice',
        status: 'cancelled',
        is_interstate: 0,
        taxable_total_paise: 50000,
        cgst_total_paise: 4500,
        sgst_total_paise: 4500,
        igst_total_paise: 0,
        tax_total_paise: 9000,
        round_off_paise: 0,
        grand_total_paise: 59000,
        device_id: 'dev-1',
        user_id: 'owner',
        created_at: '2026-10-10T11:00:00Z',
        updated_at: '2026-10-10T11:00:00Z',
      },
    ];

    const xml = generateTallySalesXml(mockInvoices);

    // Envelope and header validation
    expect(xml).toContain('<ENVELOPE>');
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
    expect(xml).toContain('<VOUCHERNUMBER>INV/2627/0001</VOUCHERNUMBER>');
    expect(xml).toContain('<PARTYLEDGERNAME>Shree Krishna Auto &amp; Tyres</PARTYLEDGERNAME>');

    // Debtor entry with negative amount
    expect(xml).toContain('<AMOUNT>-11800.00</AMOUNT>');

    // Sales credit entry
    expect(xml).toContain('<LEDGERNAME>Sales Account</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>10000.00</AMOUNT>');

    // Output CGST & SGST entries
    expect(xml).toContain('<LEDGERNAME>Output CGST</LEDGERNAME>');
    expect(xml).toContain('<AMOUNT>900.00</AMOUNT>');
    expect(xml).toContain('<LEDGERNAME>Output SGST</LEDGERNAME>');

    // Must omit cancelled invoices
    expect(xml).not.toContain('INV/2627/0002');
    expect(xml).not.toContain('Void Client');
  });
});
