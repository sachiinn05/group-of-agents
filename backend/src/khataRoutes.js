import { Router } from 'express';
import mongoose from 'mongoose';
import { Due, ReminderLog, AgentEvent, REMINDER_TONES } from './db.js';
import { requireAuth } from './auth.js';
import { getConnection } from './mail.js';
import { isEmail } from './emailEngine.js';
import { logActivity } from './activity.js';
import { getKhataSettings, runKhata, balanceOf, daysOverdue, pickStep } from './khataEngine.js';
import { whatsappText, whatsappLink } from './khataCompose.js';

// The Payment Reminder Agent's API. Everything here belongs to the logged-in user only.
const router = Router();
router.use(requireAuth);

const validId = (id) => mongoose.isValidObjectId(id);
const round2 = (n) => Math.round(n * 100) / 100;
const MAX_AMOUNT = 100_000_000;

// "2026-11-05" or "5/11/2026" or "05-11-2026" (day first) -> a Date at the start of that day, or null
function parseDate(text) {
  const s = String(text || '').trim();
  let y, m, d;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) [, d, m, y] = match;
  else return null;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? date : null;
}

const digits = (s) => String(s || '').replace(/\D/g, '');
const cleanPhone = (s) => (digits(s).length >= 8 && digits(s).length <= 15 ? digits(s) : '');

// Checks the fields of a due. With `partial`, only fields that were sent are checked.
function cleanDue(body, partial = false) {
  const f = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return { error: 'enter the customer\'s name' };
    f.name = name;
  }
  if (!partial || body.amount !== undefined) {
    const amount = round2(Number(String(body.amount ?? '').replace(/[₹,\s]|rs\.?/gi, '')));
    if (!(amount > 0) || amount > MAX_AMOUNT) return { error: 'enter the amount owed (more than 0)' };
    f.amount = amount;
  }
  if (!partial || body.dueDate !== undefined) {
    const date = parseDate(body.dueDate);
    if (!date) return { error: 'enter the due date like 2026-11-05 or 5/11/2026' };
    f.dueDate = date;
  }
  if (body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase();
    if (email && !isEmail(email)) return { error: 'that email address looks invalid' };
    f.email = email;
  }
  if (body.phone !== undefined) {
    const raw = String(body.phone || '').trim();
    if (raw && !cleanPhone(raw)) return { error: 'that phone number looks invalid' };
    f.phone = cleanPhone(raw);
  }
  if (body.note !== undefined) f.note = String(body.note || '').trim().slice(0, 120);
  return { fields: f };
}

// ---- settings ----
const settingsView = async (userId) => {
  const [s, conn] = await Promise.all([getKhataSettings(userId), getConnection(userId)]);
  return {
    mode: s.mode, paused: s.paused, dailyLimit: s.dailyLimit, businessName: s.businessName, senderName: s.senderName,
    signature: s.signature, upiId: s.upiId, language: s.language, useAI: s.useAI,
    steps: s.steps.map((x) => ({ days: x.days, tone: x.tone })), sendFrom: s.sendFrom, sendTo: s.sendTo,
    connection: conn ? { type: conn.type, email: conn.email } : null, canRead: conn?.type === 'apppassword',
  };
};

router.get('/settings', async (req, res) => res.json(await settingsView(req.userId)));

router.put('/settings', async (req, res) => {
  const s = await getKhataSettings(req.userId);
  const b = req.body;
  if (b.mode !== undefined) {
    if (!['dryrun', 'live'].includes(b.mode)) return res.status(400).json({ error: 'invalid mode' });
    if (b.mode === 'live' && !(await getConnection(req.userId))) {
      return res.status(400).json({ error: 'Connect your email (Email Agent > Settings) before turning on live sending.' });
    }
    s.mode = b.mode;
  }
  if (b.paused !== undefined) s.paused = !!b.paused;
  if (b.language !== undefined) {
    if (!['en', 'hi'].includes(b.language)) return res.status(400).json({ error: 'invalid language' });
    s.language = b.language;
  }
  if (b.useAI !== undefined) s.useAI = !!b.useAI;
  if (b.dailyLimit !== undefined) {
    const n = Number(b.dailyLimit);
    if (!Number.isInteger(n) || n < 1 || n > 400) return res.status(400).json({ error: 'daily limit must be 1 to 400' });
    s.dailyLimit = n;
  }
  if (b.sendFrom !== undefined || b.sendTo !== undefined) {
    const from = Number(b.sendFrom ?? s.sendFrom);
    const to = Number(b.sendTo ?? s.sendTo);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 23 || to < 1 || to > 24 || from >= to) {
      return res.status(400).json({ error: 'sending hours must be like 9 to 20' });
    }
    s.sendFrom = from;
    s.sendTo = to;
  }
  if (b.steps !== undefined) {
    const steps = Array.isArray(b.steps) ? b.steps.map((x) => ({ days: Number(x.days), tone: x.tone })) : [];
    const ok = steps.length >= 1 && steps.length <= 6 && steps.every((x) => Number.isInteger(x.days) && x.days >= -30 && x.days <= 365 && REMINDER_TONES.includes(x.tone));
    if (!ok) return res.status(400).json({ error: 'give 1 to 6 reminders, each with whole days (-30 to 365) and a tone' });
    if (new Set(steps.map((x) => x.days)).size !== steps.length) return res.status(400).json({ error: 'two reminders cannot be on the same day' });
    s.steps = steps.sort((x, y) => x.days - y.days);
  }
  for (const key of ['businessName', 'senderName', 'upiId']) if (b[key] !== undefined) s[key] = String(b[key]).trim().slice(0, 80);
  if (b.signature !== undefined) s.signature = String(b.signature).trim().slice(0, 500);
  await s.save();
  res.json(await settingsView(req.userId));
});

// ---- dues ----
async function dueViews(userId, dues) {
  const settings = await getKhataSettings(userId);
  const logs = await ReminderLog.find({ dueId: { $in: dues.map((d) => d._id) }, outcome: { $in: ['sent', 'dry_run', 'skipped'] } }, 'dueId step dry');
  const doneBy = new Map();
  for (const l of logs) {
    const key = `${l.dueId}:${settings.mode !== 'live' ? 'dry' : 'live'}`;
    if (l.dry === (settings.mode !== 'live')) (doneBy.get(key) || doneBy.set(key, new Set()).get(key)).add(l.step);
  }
  const now = Date.now();
  return dues.map((d) => {
    const overdue = daysOverdue(d, now);
    const balance = balanceOf(d);
    const done = doneBy.get(`${d._id}:${settings.mode !== 'live' ? 'dry' : 'live'}`) || new Set();
    const nextStep = settings.steps.map((s, i) => ({ days: s.days, tone: s.tone, i })).find((s) => !done.has(s.i));
    return {
      id: d.id, name: d.name, email: d.email, phone: d.phone, amount: d.amount, balance, paid: round2(d.amount - balance),
      dueDate: d.dueDate, daysOverdue: overdue, note: d.note, status: d.status, paidAt: d.paidAt, optedOut: d.optedOut,
      pausedUntil: d.pausedUntil, repliedAt: d.repliedAt, replyText: d.replyText, remindersSent: d.remindersSent, lastReminderAt: d.lastReminderAt,
      nextReminder: d.status === 'unpaid' && nextStep ? { days: nextStep.days, tone: nextStep.tone, inDays: nextStep.days - overdue } : null,
      payments: (d.payments || []).map((p) => ({ amount: p.amount, at: p.at, note: p.note })),
    };
  });
}

router.get('/dues', async (req, res) => {
  const filter = { userId: req.userId };
  if (['unpaid', 'paid'].includes(req.query.status)) filter.status = req.query.status;
  const dues = await Due.find(filter).sort(req.query.status === 'paid' ? { paidAt: -1 } : { dueDate: 1 }).limit(500);
  res.json(await dueViews(req.userId, dues));
});

router.get('/summary', async (req, res) => {
  const unpaid = await Due.find({ userId: req.userId, status: 'unpaid' });
  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paidThisMonth = await Due.find({ userId: req.userId, 'payments.at': { $gte: monthStart } });
  const collected = paidThisMonth.reduce((s, d) => s + d.payments.filter((p) => p.at >= monthStart).reduce((x, p) => x + p.amount, 0), 0);
  res.json({
    people: unpaid.length,
    outstanding: round2(unpaid.reduce((s, d) => s + balanceOf(d), 0)),
    overdue: round2(unpaid.filter((d) => daysOverdue(d, now) > 0).reduce((s, d) => s + balanceOf(d), 0)),
    collectedThisMonth: round2(collected),
  });
});

router.post('/dues', async (req, res) => {
  const { fields, error } = cleanDue(req.body);
  if (error) return res.status(400).json({ error });
  const due = await Due.create({ userId: req.userId, ...fields });
  await logActivity(req.userId, `Added ${due.name}: ${due.amount} due.`, 'info', 'khata');
  res.status(201).json((await dueViews(req.userId, [due]))[0]);
});

// Paste many: "Name | amount | due date | phone or email | note"
router.post('/dues/bulk', async (req, res) => {
  const lines = String(req.body.text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 300);
  const added = [];
  const skipped = [];
  for (const line of lines) {
    const parts = (line.includes('|') ? line.split('|') : line.split(',')).map((p) => p.trim());
    const contact = parts[3] || '';
    const { fields, error } = cleanDue({
      name: parts[0], amount: parts[1], dueDate: parts[2],
      email: isEmail(contact) ? contact : '', phone: !isEmail(contact) ? contact : '', note: parts.slice(4).join(', '),
    });
    if (error) skipped.push(`${line}  (${error})`);
    else added.push({ userId: req.userId, ...fields });
  }
  if (added.length) await Due.insertMany(added);
  res.status(201).json({ added: added.length, skipped });
});

router.patch('/dues/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const due = await Due.findOne({ _id: req.params.id, userId: req.userId });
  if (!due) return res.status(404).json({ error: 'not found' });
  const { fields, error } = cleanDue(req.body, true);
  if (error) return res.status(400).json({ error });
  Object.assign(due, fields);
  if (req.body.optedOut !== undefined) due.optedOut = !!req.body.optedOut;
  if (req.body.pausedUntil !== undefined) {
    if (!req.body.pausedUntil) due.pausedUntil = undefined;
    else {
      const date = parseDate(req.body.pausedUntil);
      if (!date) return res.status(400).json({ error: 'enter the date like 2026-11-05' });
      due.pausedUntil = date;
    }
  }
  if (balanceOf(due) < 0) return res.status(400).json({ error: 'the amount is less than what was already paid' });
  await due.save();
  res.json((await dueViews(req.userId, [due]))[0]);
});

// A payment, full or part. When nothing is left, the due is paid and reminders stop.
router.post('/dues/:id/payment', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const due = await Due.findOne({ _id: req.params.id, userId: req.userId, status: 'unpaid' });
  if (!due) return res.status(404).json({ error: 'not found' });
  const balance = balanceOf(due);
  const amount = req.body.full ? balance : round2(Number(req.body.amount));
  if (!(amount > 0)) return res.status(400).json({ error: 'enter the amount received' });
  if (amount > balance) return res.status(400).json({ error: `that is more than what is owed (${balance})` });
  due.payments.push({ amount, note: String(req.body.note || '').slice(0, 100) });
  const left = balanceOf(due);
  if (left <= 0) {
    due.status = 'paid';
    due.paidAt = new Date();
  }
  await due.save();
  await logActivity(req.userId, left <= 0 ? `${due.name} has paid in full. Reminders stopped.` : `${due.name} paid ${amount}. ${left} still pending.`, 'send', 'khata');
  res.json((await dueViews(req.userId, [due]))[0]);
});

router.delete('/dues/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await Due.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  await ReminderLog.deleteMany({ dueId: req.params.id, userId: req.userId });
  res.json({ ok: true });
});

// A message ready to send on WhatsApp (for people with a phone number but no email)
router.get('/dues/:id/message', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const due = await Due.findOne({ _id: req.params.id, userId: req.userId });
  if (!due) return res.status(404).json({ error: 'not found' });
  const settings = await getKhataSettings(req.userId);
  const overdue = daysOverdue(due);
  // The tone of the latest step already reached, or the first one
  const reached = settings.steps.filter((s) => overdue >= s.days).at(-1) || settings.steps[0];
  const tone = REMINDER_TONES.includes(req.query.tone) ? req.query.tone : reached.tone;
  const text = whatsappText({ settings, due, balance: balanceOf(due), daysOverdue: overdue, tone });
  res.json({ tone, text, whatsappLink: whatsappLink(settings, due.phone, text) });
});

// ---- the reminders the agent wrote ----
router.get('/log', async (req, res) => {
  const logs = await ReminderLog.find({ userId: req.userId, outcome: { $ne: 'skipped' } }).sort({ _id: -1 }).limit(100).populate('dueId', 'name');
  res.json(logs.map((l) => ({
    id: l.id, to: l.to, name: l.dueId?.name || '', subject: l.subject, body: l.body, tone: l.tone, outcome: l.outcome,
    error: l.error, reason: l.reason, at: l.createdAt,
  })));
});

router.post('/log/:id/retry', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await ReminderLog.deleteOne({ _id: req.params.id, userId: req.userId, outcome: 'failed' });
  if (!deletedCount) return res.status(404).json({ error: 'only failed reminders can be retried' });
  res.json({ ok: true });
});

router.post('/run-now', async (req, res) => res.json(await runKhata(req.userId)));

router.get('/activity', async (req, res) => {
  const events = await AgentEvent.find({ userId: req.userId, agent: 'khata' }).sort({ _id: -1 }).limit(80);
  res.json(events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.createdAt })));
});

export default router;
