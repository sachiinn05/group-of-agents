import { Router } from 'express';
import mongoose from 'mongoose';
import { PublicMessage, Order, Lead, Unanswered } from './db.js';
import { requireAuth } from './auth.js';
import { loadShop } from './ownerShop.js';
import { ownerReply } from './ownerReply.js';

// The owner's view of customer conversations, and of questions the agent could not answer.
// Mounted at /business, so each route lists its own auth instead of using router.use().
const router = Router();
const guard = [requireAuth, loadShop];
const SESSION_RE = /^[\w-]{8,64}$/;

// One row per customer chat, newest first, with a name and phone when we know them
router.get('/chats', guard, async (req, res) => {
  const businessId = req.business._id;
  const sessions = await PublicMessage.aggregate([
    { $match: { businessId } },
    { $sort: { _id: -1 } },
    { $group: { _id: '$sessionId', last: { $first: '$content' }, lastRole: { $first: '$role' }, lastAt: { $first: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { lastAt: -1 } },
    { $limit: 100 },
  ]);
  const ids = sessions.map((s) => s._id);
  const [orders, leads] = await Promise.all([
    Order.find({ businessId, sessionId: { $in: ids } }, 'sessionId customerName phone').sort({ _id: 1 }),
    Lead.find({ businessId, sessionId: { $in: ids } }, 'sessionId name phone').sort({ _id: 1 }),
  ]);
  const who = new Map(); // later entries win, so the newest name and phone are used
  for (const o of orders) who.set(o.sessionId, { name: o.customerName, phone: o.phone });
  for (const l of leads) who.set(l.sessionId, { name: l.name, phone: l.phone });

  res.json(
    sessions.map((s) => ({
      sessionId: s._id,
      name: who.get(s._id)?.name || '',
      phone: who.get(s._id)?.phone || '',
      last: s.last.slice(0, 120),
      lastRole: s.lastRole,
      lastAt: s.lastAt,
      count: s.count,
    }))
  );
});

router.get('/chats/:sessionId', guard, async (req, res) => {
  if (!SESSION_RE.test(req.params.sessionId)) return res.status(404).json({ error: 'not found' });
  const messages = await PublicMessage.find({ businessId: req.business._id, sessionId: req.params.sessionId }).sort({ _id: 1 }).limit(300);
  if (messages.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(messages.map((m) => ({ role: m.role, content: m.content, at: m.createdAt })));
});

// The owner writes to the customer from the dashboard. Shows up in the customer's chat at once.
router.post('/chats/:sessionId/reply', guard, async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'write a message first' });
  if (!SESSION_RE.test(req.params.sessionId) || !(await PublicMessage.exists({ businessId: req.business._id, sessionId: req.params.sessionId }))) {
    return res.status(404).json({ error: 'not found' });
  }
  await ownerReply(req.business._id, req.params.sessionId, text);
  res.json({ ok: true });
});

router.get('/unanswered', guard, async (req, res) => {
  const items = await Unanswered.find({ businessId: req.business._id, handled: false }).sort({ count: -1, lastAskedAt: -1 }).limit(100);
  res.json(items.map((u) => ({ id: u.id, question: u.question, count: u.count, lastAskedAt: u.lastAskedAt })));
});

// "Done": the owner has added the answer
router.patch('/unanswered/:id', guard, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { matchedCount } = await Unanswered.updateOne({ _id: req.params.id, businessId: req.business._id }, { handled: true });
  if (!matchedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

export default router;
