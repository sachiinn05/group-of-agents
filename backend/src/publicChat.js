import { Router } from 'express';
import { Business, Lead, PublicMessage } from './db.js';
import { findKnowledge } from './knowledge.js';
import { shopPrompt } from './shopPrompt.js';
import { runToolLoop } from './toolLoop.js';

// Customer-facing routes. No login: anyone with the shop link can chat.
const router = Router();

const MAX_MESSAGE = 1000;
const HISTORY = 8;

// Light per-IP limit so the shop link can't be used to burn the LLM quota.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

const saveLeadTool = {
  type: 'function',
  function: {
    name: 'save_lead',
    description:
      'Save a customer who wants to order, reserve, or get a callback, so the owner can contact them. Needs a phone number.',
    parameters: {
      type: 'object',
      // Types allow null: the model sometimes calls this before it has the phone number, and the
      // provider would reject the whole request. saveLead() checks the phone and tells the model to ask.
      properties: {
        name: { type: ['string', 'null'], description: 'Customer name' },
        phone: { type: ['string', 'null'], description: 'Customer phone number. Never guess it.' },
        note: { type: 'string', description: 'What they want: item, quantity, delivery address, question to check' },
      },
      required: ['note'],
    },
  },
};

async function saveLead(business, sessionId, args, state) {
  const phone = String(args.phone || '').replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return JSON.stringify({ error: 'That phone number looks invalid. Ask the customer for a valid number.' });
  }
  const fields = { name: String(args.name || '').trim(), note: String(args.note || '').trim() };
  // Same customer in the same chat: update instead of creating duplicates.
  const existing = await Lead.findOne({ businessId: business._id, sessionId, phone });
  if (existing) await Lead.updateOne({ _id: existing._id }, fields);
  else await Lead.create({ businessId: business._id, sessionId, phone, ...fields });
  state.leadSaved = true;
  return JSON.stringify({ ok: true, message: 'Saved. The owner will contact the customer.' });
}

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
  if (!business || !/^[\w-]{8,64}$/.test(sessionId)) return res.json([]);
  const messages = await PublicMessage.find({ businessId: business._id, sessionId }).sort({ _id: 1 }).limit(100);
  res.json(messages.map((m) => ({ role: m.role, content: m.content })));
});

router.post('/:slug/chat', async (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many messages. Please wait a minute.' });

  const business = await Business.findOne({ slug: req.params.slug });
  if (!business) return res.status(404).json({ error: 'shop not found' });

  const message = String(req.body.message || '').trim();
  const sessionId = String(req.body.sessionId || '');
  if (!message) return res.status(400).json({ error: 'message required' });
  if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE} characters).` });
  if (!/^[\w-]{8,64}$/.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });

  await PublicMessage.create({ businessId: business._id, sessionId, role: 'user', content: message });
  const recent = await PublicMessage.find({ businessId: business._id, sessionId }).sort({ _id: -1 }).limit(HISTORY);
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));

  // Search the owner's documents using the last two things the customer said.
  const query = history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const state = { leadSaved: false };
  try {
    const knowledge = await findKnowledge(business._id, query);
    const reply =
      (await runToolLoop({
        systemPrompt: shopPrompt(business, knowledge),
        history,
        tools: [saveLeadTool],
        execute: (name, args) =>
          name === 'save_lead'
            ? saveLead(business, sessionId, args, state)
            : JSON.stringify({ error: `Unknown tool ${name}` }),
      })) || 'Sorry, I could not answer that. Please try again.';
    await PublicMessage.create({ businessId: business._id, sessionId, role: 'assistant', content: reply });
    res.json({ reply, leadSaved: state.leadSaved });
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
