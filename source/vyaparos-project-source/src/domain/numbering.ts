/**
 * Invoice Numbering and Financial Year Module
 * 
 * Rules:
 * 1. Financial year in India runs April 1st to March 31st.
 * 2. Series format: {prefix}/{fy}/{seq} (e.g., INV/2627/0001).
 * 3. Sequence numbers are strictly consecutive without gaps and reset every FY.
 * 4. Cancelled invoices retain their number permanently.
 * 5. Total length <= 16 characters, only alphanumeric, '/' and '-'.
 */

export function getFinancialYearCode(dateStr: string, fyStartMonth: number = 4): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  let startYear = year;
  let endYear = year + 1;

  if (month < fyStartMonth) {
    startYear = year - 1;
    endYear = year;
  }

  const startYearShort = (startYear % 100).toString().padStart(2, '0');
  const endYearShort = (endYear % 100).toString().padStart(2, '0');

  return `${startYearShort}${endYearShort}`;
}

export const getIndianFinancialYearCode = getFinancialYearCode;

export function formatInvoiceNumber(
  prefix: string,
  fyCode: string,
  sequenceNumber: number
): string {
  // Validate prefix
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'INV';
  const seqPadded = sequenceNumber.toString().padStart(4, '0');
  const invNumber = `${cleanPrefix}/${fyCode}/${seqPadded}`;

  if (invNumber.length > 16) {
    // If prefix is too long, truncate it
    const maxPrefixLen = Math.max(1, 16 - (fyCode.length + seqPadded.length + 2));
    const truncatedPrefix = cleanPrefix.substring(0, maxPrefixLen);
    return `${truncatedPrefix}/${fyCode}/${seqPadded}`;
  }

  return invNumber;
}

export function validateInvoiceNumber(invNum: string): boolean {
  if (invNum.length === 0 || invNum.length > 16) return false;
  return /^[A-Z0-9/-]+$/i.test(invNum);
}
