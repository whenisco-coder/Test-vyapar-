export interface GstRateOption {
  rateBp: number;
  label: string;
  percentage: number;
}

export const GST_RATES: GstRateOption[] = [
  { rateBp: 0, label: '0% (Exempt)', percentage: 0 },
  { rateBp: 500, label: '5% GST', percentage: 5 },
  { rateBp: 1200, label: '12% GST', percentage: 12 },
  { rateBp: 1800, label: '18% GST', percentage: 18 },
  { rateBp: 2800, label: '28% GST', percentage: 28 },
];
