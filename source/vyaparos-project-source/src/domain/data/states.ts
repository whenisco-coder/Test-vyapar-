export interface IndianState {
  code: string;
  name: string;
  type: 'state' | 'ut';
}

export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir', type: 'ut' },
  { code: '02', name: 'Himachal Pradesh', type: 'state' },
  { code: '03', name: 'Punjab', type: 'state' },
  { code: '04', name: 'Chandigarh', type: 'ut' },
  { code: '05', name: 'Uttarakhand', type: 'state' },
  { code: '06', name: 'Haryana', type: 'state' },
  { code: '07', name: 'Delhi', type: 'ut' },
  { code: '08', name: 'Rajasthan', type: 'state' },
  { code: '09', name: 'Uttar Pradesh', type: 'state' },
  { code: '10', name: 'Bihar', type: 'state' },
  { code: '11', name: 'Sikkim', type: 'state' },
  { code: '12', name: 'Arunachal Pradesh', type: 'state' },
  { code: '13', name: 'Nagaland', type: 'state' },
  { code: '14', name: 'Manipur', type: 'state' },
  { code: '15', name: 'Mizoram', type: 'state' },
  { code: '16', name: 'Tripura', type: 'state' },
  { code: '17', name: 'Meghalaya', type: 'state' },
  { code: '18', name: 'Assam', type: 'state' },
  { code: '19', name: 'West Bengal', type: 'state' },
  { code: '20', name: 'Jharkhand', type: 'state' },
  { code: '21', name: 'Odisha', type: 'state' },
  { code: '22', name: 'Chhattisgarh', type: 'state' },
  { code: '23', name: 'Madhya Pradesh', type: 'state' },
  { code: '24', name: 'Gujarat', type: 'state' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu', type: 'ut' },
  { code: '27', name: 'Maharashtra', type: 'state' },
  { code: '28', name: 'Andhra Pradesh', type: 'state' },
  { code: '29', name: 'Karnataka', type: 'state' },
  { code: '30', name: 'Goa', type: 'state' },
  { code: '31', name: 'Lakshadweep', type: 'ut' },
  { code: '32', name: 'Kerala', type: 'state' },
  { code: '33', name: 'Tamil Nadu', type: 'state' },
  { code: '34', name: 'Puducherry', type: 'ut' },
  { code: '35', name: 'Andaman and Nicobar Islands', type: 'ut' },
  { code: '36', name: 'Telangana', type: 'state' },
  { code: '37', name: 'Andhra Pradesh (New)', type: 'state' },
  { code: '38', name: 'Ladakh', type: 'ut' },
  { code: '97', name: 'Other Territory', type: 'ut' },
];

export const STATE_CODE_MAP = new Map<string, string>(
  INDIAN_STATES.map((s) => [s.code, s.name])
);

// Common Indian Pincode 2-digit prefix to State Code mapping
export const PINCODE_PREFIX_TO_STATE: Record<string, string> = {
  '11': '07', // Delhi
  '12': '06', // Haryana
  '13': '06', // Haryana
  '14': '03', // Punjab
  '15': '03', // Punjab
  '16': '04', // Chandigarh
  '17': '02', // Himachal Pradesh
  '18': '01', // Jammu and Kashmir
  '19': '01', // Jammu and Kashmir
  '20': '09', // Uttar Pradesh
  '21': '09', // Uttar Pradesh
  '22': '09', // Uttar Pradesh
  '23': '09', // Uttar Pradesh
  '24': '05', // Uttarakhand / UP
  '25': '09', // Uttar Pradesh
  '26': '05', // Uttarakhand
  '27': '09', // Uttar Pradesh
  '28': '09', // Uttar Pradesh
  '30': '08', // Rajasthan
  '31': '08', // Rajasthan
  '32': '08', // Rajasthan
  '33': '08', // Rajasthan
  '34': '08', // Rajasthan
  '36': '24', // Gujarat
  '37': '24', // Gujarat
  '38': '24', // Gujarat
  '39': '24', // Gujarat
  '40': '27', // Maharashtra
  '41': '27', // Maharashtra
  '42': '27', // Maharashtra
  '43': '27', // Maharashtra
  '44': '27', // Maharashtra
  '45': '23', // Madhya Pradesh
  '46': '23', // Madhya Pradesh
  '47': '23', // Madhya Pradesh
  '48': '23', // Madhya Pradesh
  '49': '22', // Chhattisgarh
  '50': '36', // Telangana
  '51': '28', // Andhra Pradesh
  '52': '28', // Andhra Pradesh
  '53': '28', // Andhra Pradesh
  '56': '29', // Karnataka
  '57': '29', // Karnataka
  '58': '29', // Karnataka
  '59': '29', // Karnataka
  '60': '33', // Tamil Nadu
  '61': '33', // Tamil Nadu
  '62': '33', // Tamil Nadu
  '63': '33', // Tamil Nadu
  '64': '33', // Tamil Nadu
  '67': '32', // Kerala
  '68': '32', // Kerala
  '69': '32', // Kerala
  '70': '19', // West Bengal
  '71': '19', // West Bengal
  '72': '19', // West Bengal
  '73': '19', // West Bengal
  '74': '19', // West Bengal
  '75': '21', // Odisha
  '76': '21', // Odisha
  '77': '21', // Odisha
  '78': '18', // Assam
  '79': '12', // North East (Arunachal/Manipur/Nagaland etc)
  '80': '10', // Bihar
  '81': '10', // Bihar
  '82': '20', // Jharkhand
  '83': '20', // Jharkhand
  '84': '10', // Bihar
  '85': '10', // Bihar
};

export function getStateCodeFromPincode(pincode: string): string | undefined {
  const clean = pincode.trim().replace(/\D/g, '');
  if (clean.length < 2) return undefined;
  const prefix = clean.substring(0, 2);
  return PINCODE_PREFIX_TO_STATE[prefix];
}
