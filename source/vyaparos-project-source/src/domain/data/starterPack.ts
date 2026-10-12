export interface StarterProduct {
  name: string;
  sku: string;
  hsn: string;
  gstRateBp: number;
  unit: string;
  sellingPricePaise: number;
  mrpPaise: number;
  priceIncludesTax: boolean;
  category: string;
}

export const TYRE_AUTO_STARTER_PACK: StarterProduct[] = [
  {
    name: 'MRF ZLX 165/80 R14 Tubeless Car Tyre',
    sku: 'TYRE-MRF-16580R14',
    hsn: '4011',
    gstRateBp: 2800, // 28% GST for tyres
    unit: 'NOS',
    sellingPricePaise: 385000, // ₹ 3,850.00
    mrpPaise: 420000,
    priceIncludesTax: true,
    category: 'Tyres',
  },
  {
    name: 'Apollo Amazer 4G Life 175/65 R14 Tyre',
    sku: 'TYRE-APO-17565R14',
    hsn: '4011',
    gstRateBp: 2800,
    unit: 'NOS',
    sellingPricePaise: 410000, // ₹ 4,100.00
    mrpPaise: 460000,
    priceIncludesTax: true,
    category: 'Tyres',
  },
  {
    name: 'CEAT Milaze 90/90-12 Tubeless Scooter Tyre',
    sku: 'TYRE-CEAT-909012',
    hsn: '4011',
    gstRateBp: 2800,
    unit: 'NOS',
    sellingPricePaise: 135000, // ₹ 1,350.00
    mrpPaise: 155000,
    priceIncludesTax: true,
    category: 'Tyres',
  },
  {
    name: 'JK Tyre Butyl Inner Tube 165/80 R14',
    sku: 'TUBE-JK-14',
    hsn: '4013',
    gstRateBp: 1800, // 18% GST for tubes
    unit: 'NOS',
    sellingPricePaise: 42000, // ₹ 420.00
    mrpPaise: 49000,
    priceIncludesTax: true,
    category: 'Tubes & Flaps',
  },
  {
    name: 'Castrol Activ 4T 20W-40 1 Litre Engine Oil',
    sku: 'LUB-CAST-20W40-1L',
    hsn: '2710',
    gstRateBp: 1800,
    unit: 'LTR',
    sellingPricePaise: 39000, // ₹ 390.00
    mrpPaise: 45000,
    priceIncludesTax: true,
    category: 'Lubricants & Oils',
  },
  {
    name: 'Motul 7100 10W-50 4T 1L Synthetic Oil',
    sku: 'LUB-MOTUL-10W50-1L',
    hsn: '2710',
    gstRateBp: 1800,
    unit: 'LTR',
    sellingPricePaise: 88000, // ₹ 880.00
    mrpPaise: 99500,
    priceIncludesTax: true,
    category: 'Lubricants & Oils',
  },
  {
    name: 'BOSCH Front Brake Pads Set (Maruti Swift/Dzire)',
    sku: 'BRK-BOSCH-BP102',
    hsn: '8708',
    gstRateBp: 1800,
    unit: 'SET',
    sellingPricePaise: 95000, // ₹ 950.00
    mrpPaise: 120000,
    priceIncludesTax: true,
    category: 'Brake Parts',
  },
  {
    name: 'Purolator Oil Filter for WagonR / Alto',
    sku: 'FLT-PURO-OF55',
    hsn: '8421',
    gstRateBp: 1800,
    unit: 'NOS',
    sellingPricePaise: 11000, // ₹ 110.00
    mrpPaise: 14500,
    priceIncludesTax: true,
    category: 'Filters & Belts',
  },
  {
    name: 'NGK Spark Plug CPR8EA-9 (Hero/Honda Bikes)',
    sku: 'SPK-NGK-CPR8',
    hsn: '8511',
    gstRateBp: 1800,
    unit: 'NOS',
    sellingPricePaise: 16000, // ₹ 160.00
    mrpPaise: 19500,
    priceIncludesTax: true,
    category: 'Electrical & Bulbs',
  },
  {
    name: 'Exide Epiq 35Ah Maintenance Free Car Battery',
    sku: 'BAT-EXIDE-35AH',
    hsn: '8507',
    gstRateBp: 2800,
    unit: 'NOS',
    sellingPricePaise: 430000, // ₹ 4,300.00
    mrpPaise: 495000,
    priceIncludesTax: true,
    category: 'Batteries',
  },
];
