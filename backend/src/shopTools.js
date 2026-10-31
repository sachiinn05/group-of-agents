import mongoose from 'mongoose';
import { Product, Order, Lead } from './db.js';
import { tokenize } from './knowledge.js';
import { notifyLead, notifyOrder } from './telegram.js';

// The actions the shop agent can take. The model decides when to call them; this file does the work,
// and checks everything the model sends, because the model can be wrong.

const MAX_OPEN_ORDERS_PER_SESSION = 5;

export const shortId = (order) => String(order._id).slice(-6).toUpperCase();

// A UPI deep link. On a phone it opens the customer's UPI app with the amount filled in.
export function upiLink(business, order) {
  const upiId = business.info?.upiId;
  if (!upiId) return null;
  const params = new URLSearchParams({ pa: upiId, pn: business.name, am: order.total.toFixed(2), cu: 'INR', tn: `Order ${shortId(order)}` });
  return `upi://pay?${params}`;
}

const available = (p) => p.inStock && (p.stockQty === null || p.stockQty > 0);

const validPhone = (raw) => {
  const phone = String(raw || '').replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? phone : null;
};

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Look up products with price and availability. Use for any price, stock or "do you have" question, and before placing an order.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Product words, like "basmati rice"' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_order',
      description: 'Place the customer\'s order once you have items, name, phone and (for delivery) address. The server calculates the total.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'qty is the number of units as listed: for a product listed "1 kg", 2 kg is qty 2',
            items: { type: 'object', properties: { product_id: { type: 'string' }, qty: { type: 'number' } }, required: ['product_id', 'qty'] },
          },
          fulfilment: { type: 'string', enum: ['delivery', 'pickup'] },
          name: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'], description: 'Never guess it' },
          address: { type: ['string', 'null'], description: 'Required for delivery' },
          note: { type: ['string', 'null'] },
        },
        required: ['items', 'fulfilment'],
      },
    },
  },
  {
    type: 'function',
    function: { name: 'my_orders', description: "This customer's recent orders with status, for status questions or reordering.", parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'save_lead',
      description: 'Save a customer who needs a callback or whose question the owner must answer. Needs a phone number.',
      parameters: {
        type: 'object',
        // Types allow null: the model sometimes calls this before it has the phone number, and the
        // provider would reject the whole request. The phone check below tells the model to ask.
        properties: {
          name: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'], description: 'Never guess it' },
          note: { type: 'string', description: 'What they want or the question to check' },
        },
        required: ['note'],
      },
    },
  },
];

async function searchProducts(business, args) {
  const products = await Product.find({ businessId: business._id }).limit(1000);
  const terms = [...new Set(tokenize(String(args.query || '')))];
  const scored = products
    .map((p) => {
      const name = `${p.name} ${p.unit}`.toLowerCase();
      const words = new Set(tokenize(name));
      const score = terms.reduce((s, t) => s + (words.has(t) ? 2 : t.length >= 3 && name.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return {
    products: scored.map(({ p }) => ({
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      price: p.price,
      available: available(p),
      ...(p.stockQty !== null && p.stockQty > 0 && p.stockQty <= 10 && { only_left: p.stockQty }),
    })),
    ...(products.length === 0 && { note: 'This shop has no product list. Use KNOWLEDGE for prices, or save_lead for the owner to confirm.' }),
  };
}

async function placeOrder(business, sessionId, args, state) {
  const fulfilment = args.fulfilment === 'pickup' ? 'pickup' : 'delivery';
  const phone = validPhone(args.phone);
  if (!phone) return { error: 'Need a valid phone number from the customer. Ask for it.' };

  const address = String(args.address || '').trim();
  if (fulfilment === 'delivery') {
    if (address.length < 5) return { error: 'Need the full delivery address. Ask for it, or offer pickup.' };
    const areas = business.deliveryAreas || [];
    if (areas.length && !areas.some((a) => address.toLowerCase().includes(a))) {
      return { error: `We do not deliver to that address. We deliver to: ${areas.join(', ')}. Offer pickup instead.` };
    }
  }

  const wanted = new Map(); // merge repeated products
  for (const it of Array.isArray(args.items) ? args.items : []) {
    const qty = Math.round(Number(it.qty) * 100) / 100;
    if (!mongoose.isValidObjectId(it.product_id) || !(qty > 0) || qty > 1000) {
      return { error: 'Each item needs a product_id from search_products and a quantity above 0.' };
    }
    wanted.set(String(it.product_id), (wanted.get(String(it.product_id)) || 0) + qty);
  }
  if (wanted.size === 0 || wanted.size > 30) return { error: 'Order needs between 1 and 30 different products.' };

  const open = await Order.countDocuments({ businessId: business._id, sessionId, status: 'pending' });
  if (open >= MAX_OPEN_ORDERS_PER_SESSION) return { error: 'There are already several pending orders from this chat. Ask the customer to wait for the shop to confirm.' };

  const products = await Product.find({ _id: { $in: [...wanted.keys()] }, businessId: business._id });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [];
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    if (!p) return { error: 'One of those products is no longer sold. Search again.' };
    if (!available(p) || (p.stockQty !== null && p.stockQty < qty)) {
      return { error: `${p.name} is not available in that quantity${p.stockQty ? ` (only ${p.stockQty} left)` : ''}.` };
    }
    items.push({ productId: p._id, name: p.name, unit: p.unit, price: p.price, qty });
  }

  const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const order = await Order.create({
    businessId: business._id,
    sessionId,
    customerName: String(args.name || '').trim().slice(0, 80),
    phone,
    fulfilment,
    address: fulfilment === 'delivery' ? address.slice(0, 300) : '',
    note: String(args.note || '').trim().slice(0, 300),
    items,
    total,
  });
  notifyOrder(business, order);
  const payUrl = upiLink(business, order);
  state.orders.push({ id: order.id, shortId: shortId(order), total, payUrl });
  return {
    ok: true,
    order_number: shortId(order),
    items: items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, line_total: Math.round(i.price * i.qty * 100) / 100 })),
    total,
    fulfilment,
    pay_button_shown: !!payUrl,
    message: 'Order sent to the shop. Tell the customer this exact total and that the shop will confirm.',
  };
}

async function myOrders(business, sessionId) {
  const orders = await Order.find({ businessId: business._id, sessionId }).sort({ _id: -1 }).limit(5);
  return {
    orders: orders.map((o) => ({
      order_number: shortId(o),
      status: o.status,
      total: o.total,
      items: o.items.map((i) => ({ product_id: i.productId, name: i.name, unit: i.unit, qty: i.qty })),
    })),
  };
}

async function saveLead(business, sessionId, args, state) {
  const phone = validPhone(args.phone);
  if (!phone) return { error: 'That phone number looks invalid or missing. Ask the customer for a valid number.' };
  const fields = { name: String(args.name || '').trim(), note: String(args.note || '').trim() };
  // Same customer in the same chat: update instead of creating duplicates.
  const existing = await Lead.findOne({ businessId: business._id, sessionId, phone });
  if (existing) {
    await Lead.updateOne({ _id: existing._id }, fields);
    // Alert again only if the details actually changed.
    if (fields.note !== existing.note) {
      notifyLead(business, { phone, name: fields.name || existing.name, note: fields.note }, { updated: true });
    }
  } else {
    await Lead.create({ businessId: business._id, sessionId, phone, ...fields });
    notifyLead(business, { phone, ...fields });
  }
  state.leadSaved = true;
  return { ok: true, message: 'Saved. The owner will contact the customer.' };
}

// Runs one tool call for the model. Always returns a string.
export async function executeTool(name, args, ctx) {
  const { business, sessionId, state } = ctx;
  try {
    const result =
      name === 'search_products' ? await searchProducts(business, args)
      : name === 'place_order' ? await placeOrder(business, sessionId, args, state)
      : name === 'my_orders' ? await myOrders(business, sessionId)
      : name === 'save_lead' ? await saveLead(business, sessionId, args, state)
      : { error: `Unknown tool ${name}` };
    return JSON.stringify(result);
  } catch (e) {
    console.error(`tool ${name} failed:`, e.message);
    return JSON.stringify({ error: 'That action failed. Tell the customer the owner will follow up.' });
  }
}
