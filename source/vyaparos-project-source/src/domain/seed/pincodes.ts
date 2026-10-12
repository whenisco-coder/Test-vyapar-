/**
 * Indian Pincode Prefix to State Code Mapping
 * Matches the first 2 digits of a 6-digit PIN code to the 2-digit GST state code.
 */

export const PINCODE_PREFIX_TO_STATE_CODE: Record<string, string> = {
  // Delhi
  '11': '07',
  // Haryana
  '12': '06',
  '13': '06',
  // Punjab
  '14': '03',
  '15': '03',
  '16': '04', // Chandigarh
  // Himachal Pradesh
  '17': '02',
  // Jammu & Kashmir & Ladakh
  '18': '01',
  '19': '01',
  // Uttar Pradesh
  '20': '09',
  '21': '09',
  '22': '09',
  '23': '09',
  '24': '05', // Uttarakhand / Western UP
  '25': '09',
  '26': '05', // Uttarakhand
  '27': '09',
  '28': '09',
  // Rajasthan
  '30': '08',
  '31': '08',
  '32': '08',
  '33': '08',
  '34': '08',
  // Gujarat
  '36': '24',
  '37': '24',
  '38': '24',
  '39': '24',
  // Maharashtra & Goa
  '40': '27',
  '41': '27',
  '42': '27',
  '43': '27',
  '44': '27',
  '403': '30', // Goa postal sub-prefix
  // Madhya Pradesh & Chhattisgarh
  '45': '23',
  '46': '23',
  '47': '23',
  '48': '23',
  '49': '22', // Chhattisgarh
  // Andhra Pradesh & Telangana
  '50': '36', // Telangana
  '51': '37', // Andhra Pradesh
  '52': '37',
  '53': '37',
  // Karnataka
  '56': '29',
  '57': '29',
  '58': '29',
  '59': '29',
  // Tamil Nadu & Puducherry
  '60': '33',
  '61': '33',
  '62': '33',
  '63': '33',
  '64': '33',
  // Kerala
  '67': '32',
  '68': '32',
  '69': '32',
  // West Bengal, Sikkim & Andaman
  '70': '19',
  '71': '19',
  '72': '19',
  '73': '19',
  '74': '19',
  '737': '11', // Sikkim
  '744': '35', // Andaman & Nicobar
  // North East
  '78': '18', // Assam
  '79': '18',
  // Odisha
  '75': '21',
  '76': '21',
  '77': '21',
  // Bihar & Jharkhand
  '80': '10', // Bihar
  '81': '10',
  '82': '20', // Jharkhand
  '83': '20',
  '84': '10',
  '85': '10',
};

/**
 * Returns the 2-digit GST state code from a 6-digit Indian pincode
 */
export function getStateCodeFromPincode(pincode: string): string | null {
  if (!pincode) return null;
  const clean = pincode.trim().replace(/\D/g, '');
  if (clean.length < 2) return null;

  // Check 3-digit sub-prefixes first
  if (clean.length >= 3) {
    const sub = clean.slice(0, 3);
    if (PINCODE_PREFIX_TO_STATE_CODE[sub]) {
      return PINCODE_PREFIX_TO_STATE_CODE[sub];
    }
  }

  const prefix2 = clean.slice(0, 2);
  return PINCODE_PREFIX_TO_STATE_CODE[prefix2] || null;
}
