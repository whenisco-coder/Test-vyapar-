import { calcPercentBp, splitTaxHalf } from './money';
import { STATE_CODE_MAP, getStateCodeFromPincode, INDIAN_STATES } from './data/states';

export const STATE_CODES: Record<string, string> = Object.fromEntries(
  INDIAN_STATES.map((s) => [s.code, s.name])
);

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function calculateLineGst(
  arg1: any,
  rateBp?: number,
  interstate?: boolean
): {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalTaxPaise: number;
  totalPaise: number;
} {
  if (typeof arg1 === 'object' && arg1 !== null) {
    const rawTotal = (arg1.quantity || 1) * (arg1.unitPricePaise || 0);
    const isInter = !!(arg1.isInterState || arg1.isInterstate);
    const res = calcLineTax(rawTotal, arg1.gstRateBp || 0, isInter);
    return {
      ...res,
      totalTaxPaise: res.taxPaise,
      totalPaise: res.taxablePaise + res.taxPaise,
    };
  }
  const taxablePaise = typeof arg1 === 'number' ? arg1 : 0;
  const res = calcLineTax(taxablePaise, rateBp || 0, interstate || false);
  return {
    ...res,
    totalTaxPaise: res.taxPaise,
    totalPaise: res.taxablePaise + res.taxPaise,
  };
}

/**
 * Validates a 15-character Indian Goods and Services Tax Identification Number (GSTIN)
 * Includes format regex, state code validation, and mod-36 checksum verification.
 */
export function validateGSTIN(gstinRaw: string): {
  valid: boolean;
  isValid?: boolean;
  stateCode?: string;
  error?: string;
} {
  if (!gstinRaw) {
    return { valid: false, error: 'GSTIN is required' };
  }
  const gstin = gstinRaw.trim().toUpperCase();

  if (gstin.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 characters' };
  }

  // Regex format: 2 digits (state), 5 letters, 4 digits, 1 letter (PAN), 1 alphanumeric, 1 'Z', 1 check char
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(gstin)) {
    return { valid: false, error: 'Invalid GSTIN structure or format' };
  }

  // State code verification
  const stateCode = gstin.substring(0, 2);
  if (!STATE_CODE_MAP.has(stateCode)) {
    return { valid: false, error: `Invalid GST state code: ${stateCode}` };
  }

  // Checksum calculation (Standard GST Modulo 36 algorithm)
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const char = gstin[i];
    const charVal = GST_CHARS.indexOf(char);
    if (charVal === -1) {
      return { valid: false, error: 'Invalid characters in GSTIN' };
    }
    const factor = i % 2 === 0 ? 1 : 2;
    const product = charVal * factor;
    // Quotient + remainder in base 36
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;
    sum += quotient + remainder;
  }

  const remainderTotal = sum % 36;
  const checkDigitIndex = (36 - remainderTotal) % 36;
  const expectedCheckChar = GST_CHARS[checkDigitIndex];

  // Never bypass checksum validation for examples or commonly copied sample GSTINs.
  if (gstin[14] !== expectedCheckChar) {
    return {
      valid: false,
      isValid: false,
      stateCode,
      error: `GSTIN checksum mismatch (expected ${expectedCheckChar}, got ${gstin[14]})`,
    };
  }

  return { valid: true, isValid: true, stateCode };
}

/**
 * Determine if transaction is interstate
 */
export function isInterstate(sellerStateCode: string, buyerStateCode: string): boolean {
  return sellerStateCode.trim() !== buyerStateCode.trim();
}

/**
 * Calculate tax for a line item
 */
export function calcLineTax(
  taxablePaise: number,
  rateBp: number,
  interstate: boolean
): {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
} {
  const taxPaise = calcPercentBp(taxablePaise, rateBp);

  if (interstate) {
    return {
      taxablePaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: taxPaise,
      taxPaise,
    };
  } else {
    const { cgstPaise, sgstPaise } = splitTaxHalf(taxPaise);
    return {
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise: 0,
      taxPaise,
    };
  }
}

/**
 * Helper to parse a multi-line address block pasted by user
 * Extracts name, mobile, GSTIN, pincode, city, state.
 */
export function parseAddressBlock(text: string): {
  name?: string;
  mobile?: string;
  gstin?: string;
  pincode?: string;
  city?: string;
  stateCode?: string;
  addressLines: string[];
} {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let gstin: string | undefined;
  let mobile: string | undefined;
  let pincode: string | undefined;
  let stateCode: string | undefined;
  const remainingLines: string[] = [];

  for (const line of lines) {
    // GSTIN check
    const gstinMatch = line.match(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/i);
    if (gstinMatch && !gstin) {
      gstin = gstinMatch[0].toUpperCase();
      stateCode = gstin.substring(0, 2);
      continue;
    }

    // Mobile check (Indian 10-digit mobile)
    const mobileMatch = line.match(/(?:\+91[- ]?)?[6-9]\d{9}\b/);
    if (mobileMatch && !mobile) {
      mobile = mobileMatch[0].replace(/\D/g, '').slice(-10);
      continue;
    }

    // Pincode check (6 digits)
    const pinMatch = line.match(/\b[1-9][0-9]{5}\b/);
    if (pinMatch && !pincode) {
      pincode = pinMatch[0];
      if (!stateCode) {
        stateCode = getStateCodeFromPincode(pincode);
      }
    }

    remainingLines.push(line);
  }

  const name = remainingLines.length > 0 ? remainingLines[0] : undefined;
  const addressLines = remainingLines.length > 1 ? remainingLines.slice(1) : [];

  return {
    name,
    mobile,
    gstin,
    pincode,
    stateCode,
    addressLines,
  };
}
