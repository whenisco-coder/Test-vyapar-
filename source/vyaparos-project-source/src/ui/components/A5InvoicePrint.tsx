import React from 'react';
import { Invoice, BusinessSettings } from '../../domain/types';
import { paiseToRupeeString, amountInWords } from '../../domain/money';
import { STATE_CODES } from '../../domain/gst';

interface A5InvoicePrintProps {
  invoice: Invoice;
  business: BusinessSettings;
}

export const A5InvoicePrint: React.FC<A5InvoicePrintProps> = ({ invoice, business }) => {
  let customerSnapshot: any = {};
  try {
    customerSnapshot = JSON.parse(invoice.customer_snapshot_json || '{}');
  } catch {
    customerSnapshot = {};
  }

  const isTaxInvoice = invoice.mode === 'tax_invoice' || invoice.mode === 'TAX_INVOICE';
  const isInter = (invoice.is_interstate || 0) === 1;
  const taxableVal = invoice.taxable_total_paise ?? invoice.taxable_paise ?? 0;
  const cgstVal = invoice.cgst_total_paise ?? invoice.cgst_paise ?? 0;
  const sgstVal = invoice.sgst_total_paise ?? invoice.sgst_paise ?? 0;
  const igstVal = invoice.igst_total_paise ?? invoice.igst_paise ?? 0;
  const roundOffVal = invoice.round_off_paise || 0;
  const grandTotalVal = invoice.grand_total_paise;

  const sellerStateName = STATE_CODES[business.state_code] || business.state_code;
  const buyerStateCode = customerSnapshot.state_code || business.state_code;
  const buyerStateName = STATE_CODES[buyerStateCode] || buyerStateCode;

  return (
    <div className="a5-print-sheet bg-white text-slate-900 mx-auto border border-slate-300 shadow-sm font-sans text-[11px] leading-tight select-text print:border-none print:shadow-none print:m-0 w-full max-w-[620px]">
      <style>{`
        @media print {
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: A5 portrait;
            margin: 6mm;
          }
          .no-print {
            display: none !important;
          }
          .a5-print-sheet {
            max-width: 100% !important;
            border: 1px solid #1e293b !important;
          }
        }
      `}</style>

      {/* Title Header */}
      <div className="bg-slate-100 text-center font-bold tracking-wider py-1.5 border-b border-slate-800 text-xs text-slate-900 uppercase">
        {isTaxInvoice ? 'Tax Invoice' : 'Bill of Supply'}
      </div>

      {/* Seller & Invoice Meta Grid */}
      <div className="grid grid-cols-2 border-b border-slate-800 text-[10px]">
        {/* Left: Seller Information */}
        <div className="p-2 border-r border-slate-800 space-y-0.5">
          <div className="font-bold text-xs text-slate-950 uppercase">{business.business_name}</div>
          {business.trade_name && <div className="text-slate-600 font-medium">({business.trade_name})</div>}
          <div className="text-slate-700">
            {business.address_line1}
            {business.city ? `, ${business.city}` : ''}
            {business.pincode ? ` - ${business.pincode}` : ''}
          </div>
          {business.phone && <div>Mobile: {business.phone}</div>}
          <div className="font-semibold text-slate-900">
            GSTIN: <span className="font-mono">{business.gstin || 'URP / Not Registered'}</span>
          </div>
          <div>
            State: {sellerStateName} ({business.state_code})
          </div>
        </div>

        {/* Right: Invoice & Buyer Details */}
        <div className="p-2 space-y-0.5">
          <div className="flex justify-between font-semibold">
            <span>Invoice No:</span>
            <span className="font-mono text-slate-950 font-bold">
              {invoice.invoice_number || invoice.number}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{invoice.invoice_date || invoice.date}</span>
          </div>
          <div className="flex justify-between">
            <span>FY:</span>
            <span>{invoice.financial_year}</span>
          </div>
          <div className="flex justify-between">
            <span>Place of Supply:</span>
            <span>
              {buyerStateName} ({buyerStateCode})
            </span>
          </div>
          <div className="pt-1 mt-1 border-t border-slate-200">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold block">
              Billed To:
            </span>
            <div className="font-bold text-slate-900">{customerSnapshot.name || 'Counter Customer'}</div>
            {customerSnapshot.gstin && (
              <div>
                GSTIN: <span className="font-mono">{customerSnapshot.gstin}</span>
              </div>
            )}
            {customerSnapshot.mobile && <div>Mobile: {customerSnapshot.mobile}</div>}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full border-collapse text-[10px] border-b border-slate-800">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-800 font-semibold text-slate-800">
            <th className="py-1 px-1.5 text-center border-r border-slate-800 w-6">#</th>
            <th className="py-1 px-2 text-left border-r border-slate-800">Description of Goods</th>
            <th className="py-1 px-1.5 text-center border-r border-slate-800 w-16">HSN/SAC</th>
            <th className="py-1 px-1.5 text-center border-r border-slate-800 w-14">Qty</th>
            <th className="py-1 px-1.5 text-right border-r border-slate-800 w-16">Rate (₹)</th>
            <th className="py-1 px-1.5 text-right border-r border-slate-800 w-18">Taxable (₹)</th>
            <th className="py-1 px-2 text-right w-20">Amount (₹)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {(invoice.items || []).map((item, idx) => (
            <tr key={item.id || idx} className="hover:bg-slate-50/50">
              <td className="py-1 px-1.5 text-center border-r border-slate-800 text-slate-600">
                {idx + 1}
              </td>
              <td className="py-1 px-2 border-r border-slate-800 font-medium text-slate-900">
                {item.product_name}
              </td>
              <td className="py-1 px-1.5 text-center border-r border-slate-800 font-mono text-slate-600">
                {item.hsn || '-'}
              </td>
              <td className="py-1 px-1.5 text-center border-r border-slate-800 font-medium">
                {item.quantity} {item.unit}
              </td>
              <td className="py-1 px-1.5 text-right border-r border-slate-800 font-mono">
                {paiseToRupeeString(item.unit_price_paise)}
              </td>
              <td className="py-1 px-1.5 text-right border-r border-slate-800 font-mono">
                {paiseToRupeeString(item.taxable_amount_paise ?? item.taxable_paise ?? 0)}
              </td>
              <td className="py-1 px-2 text-right font-mono font-semibold text-slate-950">
                {paiseToRupeeString(item.total_paise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Calculation & Tax Summary Section */}
      <div className="grid grid-cols-2 border-b border-slate-800 text-[10px]">
        {/* Left: Words & Bank */}
        <div className="p-2 border-r border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
              Amount In Words:
            </div>
            <div className="font-semibold text-slate-900 italic">
              {amountInWords(grandTotalVal)}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-200 text-[9px] space-y-0.5 text-slate-600">
            <div className="font-semibold text-slate-800 uppercase tracking-wider">Bank Details</div>
            {business.bank_name && (
              <div>
                Bank: {business.bank_name} | A/C: {business.bank_account_no}
              </div>
            )}
            {business.bank_ifsc && <div>IFSC: {business.bank_ifsc}</div>}
            {business.upi_id && <div>UPI ID: {business.upi_id}</div>}
          </div>
        </div>

        {/* Right: Math Totals */}
        <div className="p-2 space-y-1">
          <div className="flex justify-between text-slate-700">
            <span>Taxable Subtotal:</span>
            <span className="font-mono">₹ {paiseToRupeeString(taxableVal)}</span>
          </div>
          {isInter ? (
            <div className="flex justify-between text-slate-700">
              <span>Integrated GST (IGST):</span>
              <span className="font-mono">₹ {paiseToRupeeString(igstVal)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-slate-700">
                <span>Central GST (CGST):</span>
                <span className="font-mono">₹ {paiseToRupeeString(cgstVal)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>State GST (SGST):</span>
                <span className="font-mono">₹ {paiseToRupeeString(sgstVal)}</span>
              </div>
            </>
          )}
          {roundOffVal !== 0 && (
            <div className="flex justify-between text-slate-700">
              <span>Round Off:</span>
              <span className="font-mono">
                {roundOffVal > 0 ? `+₹ ${paiseToRupeeString(roundOffVal)}` : `₹ ${paiseToRupeeString(roundOffVal)}`}
              </span>
            </div>
          )}
          <div className="border-t border-slate-800 pt-1.5 flex justify-between font-bold text-xs text-slate-950">
            <span>Grand Total:</span>
            <span className="font-mono">₹ {paiseToRupeeString(grandTotalVal)}</span>
          </div>
        </div>
      </div>

      {/* Footer: Terms & Signature */}
      <div className="grid grid-cols-2 text-[9px] p-2 min-h-[60px]">
        <div className="space-y-0.5 text-slate-600">
          <div className="font-semibold text-slate-800 uppercase tracking-wider">Terms & Conditions:</div>
          <div>1. Goods once sold will not be returned.</div>
          <div>2. Warranty by manufacturer only.</div>
          <div>3. Subject to local jurisdiction.</div>
        </div>
        <div className="text-right flex flex-col justify-between">
          <div className="font-semibold text-slate-900">For {business.business_name}</div>
          <div className="text-slate-500 pt-4">Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
};
