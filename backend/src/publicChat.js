import { Router } from 'express';
import mongoose from 'mongoose';
import { Business, Order, Product, PublicMessage } from './db.js';
import { findKnowledge } from './knowledge.js';
import { shopPrompt } from './shopPrompt.js';
import { runToolLoop } from './toolLoop.js';
import { TOOLS, executeTool, placeOrder, isAvailable, shortId, upiLink } from './shopTools.js';

// Customer-facing routes. No login: anyone with the shop link can chat.
const router = Router();

const MAX_MESSAGE = 1000;
const HISTORY = 8;
const SESSION_RE = /^[\w-]{8,64}$/;

// Light per-IP limit so the shop link can't be used to burn the LLM quota.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

// The page sends what is in the customer's cart with each message. The agent reads it, so it
// knows what is already there instead of adding the same items again.
async function describeCart(business, cart) {
  if (!cart || typeof cart !== 'object') return '(empty)';
  const ids = Object.keys(cart).filter((id) => mongoose.isValidObjectId(id) && Number(cart[id]) > 0).slice(0, 30);
  if (ids.length === 0) return '(empty)';
  const products = await Product.find({ _id: { $in: ids }, businessId: business._id });
  const lines = products.map((p) => `${Number(cart[p.id])} x ${p.name}${p.unit ? ` (${p.unit})` : ''} [product_id ${p.id}]`);
  return lines.join('\n') || '(empty)';
}

// What a customer may see about their own order.
const customerOrder = (business, o) => ({
  id: o.id,
  number: shortId(o),
  status: o.status,
  total: o.total,
  fulfilment: o.fulfilment,
  items: o.items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty })),
  payUrl: ['pending', 'accepted', 'out_for_delivery'].includes(o.status) ? upiLink(business, o) : null,
  feedback: o.feedback?.rating ? { rating: o.feedback.rating, comment: o.feedback.comment } : null,
  createdAt: o.createdAt,
});

// Public details for the chat page header
router.get('/:slug', async (req, res) => {
  const business = await Business.findOne({ slug: req.params.slug });
  if (!business) return res.status(404).json({ error: 'shop not found' });
  res.json({ name: business.name, timings: business.info?.timings || '', address: business.info?.address || '' });
});

// Earlier messages of a session, so the page can restore the conversation
router.get('/:slug/history', async (req, res) => {
  const business = await Business.findOne({ slug: req.params.slug });
  const sessionId = String(req.query.sessionId || '');
  if (!business || !SESSION_RE.test(sessionId)) return res.json([]);
  const messages = await PublicMessage.find({ businessId: business._id, sessionId }).sort({ _id: 1 }).limit(100);
  res.json(messages.map((m) => ({ role: m.role, content: m.content })));
});

// The shop's menu, for the Add to cart screen
router.get('/:slug/products', async (req, res) => {
  const business = await Business.findOne({ slug: req.params.slug });
  if (!business) return res.status(404).json({ error: 'shop not found' });
  const products = await Product.find({ businessId: business._id }).sort({ name: 1 }).limit(500);
  res.json({
    upi: !!business.info?.upiId,
    deliveryAreas: business.deliveryAreas || [],
    products: products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, available: isAvailable(p) })),
  });
});

// Place an order straight from the cart. Same checks and server-side total as when the agent does it.
router.post('/:slug/orders', async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  const business = await Business.findOne({ slug: req.params.slug });
  if (!business) return res.status(404).json({ error: 'shop not found' });
  const sessionId = String(req.body.sessionId || '');
  if (!SESSION_RE.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });

  const items = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => ({ product_id: i.product_id, qty: i.qty }));
  const state = { orders: [] };
  const result = await placeOrder(business, sessionId, { ...req.body, items }, state);
  if (result.error) return res.status(400).json({ error: result.error });

  // Put a line in the chat, so the conversation (and the agent) knows the order exists.
  const placed = state.orders[0];
  await PublicMessage.create({
    businessId: business._id,
    sessionId,
    role: 'assistant',
    content: `Your order #${placed.shortId} for ₹${placed.total} was sent to the shop. They will confirm it soon.`,
  });
  res.status(201).json({ order: placed });
});

// This customer's orders (found by their session), with status
router.get('/:slug/orders', async (req, res) => {
  const business = await Business.findOne({ slug: req.params.slug });
  const sessionId = String(req.query.sessionId || '');
  if (!business || !SESSION_RE.test(sessionId)) return res.json([]);
  const orders = await Order.find({ businessId: business._id, sessionId }).sort({ _id: -1 }).limit(10);
  res.json(orders.map((o) => customerOrder(business, o)));
});

// Rating after delivery
router.post('/:slug/orders/:id/feedback', async (req, res) => {
  const business = await Business.findOne({ slug: req.params.slug });
  const sessionId = String(req.body.sessionId || '');
  const rating = Number(req.body.rating);
  if (!business || !SESSION_RE.test(sessionId) || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be 1 to 5' });
  const order = await Order.findOne({ _id: req.params.id, businessId: business._id, sessionId });
  if (!order) return res.status(404).json({ error: 'not found' });
  if (order.status !== 'delivered') return res.status(400).json({ error: 'You can rate an order after it is delivered.' });
  if (order.feedback?.rating) return res.status(409).json({ error: 'Already rated. Thank you!' });
  order.feedback = { rating, comment: String(req.body.comment || '').trim().slice(0, 300) };
  await order.save();
  res.json({ ok: true });
});

router.post('/:slug/chat', async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many messages. Please wait a minute.' });

  const business = await Business.findOne({ slug: req.params.slug });
  if (!business) return res.status(404).json({ error: 'shop not found' });

  const message = String(req.body.message || '').trim();
  const sessionId = String(req.body.sessionId || '');
  if (!message) return res.status(400).json({ error: 'message required' });
  if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE} characters).` });
  if (!SESSION_RE.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });

  await PublicMessage.create({ businessId: business._id, sessionId, role: 'user', content: message });
  const recent = await PublicMessage.find({ businessId: business._id, sessionId }).sort({ _id: -1 }).limit(HISTORY);
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));

  // Search the owner's documents using the last two things the customer said.
  const query = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const state = { leadSaved: false, orders: [], cartUpdates: [], profile: null };
  try {
    const knowledge = await findKnowledge(business._id, query);
    const cartText = await describeCart(business, req.body.cart);
    const reply =
      (await runToolLoop({
        systemPrompt: shopPrompt(business, knowledge, cartText),
        history,
        tools: TOOLS,
        execute: (name, args) => executeTool(name, args, { business, sessionId, state }),
      })) || 'Sorry, I could not answer that. Please try again.';
    await PublicMessage.create({ businessId: business._id, sessionId, role: 'assistant', content: reply });
    res.json({ reply, leadSaved: state.leadSaved, orders: state.orders, cartUpdates: state.cartUpdates, profile: state.profile });
  } catch (e) {
    console.error('public chat failed:', e.message);
    const busy = e.status === 429;
    res.status(busy ? 503 : 502).json({
      error: busy
        ? 'The assistant is busy right now. Please try again in a few seconds.'
        : 'The assistant is unavailable right now. Please try again.',
    });
  }
});

export default router;
