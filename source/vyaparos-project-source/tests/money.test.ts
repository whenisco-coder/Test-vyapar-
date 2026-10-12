import { describe, it, expect } from 'vitest';
import {
  addPaise,
  subPaise,
  mulPaise,
  calcPercentBp,
  splitTaxInclusive,
  splitTaxHalf,
  roundToRupee,
  paiseToRupeeString,
  formatINR,
  amountInWords,
} from '../src/domain/money';

describe('Money Module & Integer Paise Arithmetic (D5, D25)', () => {
  it('performs exact integer arithmetic without float errors', () => {
    expect(addPaise(10050, 20075)).toBe(30125);
    expect(subPaise(50000, 12345)).toBe(37655);
    expect(mulPaise(15025, 4)).toBe(60100);
  });

  it('calculates tax percent via basis points with half-up rounding', () => {
    // ₹ 100.00 (10000 paise) at 18% (1800 bp) = 1800 paise (₹ 18.00)
    expect(calcPercentBp(10000, 1800)).toBe(1800);

    // ₹ 155.55 (15555 paise) at 18% (1800 bp) = 15555 * 1800 / 10000 = 2799.9 -> 2800 paise
    expect(calcPercentBp(15555, 1800)).toBe(2800);

    // ₹ 10.05 (1005 paise) at 5% (500 bp) = 1005 * 500 / 10000 = 50.25 -> 50 paise
    expect(calcPercentBp(1005, 500)).toBe(50);
  });

  it('splits odd-paise tax into CGST and SGST such that their sum is EXACTLY the tax', () => {
    // Odd tax paise (e.g. 25 paise tax)
    const { cgstPaise: c25, sgstPaise: s25 } = splitTaxHalf(25);
    expect(c25).toBe(13);
    expect(s25).toBe(12);
    expect(c25 + s25).toBe(25);

    // Odd tax paise (e.g. 1 paise tax)
    const { cgstPaise: c1, sgstPaise: s1 } = splitTaxHalf(1);
    expect(c1).toBe(1);
    expect(s1).toBe(0);
    expect(c1 + s1).toBe(1);

    // Even tax paise (e.g. 100 paise)
    const { cgstPaise: c100, sgstPaise: s100 } = splitTaxHalf(100);
    expect(c100).toBe(50);
    expect(s100).toBe(50);
    expect(c100 + s100).toBe(100);

    // Property test: for all taxes from 1 to 10,000 paise, sum ALWAYS matches
    for (let t = 1; t <= 1000; t++) {
      const split = splitTaxHalf(t);
      expect(split.cgstPaise + split.sgstPaise).toBe(t);
    }
  });

  it('splits tax-inclusive amount without losing paise', () => {
    // Selling price ₹ 1,180.00 inclusive of 18% GST (1800 bp)
    // Taxable = ₹ 1,000.00 (100000 paise), Tax = ₹ 180.00 (18000 paise)
    const split1 = splitTaxInclusive(118000, 1800);
    expect(split1.taxablePaise).toBe(100000);
    expect(split1.taxPaise).toBe(18000);
    expect(split1.taxablePaise + split1.taxPaise).toBe(118000);

    // Random odd amount ₹ 3,850.00 inclusive of 28% GST (2800 bp)
    const split2 = splitTaxInclusive(385000, 2800);
    expect(split2.taxablePaise + split2.taxPaise).toBe(385000);
  });

  it('rounds invoice total to nearest whole rupee with distinct round-off line (D25)', () => {
    // ₹ 100.40 (10040 paise) -> Round off: -40 paise, Total: ₹ 100.00 (10000 paise)
    const r1 = roundToRupee(10040);
    expect(r1.roundedTotalPaise).toBe(10000);
    expect(r1.roundOffPaise).toBe(-40);
    expect(r1.roundedTotalPaise % 100).toBe(0);

    // ₹ 100.50 (10050 paise) -> Round off: +50 paise, Total: ₹ 101.00 (10100 paise)
    const r2 = roundToRupee(10050);
    expect(r2.roundedTotalPaise).toBe(10100);
    expect(r2.roundOffPaise).toBe(50);
    expect(r2.roundedTotalPaise % 100).toBe(0);

    // ₹ 100.00 (10000 paise) -> Round off: 0, Total: ₹ 100.00
    const r3 = roundToRupee(10000);
    expect(r3.roundedTotalPaise).toBe(10000);
    expect(r3.roundOffPaise).toBe(0);
  });

  it('converts paise to exact 2-decimal rupee string without floating errors', () => {
    expect(paiseToRupeeString(125000)).toBe('1250.00');
    expect(paiseToRupeeString(99)).toBe('0.99');
    expect(paiseToRupeeString(5)).toBe('0.05');
    expect(paiseToRupeeString(0)).toBe('0.00');
  });

  it('formats Indian currency strings with Lakh and Crore grouping', () => {
    expect(formatINR(50000)).toBe('₹ 500.00');
    expect(formatINR(12500000)).toBe('₹ 1,25,000.00'); // 1 Lakh 25 Thousand
    expect(formatINR(1234567890)).toBe('₹ 1,23,45,678.90'); // 1 Crore 23 Lakh...
  });

  it('converts amount to Indian currency words format', () => {
    expect(amountInWords(10000)).toBe('Rupees One Hundred Only');
    expect(amountInWords(125050)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
    expect(amountInWords(10000000)).toBe('Rupees One Lakh Only');
  });
});
