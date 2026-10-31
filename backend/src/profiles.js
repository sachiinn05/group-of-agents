// One agent engine serves every kind of shop. A profile only changes the words, the extra rules the
// agent follows, and the ways an order can be received. Add a new type here and nothing else changes.

export const MODES = {
  delivery: 'Delivery',
  pickup: 'Pickup',
  dinein: 'Dine-in',
  appointment: 'Book appointment',
};

export const SHOP_TYPES = {
  general: {
    label: 'General store / Grocery',
    items: 'products',
    menuLabel: 'Products',
    modes: ['delivery', 'pickup'],
    example: 'Basmati Rice | 1 kg | 140 | Grocery',
    rules: '',
  },
  restaurant: {
    label: 'Restaurant / Cafe / Bakery / Sweets',
    items: 'dishes',
    menuLabel: 'Menu',
    modes: ['delivery', 'pickup', 'dinein'],
    example: 'Paneer Tikka | 1 plate | 220 | Starters | Veg',
    rules:
      '- Items may carry notes (veg or non-veg, spice level, portion). Mention them. For dine-in, ask for the table number or arrival time and use it as the schedule. Do not promise preparation or delivery time unless it is written in SHOP INFO.',
  },
  pharmacy: {
    label: 'Pharmacy / Medical store',
    items: 'medicines',
    menuLabel: 'Medicines',
    modes: ['delivery', 'pickup'],
    example: 'Paracetamol 500mg | strip of 10 | 30 | Tablets | Prescription not needed',
    rules:
      '- You are NOT a doctor or pharmacist. Never give medical advice, a diagnosis, a dosage, or say which medicine to take. If asked, say to consult a doctor or ask the pharmacist at the shop. For an emergency tell them to call a doctor or 112 now. If an item note says a prescription is needed, tell the customer before they order that the prescription must be shown at the shop or on delivery. Only offer what is listed.',
  },
  clothing: {
    label: 'Clothing / Fashion',
    items: 'products',
    menuLabel: 'Products',
    modes: ['delivery', 'pickup'],
    example: 'Cotton T-Shirt (M) | 1 piece | 499 | Men | Blue',
    rules:
      '- Sizes and colours are separate items or are in the item note. If there are several, ask which size and colour. Do not state exchange or return terms unless they are in SHOP INFO.',
  },
  electronics: {
    label: 'Electronics / Mobile / Appliances',
    items: 'products',
    menuLabel: 'Products',
    modes: ['delivery', 'pickup'],
    example: 'Phone Charger 20W | 1 piece | 799 | Accessories | 1 year warranty',
    rules: '- Mention warranty or condition only if it is in the item note or SHOP INFO. Do not guess specifications.',
  },
  salon: {
    label: 'Salon / Spa / Services by appointment',
    items: 'services',
    menuLabel: 'Services',
    modes: ['appointment'],
    example: 'Haircut | 30 min | 200 | Hair',
    rules:
      '- This business sells services by appointment, so "ordering" means booking. Ask for the service(s) and the preferred date and time, and use that as the schedule. Never promise a slot: say the shop will confirm the time. Do not give medical or skin-treatment advice.',
  },
  other: {
    label: 'Other',
    items: 'items',
    menuLabel: 'Items',
    modes: ['delivery', 'pickup'],
    example: 'Dog Food | 1 kg | 450 | Pets',
    rules: '',
  },
};

// Older shops were saved with type "shop"; they behave like a general store.
export const profileFor = (type) => SHOP_TYPES[type] || SHOP_TYPES.general;

export const modesFor = (business) => {
  const valid = (business.modes || []).filter((m) => MODES[m]);
  return valid.length ? valid : profileFor(business.type).modes;
};

export const typeLabelFor = (business) =>
  business.type === 'other' && business.typeLabel ? business.typeLabel : profileFor(business.type).label;
