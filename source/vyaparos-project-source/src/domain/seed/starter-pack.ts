/**
 * Starter Pack Data: Tyre & Auto Spares Retail/Wholesale
 * Units, categories, standard GST rates, and common starter products.
 */

export interface StarterProduct {
  name: string;
  sku: string;
  hsn: string;
  category: string;
  unit: string;
  gst_rate_bp: number;
  selling_price_paise: number;
  mrp_paise: number;
  price_includes_tax: number;
  opening_qty?: number;
  opening_cost_paise?: number;
}

export const STARTER_UNITS = [
  { code: 'NOS', name: 'Numbers / Pieces' },
  { code: 'SET', name: 'Set' },
  { code: 'PCS', name: 'Pieces' },
  { code: 'PAIR', name: 'Pairs' },
  { code: 'LTR', name: 'Litres' },
  { code: 'KGS', name: 'Kilograms' },
];

export const STARTER_CATEGORIES = [
  'Tyres (2-Wheeler)',
  'Tyres (Passenger Car)',
  'Tyres (Commercial / Truck)',
  'Tubes & Flaps',
  'Lubricants & Engine Oils',
  'Brake Pads & Shoes',
  'Filters (Oil / Air / Cabin)',
  'Batteries',
  'Accessories & Valves',
];

export const STARTER_PRODUCTS: StarterProduct[] = [
  {
    name: 'Apollo 165/80 R14 Amazer 4G Life Car Tyre',
    sku: 'AP-1658014-4G',
    hsn: '40111010',
    category: 'Tyres (Passenger Car)',
    unit: 'NOS',
    gst_rate_bp: 2800, // 28% GST on new pneumatic tyres
    selling_price_paise: 385000, // ₹3,850.00
    mrp_paise: 420000,
    price_includes_tax: 1,
    opening_qty: 8,
    opening_cost_paise: 310000,
  },
  {
    name: 'MRF ZVTS 155/80 R13 Tubeless Car Tyre',
    sku: 'MRF-1558013-ZV',
    hsn: '40111010',
    category: 'Tyres (Passenger Car)',
    unit: 'NOS',
    gst_rate_bp: 2800,
    selling_price_paise: 320000,
    mrp_paise: 350000,
    price_includes_tax: 1,
    opening_qty: 12,
    opening_cost_paise: 260000,
  },
  {
    name: 'CEAT Gripp X3 90/90-12 Motorcycle Tyre',
    sku: 'CE-909012-GX3',
    hsn: '40114010',
    category: 'Tyres (2-Wheeler)',
    unit: 'NOS',
    gst_rate_bp: 2800,
    selling_price_paise: 135000,
    mrp_paise: 155000,
    price_includes_tax: 1,
    opening_qty: 15,
    opening_cost_paise: 105000,
  },
  {
    name: 'Castrol Activ 4T 20W-40 Synthetic Engine Oil (1L)',
    sku: 'CAS-4T-20W40-1L',
    hsn: '27101980',
    category: 'Lubricants & Engine Oils',
    unit: 'LTR',
    gst_rate_bp: 1800, // 18% GST on lubricants
    selling_price_paise: 42000,
    mrp_paise: 47500,
    price_includes_tax: 1,
    opening_qty: 24,
    opening_cost_paise: 33000,
  },
  {
    name: 'Bosch Front Disc Brake Pad Set (Maruti Swift)',
    sku: 'BOS-BP-SWIFT-F',
    hsn: '87083000',
    category: 'Brake Pads & Shoes',
    unit: 'SET',
    gst_rate_bp: 2800,
    selling_price_paise: 95000,
    mrp_paise: 110000,
    price_includes_tax: 1,
    opening_qty: 6,
    opening_cost_paise: 72000,
  },
  {
    name: 'Tubeless Tyre Brass Valve TR414 (Pack of 10)',
    sku: 'VLV-TR414-10P',
    hsn: '84818090',
    category: 'Accessories & Valves',
    unit: 'SET',
    gst_rate_bp: 1800,
    selling_price_paise: 25000,
    mrp_paise: 30000,
    price_includes_tax: 1,
    opening_qty: 10,
    opening_cost_paise: 16000,
  },
];
