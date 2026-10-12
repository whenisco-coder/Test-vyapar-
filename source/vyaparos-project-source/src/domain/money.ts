/**
 * Money and Currency Arithmetic Module
 * 
 * Rules:
 * 1. All amounts are integer paise (1 Rupee = 100 paise).
 * 2. Floating-point numbers are strictly forbidden in financial calculations.
 * 3. Rounding is half-up on paise.
 * 4. Odd-paise CGST/SGST splits MUST sum exactly to total tax.
 */

/** Add integer paise */
export function addPaise(...amounts: number[]): number {
  return amounts.reduce((acc, curr) => {
    if (!Number.isInteger(curr)) {
      throw new TypeError(`Expected integer paise, got ${curr}`);
    }
    return acc + curr;
  }, 0);
}

/** Subtract integer paise (a - b) */
export function subPaise(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new TypeError(`Expected integer paise, got ${a}, ${b}`);
  }
  return a - b;
}

/** Multiply unit paise by integer quantity */
export function mulPaise(unitPaise: number, quantity: number): number {
  if (!Number.isInteger(unitPaise) || !Number.isInteger(quantity)) {
    throw new TypeError(`Expected integer values, got unit: ${unitPaise}, qty: ${quantity}`);
  }
  return unitPaise * quantity;
}

/**
 * Calculate percentage on paise given basis points (1% = 100 bp, 18% = 1800 bp)
 * Uses half-up rounding on paise:
 * result = floor((amountPaise * rateBp + 5000) / 10000)
 */
export function calcPercentBp(amountPaise: number, rateBp: number): number {
  if (!Number.isInteger(amountPaise) || !Number.isInteger(rateBp)) {
    throw new TypeError(`Expected integers, got amount: ${amountPaise}, rateBp: ${rateBp}`);
  }
  if (amountPaise === 0 || rateBp === 0) return 0;
  // Half-up rounding for positive values
  if (amountPaise >= 0) {
    return Math.floor((amountPaise * rateBp + 5000) / 10000);
  } else {
    return -Math.floor((-amountPaise * rateBp + 5000) / 10000);
  }
}

/**
 * Split tax-inclusive amount into taxable amount and tax in paise without losing any paise.
 * taxable = round(inclusive * 10000 / (10000 + rateBp))
 * tax = inclusive - taxable
 */
export function splitTaxInclusive(
  inclusivePaise: number,
  rateBp: number
): { taxablePaise: number; taxPaise: number } {
  if (!Number.isInteger(inclusivePaise) || !Number.isInteger(rateBp)) {
    throw new TypeError(`Expected integers, got inclusive: ${inclusivePaise}, rateBp: ${rateBp}`);
  }
  if (inclusivePaise <= 0 || rateBp <= 0) {
    return { taxablePaise: inclusivePaise, taxPaise: 0 };
  }

  const denominator = 10000 + rateBp;
  // Integer arithmetic half-up division: floor((num + denom/2) / denom)
  const numerator = inclusivePaise * 10000;
  const taxablePaise = Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
  const taxPaise = inclusivePaise - taxablePaise;

  return { taxablePaise, taxPaise };
}

/**
 * Split tax into CGST and SGST halves.
 * Odd paise rule: CGST receives ceil(tax / 2), SGST receives floor(tax / 2).
 * Guarantees cgstPaise + sgstPaise === taxPaise at all times.
 */
export function splitTaxHalf(taxPaise: number): { cgstPaise: number; sgstPaise: number } {
  if (!Number.isInteger(taxPaise)) {
    throw new TypeError(`Expected integer tax paise, got ${taxPaise}`);
  }
  const cgstPaise = Math.ceil(taxPaise / 2);
  const sgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise, sgstPaise };
}

/**
 * Round total paise to the nearest whole rupee.
 * Returns the rounded total and the explicit roundOff line.
 * If total is ₹ 100.40 (10040 paise): roundOff is -40 paise, rounded is 10000 paise.
 * If total is ₹ 100.50 (10050 paise): roundOff is +50 paise, rounded is 10100 paise.
 */
export function roundToRupee(paise: number): { roundedTotalPaise: number; roundOffPaise: number } {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`Expected integer paise, got ${paise}`);
  }
  const mod = paise % 100;
  let roundOffPaise = 0;
  if (mod >= 50) {
    roundOffPaise = 100 - mod;
  } else if (mod > 0) {
    roundOffPaise = -mod;
  }
  const roundedTotalPaise = paise + roundOffPaise;
  return { roundedTotalPaise, roundOffPaise };
}

/**
 * Format integer paise into exact rupee string with 2 decimals without floating point inaccuracy.
 * e.g. 125000 -> "1250.00", 99 -> "0.99", 5 -> "0.05"
 */
export function paiseToRupeeString(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new TypeError(`Expected integer paise, got ${paise}`);
  }
  const isNegative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainderPaise = abs % 100;
  const paddedPaise = remainderPaise.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${rupees}.${paddedPaise}`;
}

/**
 * Format paise into Indian Lakh/Crore currency string (e.g. "₹ 1,23,456.78")
 * Strictly uses integer string manipulation, no floats.
 */
export function formatINR(paise: number, compactPrefix: boolean = false): string {
  if (!Number.isInteger(paise)) {
    return compactPrefix ? '₹0.00' : '₹ 0.00';
  }
  const isNegative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainderPaise = (abs % 100).toString().padStart(2, '0');

  const rupeesStr = rupees.toString();
  let formattedRupees = '';

  if (rupeesStr.length <= 3) {
    formattedRupees = rupeesStr;
  } else {
    // Last 3 digits (hundreds)
    const last3 = rupeesStr.substring(rupeesStr.length - 3);
    const rest = rupeesStr.substring(0, rupeesStr.length - 3);
    // Group preceding digits in pairs of 2 (thousands, lakhs, crores)
    const chunks: string[] = [];
    let rem = rest;
    while (rem.length > 2) {
      chunks.unshift(rem.substring(rem.length - 2));
      rem = rem.substring(0, rem.length - 2);
    }
    if (rem.length > 0) {
      chunks.unshift(rem);
    }
    formattedRupees = `${chunks.join(',')},${last3}`;
  }

  const symbol = compactPrefix ? '₹' : '₹ ';
  return `${isNegative ? '-' : ''}${symbol}${formattedRupees}.${remainderPaise}`;
}

// Number to Words for Indian Currency
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertBelowThousand(n: number): string {
  let str = '';
  if (n >= 100) {
    str += `${ONES[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    str += `${TENS[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) {
    str += `${ONES[n]} `;
  }
  return str.trim();
}

/**
 * Convert integer paise to Indian standard words format
 * e.g., "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Five Paise Only"
 */
export function amountInWords(paise: number): string {
  if (!Number.isInteger(paise)) return 'Zero Rupees Only';
  if (paise === 0) return 'Zero Rupees Only';

  const abs = Math.abs(paise);
  let rupees = Math.floor(abs / 100);
  const p = abs % 100;

  if (rupees === 0 && p === 0) return 'Zero Rupees Only';

  let result = '';

  if (rupees > 0) {
    const crore = Math.floor(rupees / 10000000);
    rupees %= 10000000;

    const lakh = Math.floor(rupees / 100000);
    rupees %= 100000;

    const thousand = Math.floor(rupees / 1000);
    rupees %= 1000;

    const remainder = rupees;

    if (crore > 0) {
      result += `${convertBelowThousand(crore)} Crore `;
    }
    if (lakh > 0) {
      result += `${convertBelowThousand(lakh)} Lakh `;
    }
    if (thousand > 0) {
      result += `${convertBelowThousand(thousand)} Thousand `;
    }
    if (remainder > 0) {
      result += `${convertBelowThousand(remainder)} `;
    }
    result = `Rupees ${result.trim()}`;
  }

  if (p > 0) {
    const paiseText = `${convertBelowThousand(p)} Paise`;
    if (result.length > 0) {
      result = `${result} and ${paiseText}`;
    } else {
      result = paiseText;
    }
  }

  return `${result.trim()} Only`;
}

export const Money = {
  add: addPaise,
  subtract: subPaise,
  multiply: mulPaise,
  calcTax: calcPercentBp,
  splitTaxInclusive,
  splitCgstSgst: splitTaxHalf,
  calcRoundOff: (paise: number) => {
    const r = roundToRupee(paise);
    return { roundOffPaise: r.roundOffPaise, grandTotalPaise: r.roundedTotalPaise };
  },
  formatINR,
  amountInWords,
};


