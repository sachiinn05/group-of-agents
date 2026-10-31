import mongoose from 'mongoose';
import { Product, Order, Lead, Unanswered } from './db.js';
import { emitToOwner } from './realtime.js';
import { tokenize } from './knowledge.js';
import { notifyLead, notifyOrder } from './telegram.js';
import { MODES, modesFor } from './profiles.js';

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

// What a customer may see about their own order (also what is pushed to them live).
export const customerOrder = (business, o) => ({
  id: o.id,
  number: shortId(o),
  status: o.status,
  total: o.total,
  fulfilment: o.fulfilment,
  schedule: o.schedule || '',
  items: o.items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty })),
  payUrl: ['pending', 'accepted', 'out_for_delivery'].includes(o.status) ? upiLink(business, o) : null,
  feedback: o.feedback?.rating ? { rating: o.feedback.rating, comment: o.feedback.comment } : null,
  createdAt: o.createdAt,
});

const available = (p) => p.inStock && (p.stockQty === null || p.stockQty > 0);

const validPhone = (raw) => {
  const phone = String(raw || '').replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? phone : null;
};

export const isAvailable = available;

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
          fulfilment: { type: 'string', enum: Object.keys(MODES), description: 'One of the ways listed in SHOP INFO' },
          name: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'], description: 'Never guess it' },
          address: { type: ['string', 'null'], description: 'Required for delivery' },
          schedule: { type: ['string', 'null'], description: 'Appointment date and time (required), dine-in table or arrival time, or pickup time' },
          note: { type: ['string', 'null'] },
        },
        required: ['items', 'fulfilment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_cart',
      description: "Set quantities in the customer's cart (see CURRENT CART). qty REPLACES the quantity; 0 removes the item. Safe to repeat. The customer reviews and places the order in the Cart tab.",
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'qty is the number of units as listed: for a product listed "1 kg", 2 kg is qty 2',
            items: { type: 'object', properties: { product_id: { type: 'string' }, qty: { type: 'number' } }, required: ['product_id', 'qty'] },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_customer_details',
      description: 'Call as soon as the customer tells you their name, phone or delivery address, so the Cart form is filled in for them. Only pass what they actually said.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          address: { type: ['string', 'null'] },
        },
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
      name: 'flag_unanswered',
      description: "Record a customer question you could not answer from SHOP INFO, KNOWLEDGE, OFFERS or the tools, so the owner can add the answer. Call it before telling the customer the owner will check.",
      parameters: { type: 'object', properties: { question: { type: 'string', description: 'The question in a few words' } }, required: ['question'] },
    },
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

async function searchProducts(business, args, state) {
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
  // A general request like "food" matches no product name. Show some items instead of nothing.
  const noMatch = scored.length === 0 && products.length > 0;
  if (noMatch) products.slice(0, 8).forEach((p) => scored.push({ p, score: 0 }));
  // The customer wanted something the list does not have: record it for the owner ourselves,
  // rather than trusting the model to remember to.
  if (noMatch && terms.length) await flagUnanswered(business, { question: String(args.query).trim() }, state);
  return {
    ...(noMatch && { note: 'No exact match. These are some of the shop\'s items. Show them and tell the customer they can tap Menu to see everything.' }),
    products: scored.map(({ p }) => ({
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      price: p.price,
      ...(p.category && { category: p.category }),
      ...(p.note && { note: p.note }),
      available: available(p),
      ...(p.stockQty !== null && p.stockQty > 0 && p.stockQty <= 10 && { only_left: p.stockQty }),
    })),
    ...(products.length === 0 && { note: 'This shop has no product list. Use KNOWLEDGE for prices, or save_lead for the owner to confirm.' }),
  };
}

export async function placeOrder(business, sessionId, args, state) {
  const modes = modesFor(business);
  const fulfilment = args.fulfilment ? args.fulfilment : modes[0];
  if (!modes.includes(fulfilment)) {
    return { error: `This shop takes orders by: ${modes.map((m) => MODES[m]).join(', ')}.` };
  }
  const phone = validPhone(args.phone);
  if (!phone) return { error: 'Please enter a valid phone number.' };

  const address = String(args.address || '').trim();
  const schedule = String(args.schedule || '').trim().slice(0, 100);
  if (fulfilment === 'delivery') {
    const orPickup = modes.includes('pickup') ? ', or choose pickup' : '';
    if (address.length < 5) return { error: `Please enter the full delivery address${orPickup}.` };
    const areas = business.deliveryAreas || [];
    if (areas.length && !areas.some((a) => address.toLowerCase().includes(a))) {
      return { error: `We do not deliver to that address. We deliver to: ${areas.join(', ')}.${orPickup ? ' You can choose pickup instead.' : ''}` };
    }
  }
  if (fulfilment === 'appointment' && schedule.length < 3) return { error: 'Please choose your preferred date and time.' };
  if (fulfilment === 'dinein' && !schedule) return { error: 'Please enter your table number or arrival time.' };

  const wanted = new Map(); // merge repeated products
  for (const it of Array.isArray(args.items) ? args.items : []) {
    const qty = Math.round(Number(it.qty) * 100) / 100;
    if (!mongoose.isValidObjectId(it.product_id) || !(qty > 0) || qty > 1000) {
      return { error: 'Some items in the cart are invalid. Please refresh the menu and try again.' };
    }
    wanted.set(String(it.product_id), (wanted.get(String(it.product_id)) || 0) + qty);
  }
  if (wanted.size === 0 || wanted.size > 30) return { error: 'An order needs between 1 and 30 different products.' };

  const open = await Order.countDocuments({ businessId: business._id, sessionId, status: 'pending' });
  if (open >= MAX_OPEN_ORDERS_PER_SESSION) return { error: 'You already have several pending orders. Please wait for the shop to confirm them.' };

  const products = await Product.find({ _id: { $in: [...wanted.keys()] }, businessId: business._id });
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [];
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    if (!p) return { error: 'One of those products is no longer sold. Please refresh the menu.' };
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
    schedule,
    note: String(args.note || '').trim().slice(0, 300),
    items,
    total,
    lang: args.lang === 'hi' ? 'hi' : 'en',
  });
  notifyOrder(business, order);
  emitToOwner(business._id, 'orders:changed');
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

// The cart lives in the customer's browser. This checks the items and hands the new quantities back in
// state.cartUpdates, and the chat response carries them to the page. Quantities are absolute (not "add"),
// so a repeated call by the model cannot double the cart.
async function updateCart(business, args, state) {
  const wanted = new Map();
  for (const it of Array.isArray(args.items) ? args.items : []) {
    const qty = Math.round(Number(it.qty) * 100) / 100;
    if (!mongoose.isValidObjectId(it.product_id) || !(qty >= 0) || qty > 99) {
      return { error: 'Each item needs a product_id from search_products and a quantity from 0 to 99.' };
    }
    wanted.set(String(it.product_id), qty);
  }
  if (wanted.size === 0 || wanted.size > 30) return { error: 'Change between 1 and 30 different products.' };

  const products = await Product.find({ _id: { $in: [...wanted.keys()] }, businessId: business._id });
  const byId = new Map(products.map((p) => [p.id, p]));
  const changes = [];
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    if (!p) return { error: 'Unknown product_id. Call search_products first and use its product_id.' };
    if (qty > 0 && (!available(p) || (p.stockQty !== null && p.stockQty < qty))) {
      return { error: `${p.name} is not available in that quantity${p.stockQty ? ` (only ${p.stockQty} left)` : ''}.` };
    }
    changes.push({ product_id: p.id, name: p.name, unit: p.unit, qty, price: p.price });
  }
  state.cartUpdates.push(...changes);
  return {
    ok: true,
    cart_now: changes.map((c) => ({ name: c.name, unit: c.unit, qty: c.qty, line_total: Math.round(c.price * c.qty * 100) / 100 })),
    message: 'Cart updated. Ask for any missing name, phone and delivery or pickup details, then tell the customer to open the Cart tab to review and place the order.',
  };
}

function saveCustomerDetails(args, state) {
  const details = {};
  const name = String(args.name || '').trim().slice(0, 80);
  const address = String(args.address || '').trim().slice(0, 300);
  if (name) details.name = name;
  if (address) details.address = address;
  let note;
  if (args.phone) {
    const phone = validPhone(args.phone);
    if (phone) details.phone = phone;
    else note = 'That phone number looks invalid and was not saved. Ask for a valid one.';
  }
  if (Object.keys(details).length === 0) return { error: note || 'Nothing to save.' };
  state.profile = { ...state.profile, ...details };
  return { ok: true, saved: Object.keys(details), ...(note && { note }) };
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

// Counts a question the agent could not answer, so the owner sees what customers keep asking.
async function flagUnanswered(business, args, state) {
  const question = String(args.question || '').trim().slice(0, 200);
  if (question.length < 3) return { error: 'Say what the question was.' };
  // Count a question once per message, even if both the search and the model record it.
  const key = question.toLowerCase();
  if (state.flagged?.has(key)) return { ok: true, message: 'Already recorded.' };
  (state.flagged ||= new Set()).add(key);
  await Unanswered.findOneAndUpdate(
    { businessId: business._id, key },
    { $set: { question, lastAskedAt: new Date(), handled: false }, $inc: { count: 1 } },
    { upsert: true }
  );
  emitToOwner(business._id, 'unanswered:changed');
  return { ok: true, message: 'Recorded for the owner. Now tell the customer the owner will check, and ask for their name and phone with save_lead.' };
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
      notifyLead(business, { phone, sessionId, name: fields.name || existing.name, note: fields.note }, { updated: true });
    }
  } else {
    await Lead.create({ businessId: business._id, sessionId, phone, ...fields });
    notifyLead(business, { phone, sessionId, ...fields });
  }
  emitToOwner(business._id, 'leads:changed');
  state.leadSaved = true;
  return { ok: true, message: 'Saved. The owner will contact the customer.' };
}

// Runs one tool call for the model. Always returns a string.
export async function executeTool(name, args, ctx) {
  const { business, sessionId, state } = ctx;
  try {
    const result =
      name === 'search_products' ? await searchProducts(business, args, state)
      : name === 'place_order' ? await placeOrder(business, sessionId, { ...args, lang: state.lang }, state)
      : name === 'update_cart' ? await updateCart(business, args, state)
      : name === 'save_customer_details' ? saveCustomerDetails(args, state)
      : name === 'my_orders' ? await myOrders(business, sessionId)
      : name === 'flag_unanswered' ? await flagUnanswered(business, args, state)
      : name === 'save_lead' ? await saveLead(business, sessionId, args, state)
      : { error: `Unknown tool ${name}` };
    return JSON.stringify(result);
  } catch (e) {
    console.error(`tool ${name} failed:`, e.message);
    return JSON.stringify({ error: 'That action failed. Tell the customer the owner will follow up.' });
  }
}
