import { describe, it, expect } from 'vitest';
import {
  getFinancialYearCode,
  formatInvoiceNumber,
  validateInvoiceNumber,
} from '../src/domain/numbering';

describe('Invoice Numbering & Financial Year Engine (D10)', () => {
  it('correctly calculates Indian financial year codes (April to March)', () => {
    // 15 April 2026 -> FY 2026-27 -> '2627'
    expect(getFinancialYearCode('2026-04-15')).toBe('2627');

    // 10 October 2026 -> FY 2026-27 -> '2627'
    expect(getFinancialYearCode('2026-10-10')).toBe('2627');

    // 28 February 2027 -> FY 2026-27 -> '2627'
    expect(getFinancialYearCode('2027-02-28')).toBe('2627');

    // 31 March 2027 -> FY 2026-27 -> '2627'
    expect(getFinancialYearCode('2027-03-31')).toBe('2627');

    // 1 April 2027 -> FY 2027-28 -> '2728' (Reset)
    expect(getFinancialYearCode('2027-04-01')).toBe('2728');
  });

  it('formats consecutive, gapless invoice numbers strictly <= 16 characters', () => {
    const num1 = formatInvoiceNumber('INV', '2627', 1);
    expect(num1).toBe('INV/2627/0001');
    expect(num1.length).toBeLessThanOrEqual(16);
    expect(validateInvoiceNumber(num1)).toBe(true);

    const num9999 = formatInvoiceNumber('INV', '2627', 9999);
    expect(num9999).toBe('INV/2627/9999');
    expect(num9999.length).toBeLessThanOrEqual(16);
  });
});
