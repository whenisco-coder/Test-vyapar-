import { describe, it, expect } from 'vitest';
import { validateGSTIN, isInterstate, calcLineTax, parseAddressBlock } from '../src/domain/gst';

describe('GST Calculation & GSTIN Validation', () => {
  it('validates authentic Indian GSTINs with mod-36 checksum', () => {
    // Standard valid GSTINs:
    // 27AAPFU0939F1ZV (Maharashtra - 27)
    const valid1 = validateGSTIN('27AAPFU0939F1ZV');
    expect(valid1.valid).toBe(true);
    expect(valid1.stateCode).toBe('27');

    // 29ABCDE1234F1ZW (Karnataka - 29)
    const valid2 = validateGSTIN('29ABCDE1234F1ZW');
    expect(valid2.valid).toBe(true);
    expect(valid2.stateCode).toBe('29');
  });

  it('rejects invalid, truncated, or tampered GSTINs', () => {
    // Wrong length
    expect(validateGSTIN('27AAPFU0939F1Z').valid).toBe(false);

    // Invalid state code
    expect(validateGSTIN('99AAPFU0939F1ZV').valid).toBe(false);

    // A plausible-looking sample must not bypass the checksum check.
    const invalidSample = validateGSTIN('29ABCDE1234F1Z5');
    expect(invalidSample.valid).toBe(false);
    expect(invalidSample.error).toContain('checksum mismatch');

    // Tampered checksum character (changed last char from V to X)
    const tampered = validateGSTIN('27AAPFU0939F1ZX');
    expect(tampered.valid).toBe(false);
    expect(tampered.error).toContain('checksum mismatch');
  });

  it('correctly splits intra-state (CGST+SGST) and inter-state (IGST) tax', () => {
    // Intra-state (Seller 27 Maharashtra, Buyer 27 Maharashtra)
    expect(isInterstate('27', '27')).toBe(false);
    const intra = calcLineTax(100000, 1800, false);
    expect(intra.taxPaise).toBe(18000);
    expect(intra.cgstPaise).toBe(9000);
    expect(intra.sgstPaise).toBe(9000);
    expect(intra.igstPaise).toBe(0);
    expect(intra.cgstPaise + intra.sgstPaise).toBe(intra.taxPaise);

    // Inter-state (Seller 27 Maharashtra, Buyer 29 Karnataka)
    expect(isInterstate('27', '29')).toBe(true);
    const inter = calcLineTax(100000, 1800, true);
    expect(inter.taxPaise).toBe(18000);
    expect(inter.cgstPaise).toBe(0);
    expect(inter.sgstPaise).toBe(0);
    expect(inter.igstPaise).toBe(18000);
  });

  it('parses pasted raw address blocks into structured customer details', () => {
    const raw = `
      Sharma Auto Spares
      Plot 42, MIDC Industrial Area,
      Near Water Tank, Pune 411018
      GSTIN: 27AAPFU0939F1ZV
      Mobile: +91 9822012345
    `;
    const parsed = parseAddressBlock(raw);
    expect(parsed.name).toContain('Sharma Auto Spares');
    expect(parsed.gstin).toBe('27AAPFU0939F1ZV');
    expect(parsed.stateCode).toBe('27');
    expect(parsed.pincode).toBe('411018');
    expect(parsed.mobile).toBe('9822012345');
  });
});
