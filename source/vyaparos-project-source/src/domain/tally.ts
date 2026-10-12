import { Invoice } from './types';
import { paiseToRupeeString } from './money';

export interface TallyLedgerMapping {
  salesVoucherType?: string;
  defaultSalesLedger?: string;
  salesLedger?: string;
  outputCgstLedger?: string;
  cgstLedger?: string;
  outputSgstLedger?: string;
  sgstLedger?: string;
  outputIgstLedger?: string;
  igstLedger?: string;
  roundOffLedger?: string;
}

export interface TallyInvoiceInput {
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerGstin?: string;
  customerStateCode?: string;
  status?: string;
  grandTotalPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  notes?: string;
}

export const DEFAULT_TALLY_MAPPING: TallyLedgerMapping = {
  salesVoucherType: 'Sales',
  defaultSalesLedger: 'Sales Account',
  salesLedger: 'Sales Account',
  outputCgstLedger: 'Output CGST',
  cgstLedger: 'Output CGST',
  outputSgstLedger: 'Output SGST',
  sgstLedger: 'Output SGST',
  outputIgstLedger: 'Output IGST',
  igstLedger: 'Output IGST',
  roundOffLedger: 'Round Off',
};

/**
 * Escapes characters for strict XML compliance
 */
export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts date string (YYYY-MM-DD or ISO) to Tally YYYYMMDD format
 */
export function formatTallyDate(dateStr: string): string {
  const d = new Date(dateStr);
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Generate standard Tally Prime Import XML for Sales Vouchers
 */
export function generateTallySalesXml(
  invoices: (Invoice | TallyInvoiceInput)[],
  mapping: TallyLedgerMapping = DEFAULT_TALLY_MAPPING
): string {
  const salesVoucherType = mapping.salesVoucherType || 'Sales';
  const salesLedger = mapping.salesLedger || mapping.defaultSalesLedger || 'Sales Account';
  const cgstLedger = mapping.cgstLedger || mapping.outputCgstLedger || 'Output CGST';
  const sgstLedger = mapping.sgstLedger || mapping.outputSgstLedger || 'Output SGST';
  const igstLedger = mapping.igstLedger || mapping.outputIgstLedger || 'Output IGST';
  const roundOffLedger = mapping.roundOffLedger || 'Round Off';

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<ENVELOPE>\n';
  xml += '  <HEADER>\n';
  xml += '    <TALLYREQUEST>Import Data</TALLYREQUEST>\n';
  xml += '  </HEADER>\n';
  xml += '  <BODY>\n';
  xml += '    <IMPORTDATA>\n';
  xml += '      <REQUESTDESC>\n';
  xml += '        <REPORTNAME>Vouchers</REPORTNAME>\n';
  xml += '        <STATICVARIABLES>\n';
  xml += '          <SVCURRENTCOMPANY>##SVCURRENTCOMPANY</SVCURRENTCOMPANY>\n';
  xml += '        </STATICVARIABLES>\n';
  xml += '      </REQUESTDESC>\n';
  xml += '      <REQUESTDATA>\n';

  for (const item of invoices) {
    if ('status' in item) {
      const inv = item as Invoice;
      if (String(inv.status).toUpperCase() === 'CANCELLED') continue;

      const tallyDate = formatTallyDate(inv.date || inv.invoice_date || new Date().toISOString());
      const invNumber = inv.number || inv.invoice_number || 'INV';
      let customerName = 'Cash Customer';
      try {
        const snap = JSON.parse(inv.customer_snapshot_json);
        if (snap.name) customerName = snap.name;
      } catch {
        // ignore
      }

      const taxablePaise = inv.taxable_paise ?? inv.taxable_total_paise ?? 0;
      const cgstPaise = inv.cgst_paise ?? inv.cgst_total_paise ?? 0;
      const sgstPaise = inv.sgst_paise ?? inv.sgst_total_paise ?? 0;
      const igstPaise = inv.igst_paise ?? inv.igst_total_paise ?? 0;

      const grandTotalRupees = paiseToRupeeString(inv.grand_total_paise);
      const taxableRupees = paiseToRupeeString(taxablePaise);
      const cgstRupees = paiseToRupeeString(cgstPaise);
      const sgstRupees = paiseToRupeeString(sgstPaise);
      const igstRupees = paiseToRupeeString(igstPaise);
      const roundOffRupees = paiseToRupeeString(Math.abs(inv.round_off_paise));

      xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
      xml += `          <VOUCHER VCHTYPE="${escapeXml(salesVoucherType)}" ACTION="Create">\n`;
      xml += `            <DATE>${tallyDate}</DATE>\n`;
      xml += `            <VOUCHERTYPENAME>${escapeXml(salesVoucherType)}</VOUCHERTYPENAME>\n`;
      xml += `            <VOUCHERNUMBER>${escapeXml(invNumber)}</VOUCHERNUMBER>\n`;
      xml += `            <PARTYLEDGERNAME>${escapeXml(customerName)}</PARTYLEDGERNAME>\n`;
      xml += `            <PERSISTEDVIEW>Invoice View</PERSISTEDVIEW>\n`;
      xml += `            <NARRATION>Tax Invoice ${escapeXml(invNumber)}</NARRATION>\n`;

      // 1. Party Ledger Entry (Debit in Sales voucher, negative amount)
      xml += '            <ALLLEDGERENTRIES.LIST>\n';
      xml += `              <LEDGERNAME>${escapeXml(customerName)}</LEDGERNAME>\n`;
      xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
      xml += `              <AMOUNT>-${grandTotalRupees}</AMOUNT>\n`;
      xml += '              <BILLALLOCATIONS.LIST>\n';
      xml += `                <NAME>${escapeXml(invNumber)}</NAME>\n`;
      xml += '                <BILLTYPE>New Ref</BILLTYPE>\n';
      xml += `                <AMOUNT>-${grandTotalRupees}</AMOUNT>\n`;
      xml += '              </BILLALLOCATIONS.LIST>\n';
      xml += '            </ALLLEDGERENTRIES.LIST>\n';

      // 2. Sales Ledger Entry (Credit, positive amount)
      xml += '            <ALLLEDGERENTRIES.LIST>\n';
      xml += `              <LEDGERNAME>${escapeXml(salesLedger)}</LEDGERNAME>\n`;
      xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
      xml += `              <AMOUNT>${taxableRupees}</AMOUNT>\n`;
      xml += '            </ALLLEDGERENTRIES.LIST>\n';

      // 3. Tax Ledgers (Credit, positive amount)
      if (cgstPaise > 0) {
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(cgstLedger)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${cgstRupees}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      if (sgstPaise > 0) {
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(sgstLedger)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${sgstRupees}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      if (igstPaise > 0) {
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(igstLedger)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${igstRupees}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      // 4. Round Off Ledger Entry
      if (inv.round_off_paise !== 0) {
        const isPositive = inv.round_off_paise > 0;
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(roundOffLedger)}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>${isPositive ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${isPositive ? roundOffRupees : `-${roundOffRupees}`}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      xml += '          </VOUCHER>\n';
      xml += '        </TALLYMESSAGE>\n';
    } else {
      const inp = item as TallyInvoiceInput;
      const tallyDate = formatTallyDate(inp.date);
      const grandTotalRupees = paiseToRupeeString(inp.grandTotalPaise);
      const taxableRupees = paiseToRupeeString(inp.taxablePaise);
      const cgstRupees = paiseToRupeeString(inp.cgstPaise);
      const sgstRupees = paiseToRupeeString(inp.sgstPaise);
      const igstRupees = paiseToRupeeString(inp.igstPaise);
      const roundOffRupees = paiseToRupeeString(Math.abs(inp.roundOffPaise));

      xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
      xml += `          <VOUCHER VCHTYPE="${escapeXml(salesVoucherType)}" ACTION="Create">\n`;
      xml += `            <DATE>${tallyDate}</DATE>\n`;
      xml += `            <VOUCHERTYPENAME>${escapeXml(salesVoucherType)}</VOUCHERTYPENAME>\n`;
      xml += `            <VOUCHERNUMBER>${escapeXml(inp.invoiceNumber)}</VOUCHERNUMBER>\n`;
      xml += `            <PARTYLEDGERNAME>${escapeXml(inp.customerName)}</PARTYLEDGERNAME>\n`;
      xml += `            <PERSISTEDVIEW>Invoice View</PERSISTEDVIEW>\n`;
      xml += `            <NARRATION>Tax Invoice ${escapeXml(inp.invoiceNumber)}</NARRATION>\n`;

      xml += '            <ALLLEDGERENTRIES.LIST>\n';
      xml += `              <LEDGERNAME>${escapeXml(inp.customerName)}</LEDGERNAME>\n`;
      xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
      xml += `              <AMOUNT>-${grandTotalRupees}</AMOUNT>\n`;
      xml += '            </ALLLEDGERENTRIES.LIST>\n';

      xml += '            <ALLLEDGERENTRIES.LIST>\n';
      xml += `              <LEDGERNAME>${escapeXml(salesLedger)}</LEDGERNAME>\n`;
      xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
      xml += `              <AMOUNT>${taxableRupees}</AMOUNT>\n`;
      xml += '            </ALLLEDGERENTRIES.LIST>\n';

      if (inp.cgstPaise > 0) {
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(cgstLedger)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${cgstRupees}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      if (inp.sgstPaise > 0) {
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(sgstLedger)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${sgstRupees}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      if (inp.igstPaise > 0) {
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(igstLedger)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${igstRupees}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      if (inp.roundOffPaise !== 0) {
        const isPositive = inp.roundOffPaise > 0;
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(roundOffLedger)}</LEDGERNAME>\n`;
        xml += `              <ISDEEMEDPOSITIVE>${isPositive ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
        xml += `              <AMOUNT>${isPositive ? roundOffRupees : `-${roundOffRupees}`}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
      }

      xml += '          </VOUCHER>\n';
      xml += '        </TALLYMESSAGE>\n';
    }
  }

  xml += '      </REQUESTDATA>\n';
  xml += '    </IMPORTDATA>\n';
  xml += '  </BODY>\n';
  xml += '</ENVELOPE>\n';

  return xml;
}

/**
 * Generate CSV with UTF-8 BOM
 */
export function generateCsvWithBom(
  arg1: string[] | Invoice[],
  arg2?: (string | number)[][]
): string {
  if (Array.isArray(arg1) && (arg1.length === 0 || (typeof arg1[0] === 'object' && ('grand_total_paise' in arg1[0] || 'id' in arg1[0])))) {
    const invoices = arg1 as Invoice[];
    const headers = ['Invoice No', 'Date', 'Customer', 'Status', 'Taxable (Rs)', 'CGST (Rs)', 'SGST (Rs)', 'IGST (Rs)', 'Total (Rs)'];
    const rows = invoices.map((inv) => {
      let cust = 'Counter Customer';
      try {
        const snap = JSON.parse(inv.customer_snapshot_json || '{}');
        if (snap.name) cust = snap.name;
      } catch {}
      return [
        inv.invoice_number || inv.number || '',
        inv.invoice_date || inv.date || '',
        cust,
        inv.status,
        paiseToRupeeString(inv.taxable_total_paise ?? inv.taxable_paise ?? 0),
        paiseToRupeeString(inv.cgst_total_paise ?? inv.cgst_paise ?? 0),
        paiseToRupeeString(inv.sgst_total_paise ?? inv.sgst_paise ?? 0),
        paiseToRupeeString(inv.igst_total_paise ?? inv.igst_paise ?? 0),
        paiseToRupeeString(inv.grand_total_paise),
      ];
    });
    return generateCsvWithBom(headers, rows);
  }

  const headers = arg1 as string[];
  const rows = arg2 || [];
  const BOM = '\uFEFF';
  const csvLines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    csvLines.push(row.map((val) => escapeCsvValue(String(val))).join(','));
  }
  return BOM + csvLines.join('\n');
}

function escapeCsvValue(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
