import { jsPDF } from 'jspdf';
import { Invoice, BusinessSettings } from './types';
import { paiseToRupeeString, amountInWords } from './money';
import { STATE_CODES } from './gst';

export function generateInvoicePdf(invoice: Invoice, business: BusinessSettings): jsPDF {
  // A5 dimensions in mm: 148 x 210
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = 148;
  const pageHeight = 210;
  const margin = 8;
  const contentWidth = pageWidth - margin * 2; // 132mm

  let y = margin;

  // Outer Border
  doc.setDrawColor(30, 41, 59); // slate-800
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

  // Header Title
  const isTaxInvoice = invoice.mode === 'tax_invoice' || invoice.mode === 'TAX_INVOICE';
  const titleText = isTaxInvoice ? 'TAX INVOICE' : 'BILL OF SUPPLY';

  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(titleText, pageWidth / 2, y + 5, { align: 'center' });
  y += 7;

  doc.line(margin, y, margin + contentWidth, y);

  // Seller & Buyer Split Section
  const sellerBuyerY = y;
  const halfWidth = contentWidth / 2;

  // Vertical divider between seller & invoice meta
  doc.line(margin + halfWidth, y, margin + halfWidth, y + 36);

  // Seller Details (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(business.business_name, margin + 2, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);

  let sY = y + 7.5;
  if (business.trade_name) {
    doc.text(`(${business.trade_name})`, margin + 2, sY);
    sY += 3.5;
  }
  if (business.address_line1) {
    const addr = `${business.address_line1}${business.city ? ', ' + business.city : ''}${business.pincode ? ' - ' + business.pincode : ''}`;
    doc.text(addr.substring(0, 42), margin + 2, sY);
    sY += 3.5;
  }
  if (business.phone) {
    doc.text(`Mob: ${business.phone}`, margin + 2, sY);
    sY += 3.5;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`GSTIN: ${business.gstin || 'URP / Not Registered'}`, margin + 2, sY);
  sY += 3.5;
  const sellerStateName = STATE_CODES[business.state_code] || business.state_code;
  doc.text(`State: ${sellerStateName} (${business.state_code})`, margin + 2, sY);

  // Invoice Meta Details (Right)
  const rX = margin + halfWidth + 2;
  let rY = y + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const invNo = invoice.invoice_number || invoice.number || 'DRAFT';
  doc.text(`Invoice No: ${invNo}`, rX, rY);
  rY += 4;
  const invDate = invoice.invoice_date || invoice.date || '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Dated: ${invDate}`, rX, rY);
  rY += 3.5;
  doc.text(`Financial Year: ${invoice.financial_year || ''}`, rX, rY);
  rY += 3.5;

  // Buyer Info snapshot
  let customerSnapshot: any = {};
  try {
    customerSnapshot = JSON.parse(invoice.customer_snapshot_json || '{}');
  } catch {
    customerSnapshot = {};
  }

  const buyerStateCode = customerSnapshot.state_code || business.state_code;
  const buyerStateName = STATE_CODES[buyerStateCode] || buyerStateCode;
  doc.text(`Place of Supply: ${buyerStateName} (${buyerStateCode})`, rX, rY);
  rY += 3.5;

  doc.setFont('helvetica', 'bold');
  doc.text(`Billed To (Customer):`, rX, rY);
  rY += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${customerSnapshot.name || 'Counter Customer'}`, rX, rY);
  rY += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  if (customerSnapshot.gstin) {
    doc.text(`GSTIN: ${customerSnapshot.gstin}`, rX, rY);
    rY += 3.5;
  }
  if (customerSnapshot.mobile) {
    doc.text(`Mobile: ${customerSnapshot.mobile}`, rX, rY);
    rY += 3.5;
  }

  y += 36;
  doc.line(margin, y, margin + contentWidth, y);

  // Table Header
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);

  // Column X positions
  const colSno = margin + 1;
  const colDesc = margin + 8;
  const colHsn = margin + 55;
  const colQty = margin + 70;
  const colRate = margin + 84;
  const colTaxable = margin + 100;
  const colTotal = margin + 118;

  doc.text('#', colSno, y + 4.2);
  doc.text('Item Description', colDesc, y + 4.2);
  doc.text('HSN/SAC', colHsn, y + 4.2);
  doc.text('Qty', colQty, y + 4.2);
  doc.text('Rate', colRate, y + 4.2);
  doc.text('Taxable', colTaxable, y + 4.2);
  doc.text('Amount', colTotal, y + 4.2);

  y += 6;
  doc.line(margin, y, margin + contentWidth, y);

  // Table Items
  const items = invoice.items || [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  const tableTopY = y;
  items.forEach((item, idx) => {
    const itemH = 5;
    doc.setTextColor(51, 65, 85);
    doc.text(`${idx + 1}`, colSno, y + 3.8);

    const pName = item.product_name.length > 32 ? item.product_name.substring(0, 31) + '…' : item.product_name;
    doc.setTextColor(15, 23, 42);
    doc.text(pName, colDesc, y + 3.8);

    doc.setTextColor(51, 65, 85);
    doc.text(item.hsn || '-', colHsn, y + 3.8);
    doc.text(`${item.quantity} ${item.unit || ''}`, colQty, y + 3.8);
    doc.text(paiseToRupeeString(item.unit_price_paise), colRate, y + 3.8);
    const lineTaxable = item.taxable_amount_paise ?? item.taxable_paise ?? 0;
    doc.text(paiseToRupeeString(lineTaxable), colTaxable, y + 3.8);
    doc.setFont('helvetica', 'bold');
    doc.text(paiseToRupeeString(item.total_paise), colTotal, y + 3.8);
    doc.setFont('helvetica', 'normal');

    y += itemH;
  });

  // Minimum table height
  const minTableY = tableTopY + 35;
  if (y < minTableY) {
    y = minTableY;
  }

  doc.line(margin, y, margin + contentWidth, y);

  // Vertical grid lines in items table
  doc.line(colDesc - 1, tableTopY - 6, colDesc - 1, y);
  doc.line(colHsn - 1, tableTopY - 6, colHsn - 1, y);
  doc.line(colQty - 1, tableTopY - 6, colQty - 1, y);
  doc.line(colRate - 1, tableTopY - 6, colRate - 1, y);
  doc.line(colTaxable - 1, tableTopY - 6, colTaxable - 1, y);
  doc.line(colTotal - 1, tableTopY - 6, colTotal - 1, y);

  // Tax breakdown & totals
  const isInter = (invoice.is_interstate || 0) === 1;
  const taxableVal = invoice.taxable_total_paise ?? invoice.taxable_paise ?? 0;
  const cgstVal = invoice.cgst_total_paise ?? invoice.cgst_paise ?? 0;
  const sgstVal = invoice.sgst_total_paise ?? invoice.sgst_paise ?? 0;
  const igstVal = invoice.igst_total_paise ?? invoice.igst_paise ?? 0;
  const roundOffVal = invoice.round_off_paise || 0;
  const grandTotalVal = invoice.grand_total_paise;

  const totalsY = y;
  const splitY = totalsY;

  // Left summary: Amount in Words + Bank details
  doc.line(margin + 75, splitY, margin + 75, splitY + 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Amount Chargeable (in words):', margin + 2, splitY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  const words = amountInWords(grandTotalVal);
  const splitWords = doc.splitTextToSize(words, 71);
  doc.text(splitWords, margin + 2, splitY + 8);

  // Bank Info
  let bY = splitY + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Bank & Payment Details:', margin + 2, bY);
  bY += 3.5;
  doc.setFont('helvetica', 'normal');
  if (business.bank_name && business.bank_account_no) {
    doc.text(`Bank: ${business.bank_name} | A/C: ${business.bank_account_no}`, margin + 2, bY);
    bY += 3.2;
    doc.text(`IFSC: ${business.bank_ifsc || '-'}`, margin + 2, bY);
    bY += 3.2;
  }
  if (business.upi_id) {
    doc.text(`UPI ID: ${business.upi_id}`, margin + 2, bY);
  }

  // Right summary: Mathematical Tax & Total breakdown
  const rTotX = margin + 77;
  const rValX = margin + contentWidth - 2;
  let totRowY = splitY + 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text('Taxable Subtotal:', rTotX, totRowY);
  doc.text(`₹ ${paiseToRupeeString(taxableVal)}`, rValX, totRowY, { align: 'right' });
  totRowY += 4.5;

  if (isInter) {
    doc.text('Integrated GST (IGST):', rTotX, totRowY);
    doc.text(`₹ ${paiseToRupeeString(igstVal)}`, rValX, totRowY, { align: 'right' });
    totRowY += 4.5;
  } else {
    doc.text('Central GST (CGST):', rTotX, totRowY);
    doc.text(`₹ ${paiseToRupeeString(cgstVal)}`, rValX, totRowY, { align: 'right' });
    totRowY += 4.5;
    doc.text('State GST (SGST):', rTotX, totRowY);
    doc.text(`₹ ${paiseToRupeeString(sgstVal)}`, rValX, totRowY, { align: 'right' });
    totRowY += 4.5;
  }

  if (roundOffVal !== 0) {
    doc.text('Round Off:', rTotX, totRowY);
    const roStr = roundOffVal > 0 ? `+${paiseToRupeeString(roundOffVal)}` : paiseToRupeeString(roundOffVal);
    doc.text(`₹ ${roStr}`, rValX, totRowY, { align: 'right' });
    totRowY += 4.5;
  }

  // Grand total divider
  doc.line(margin + 75, totRowY - 1, margin + contentWidth, totRowY - 1);
  totRowY += 3.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Grand Total:', rTotX, totRowY);
  doc.text(`₹ ${paiseToRupeeString(grandTotalVal)}`, rValX, totRowY, { align: 'right' });

  y = splitY + 36;
  doc.line(margin, y, margin + contentWidth, y);

  // Footer Section: Terms and Signatory
  const footerY = y;
  doc.line(margin + 80, footerY, margin + 80, pageHeight - margin);

  // Terms
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Terms & Conditions:', margin + 2, footerY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('1. Goods once sold will not be taken back or exchanged.', margin + 2, footerY + 7.5);
  doc.text('2. Warranty as per manufacturer terms only.', margin + 2, footerY + 10.5);
  doc.text('3. Subject to local jurisdiction only.', margin + 2, footerY + 13.5);

  // Signatory
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`For ${business.business_name}`, margin + 83, footerY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Authorized Signatory', margin + 83, pageHeight - margin - 3);

  return doc;
}

export function downloadInvoicePdf(invoice: Invoice, business: BusinessSettings): void {
  const doc = generateInvoicePdf(invoice, business);
  const invNo = (invoice.invoice_number || invoice.number || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${invNo}.pdf`);
}
