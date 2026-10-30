import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { telegramConfigured, getBotUsername, sendTelegram } from './telegram.js';
import mongoose from 'mongoose';
import multer from 'multer';
import { Business, Document, Lead } from './db.js';
import { requireAuth } from './auth.js';
import { extractText, isSupported } from './extractText.js';

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });

const INFO_FIELDS = ['address', 'phone', 'timings', 'delivery', 'payments', 'policies'];
const pickInfo = (body = {}) =>
  Object.fromEntries(INFO_FIELDS.filter((k) => typeof body[k] === 'string').map((k) => [k, body[k].trim()]));

async function makeSlug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  let slug = base;
  while (await Business.exists({ slug })) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  return slug;
}

const mine = (req) => Business.findOne({ ownerId: req.userId });

// The owner's shop, with its documents
router.get('/', async (req, res) => {
  const business = await mine(req);
  if (!business) return res.json(null);
  const documents = await Document.find({ businessId: business._id }, 'filename createdAt');
  res.json({
    id: business.id,
    name: business.name,
    slug: business.slug,
    type: business.type,
    info: business.info,
    documents: documents.map((d) => ({ id: d.id, filename: d.filename })),
  });
});

// Set up the shop (one per owner)
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'shop name required' });
  if (await mine(req)) return res.status(409).json({ error: 'you already have a shop' });
  const business = await Business.create({
    ownerId: req.userId,
    name,
    slug: await makeSlug(name),
    info: pickInfo(req.body.info),
  });
  res.status(201).json({ id: business.id, slug: business.slug });
});

// Edit shop details
router.put('/', async (req, res) => {
  const business = await mine(req);
  if (!business) return res.status(404).json({ error: 'no shop yet' });
  if (typeof req.body.name === 'string' && req.body.name.trim()) business.name = req.body.name.trim();
  business.info = { ...business.info.toObject(), ...pickInfo(req.body.info) };
  await business.save();
  res.json({ ok: true });
});

// Upload documents (price list, catalogue, FAQ)
router.post('/documents', upload.array('files', 5), async (req, res) => {
  const business = await mine(req);
  if (!business) return res.status(404).json({ error: 'no shop yet' });
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'no files uploaded' });

  const saved = [];
  for (const f of files) {
    if (!isSupported(f.originalname)) return res.status(400).json({ error: `Unsupported file type: ${f.originalname}` });
    let text;
    try {
      text = await extractText(f.originalname, f.buffer);
    } catch (e) {
      return res.status(400).json({ error: `Could not read ${f.originalname}: ${e.message}` });
    }
    if (!text) return res.status(400).json({ error: `No readable text in ${f.originalname}` });
    const doc = await Document.create({ businessId: business._id, filename: f.originalname, text });
    saved.push({ id: doc.id, filename: doc.filename });
  }
  res.status(201).json({ documents: saved });
});

router.delete('/documents/:id', async (req, res) => {
  const business = await mine(req);
  if (!business || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await Document.deleteOne({ _id: req.params.id, businessId: business._id });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Telegram alerts ----

// Is the bot set up on the server, and is this owner's Telegram linked?
router.get('/telegram', async (req, res) => {
  const business = await mine(req);
  if (!business) return res.status(404).json({ error: 'no shop yet' });
  res.json({ configured: telegramConfigured(), connected: !!business.telegram?.chatId });
});

// Starts linking: returns a t.me link that opens the bot with a one-time code.
router.post('/telegram/link', async (req, res) => {
  const business = await mine(req);
  if (!business) return res.status(404).json({ error: 'no shop yet' });
  if (!telegramConfigured()) return res.status(503).json({ error: 'Telegram alerts are not set up on this server yet.' });
  const linkCode = randomBytes(8).toString('hex');
  await Business.updateOne({ _id: business._id }, { 'telegram.linkCode': linkCode });
  try {
    res.json({ url: `https://t.me/${await getBotUsername()}?start=${linkCode}` });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach Telegram. Check the bot token.' });
  }
});

router.post('/telegram/test', async (req, res) => {
  const business = await mine(req);
  if (!business?.telegram?.chatId) return res.status(400).json({ error: 'Telegram is not connected' });
  try {
    await sendTelegram(business.telegram.chatId, `Test alert from ${business.name}. You will get orders here.`);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'Could not send the test message.' });
  }
});

router.post('/telegram/disconnect', async (req, res) => {
  const business = await mine(req);
  if (!business) return res.status(404).json({ error: 'no shop yet' });
  await Business.updateOne({ _id: business._id }, { $unset: { telegram: 1 } });
  res.json({ ok: true });
});

// Leads captured by the agent, newest first
router.get('/leads', async (req, res) => {
  const business = await mine(req);
  if (!business) return res.json([]);
  const leads = await Lead.find({ businessId: business._id }).sort({ _id: -1 }).limit(200);
  res.json(
    leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      note: l.note,
      status: l.status,
      createdAt: l.createdAt,
    }))
  );
});

router.patch('/leads/:id', async (req, res) => {
  const business = await mine(req);
  const { status } = req.body;
  if (!business || !mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  if (!['new', 'contacted', 'done'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  const { matchedCount } = await Lead.updateOne({ _id: req.params.id, businessId: business._id }, { status });
  if (!matchedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

export default router;
