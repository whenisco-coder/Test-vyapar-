export const AUTO_CATEGORIES = [
  'Tyres',
  'Tubes & Flaps',
  'Lubricants & Oils',
  'Batteries',
  'Brake Parts',
  'Suspension & Steering',
  'Engine Spares',
  'Filters & Belts',
  'Electrical & Bulbs',
  'Accessories',
  'General',
] as const;

export type AutoCategory = typeof AUTO_CATEGORIES[number];

export const AJRAKHIKA_CATEGORIES = [
  'Ajrakh block print',
  'Bandhani',
  'Kutchi embroidery',
  'Mirror work',
  'Rogan art',
  'Bhujodi weaving',
  'Leather crafts',
  'Copper bells',
  'Home decor',
  'Kurtas',
  'Sarees',
  'Dupattas',
] as const;

export const PRODUCT_CATEGORIES = [...AUTO_CATEGORIES, ...AJRAKHIKA_CATEGORIES, 'General crafts'] as const;
