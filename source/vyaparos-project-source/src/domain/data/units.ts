export const STANDARD_UNITS = [
  'NOS',
  'SET',
  'PCS',
  'KGS',
  'LTR',
  'MTR',
  'PKT',
  'BDL',
  'DOZ',
  'PRS',
  'ROL',
] as const;

export type StandardUnit = typeof STANDARD_UNITS[number];
