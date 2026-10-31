import { Router } from 'express';
import mongoose from 'mongoose';
import { Contact, Rule, EmailLog, EmailChatMessage, InboxMessage, AgentEvent, User } from './db.js';
import { requireAuth } from './auth.js';
import { getSettings, isEmail, validateRule, runForUser, fireContactEvent } from './emailEngine.js';
import { emailAgentReply } from './emailAgent.js';
import { getConnection, canRead, verifyAppPassword } from './mail.js';
import { encrypt } from './secrets.js';
import { syncInbox, sendDraft, dismissDraft } from './inbox.js';
import { logActivity } from './activity.js';

// The Email Agent's API. Everything here belongs to the logged-in user only.
const router = Router();
router.use(requireAuth);

const validId = (id) => mongoose.isValidObjectId(id);
const cleanStatus = (s) => String(s || '').trim().toLowerCase().slice(0, 40);

// ---- settings ----
const settingsView = async (userId) => {
  const [s, conn] = await Promise.all([getSettings(userId), getConnection(userId)]);
  return {
    mode: s.mode, paused: s.paused, dailyLimit: s.dailyLimit, senderName: s.senderName, signature: s.signature,
    about: s.about, tone: s.tone, styleSample: s.styleSample, inboxMode: s.inboxMode,
    gmail: conn?.email || null, // the connected address (kept under this name for older screens)
    connection: conn ? { type: conn.type, email: conn.email } : null, // apppassword can read the inbox, oauth can only send
    canRead: canRead(conn),
    googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };
};

router.get('/settings', async (req, res) => res.json(await settingsView(req.userId)));

router.put('/settings', async (req, res) => {
  const s = await getSettings(req.userId);
  const { mode, paused, dailyLimit, senderName, signature, about, tone, styleSample, inboxMode } = req.body;
  if (mode !== undefined) {
    if (!['dryrun', 'live'].includes(mode)) return res.status(400).json({ error: 'invalid mode' });
    if (mode === 'live' && !(await getConnection(req.userId))) {
      return res.status(400).json({ error: 'Connect Gmail before turning on live sending.' });
    }
    s.mode = mode;
  }
  if (inboxMode !== undefined) {
    if (!['off', 'draft', 'auto'].includes(inboxMode)) return res.status(400).json({ error: 'invalid inbox mode' });
    s.inboxMode = inboxMode;
  }
  if (tone !== undefined) {
    if (!['friendly', 'formal', 'short'].includes(tone)) return res.status(400).json({ error: 'invalid tone' });
    s.tone = tone;
  }
  if (about !== undefined) s.about = String(about).trim().slice(0, 600);
  if (styleSample !== undefined) s.styleSample = String(styleSample).trim().slice(0, 2500);
  if (paused !== undefined) s.paused = !!paused;
  if (dailyLimit !== undefined) {
    const n = Number(dailyLimit);
    if (!Number.isInteger(n) || n < 1 || n > 400) return res.status(400).json({ error: 'daily limit must be 1 to 400' });
    s.dailyLimit = n;
  }
  if (senderName !== undefined) s.senderName = String(senderName).trim().slice(0, 80);
  if (signature !== undefined) s.signature = String(signature).trim().slice(0, 500);
  await s.save();
  res.json(await settingsView(req.userId));
});

// ---- connect a mailbox with a Gmail App Password (no Google Cloud needed) ----
router.post('/connect/apppassword', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').replace(/\s+/g, ''); // Google shows the password in groups of 4
  if (!isEmail(email)) return res.status(400).json({ error: 'enter your Gmail address' });
  if (password.length < 8) return res.status(400).json({ error: 'enter the 16-character App Password' });
  try {
    await verifyAppPassword(email, password); // proves it works for reading and sending before we save anything
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  await User.updateOne({ _id: req.userId }, { mailbox: { email, passwordEnc: encrypt(password) }, $unset: { google: 1 } });
  const s = await getSettings(req.userId);
  s.lastUid = null; // the next look at the inbox just notes where it is: old mail is never acted on
  await s.save();
  await logActivity(req.userId, `Connected ${email}.`, 'info');
  await syncInbox(req.userId);
  res.json(await settingsView(req.userId));
});

router.post('/disconnect', async (req, res) => {
  await User.updateOne({ _id: req.userId }, { $unset: { mailbox: 1, google: 1 } });
  const s = await getSettings(req.userId);
  s.mode = 'dryrun';
  s.lastUid = null;
  await s.save();
  await logActivity(req.userId, 'Disconnected the email account. Back to test mode.', 'warn');
  res.json(await settingsView(req.userId));
});

// ---- contacts ----
const contactView = (c) => ({
  id: c.id, name: c.name, email: c.email, company: c.company, notes: c.notes,
  status: c.status, statusAt: c.statusAt, optedOut: c.optedOut, lastRepliedAt: c.lastRepliedAt || null,
});

router.get('/contacts', async (req, res) => {
  const contacts = await Contact.find({ userId: req.userId }).sort({ updatedAt: -1 }).limit(500);
  res.json(contacts.map(contactView));
});

router.post('/contacts', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'enter a valid email address' });
  if (await Contact.exists({ userId: req.userId, email })) return res.status(409).json({ error: 'this person is already in your contacts' });
  const contact = await Contact.create({
    userId: req.userId, email,
    name: String(req.body.name || '').trim().slice(0, 80),
    company: String(req.body.company || '').trim().slice(0, 80),
    notes: String(req.body.notes || '').trim().slice(0, 500),
    status: cleanStatus(req.body.status) || 'new',
  });
  fireContactEvent(req.userId, contact._id);
  res.status(201).json(contactView(contact));
});

// Paste many: "Name, email, company, status" per line (only the email is needed)
router.post('/contacts/bulk', async (req, res) => {
  const lines = String(req.body.text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 300);
  let added = 0;
  const skipped = [];
  for (const line of lines) {
    const parts = line.split(/[,|\t]/).map((p) => p.trim());
    const emailAt = parts.findIndex(isEmail);
    if (emailAt < 0) { skipped.push(line); continue; }
    const email = parts[emailAt].toLowerCase();
    const rest = parts.filter((_, i) => i !== emailAt);
    try {
      const contact = await Contact.create({
        userId: req.userId, email,
        name: (rest[0] || '').slice(0, 80), company: (rest[1] || '').slice(0, 80), status: cleanStatus(rest[2]) || 'new',
      });
      fireContactEvent(req.userId, contact._id);
      added++;
    } catch (e) {
      if (e.code === 11000) skipped.push(line); else throw e;
    }
  }
  res.status(201).json({ added, skipped });
});

router.patch('/contacts/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const contact = await Contact.findOne({ _id: req.params.id, userId: req.userId });
  if (!contact) return res.status(404).json({ error: 'not found' });
  const { name, company, notes, status, optedOut } = req.body;
  if (name !== undefined) contact.name = String(name).trim().slice(0, 80);
  if (company !== undefined) contact.company = String(company).trim().slice(0, 80);
  if (notes !== undefined) contact.notes = String(notes).trim().slice(0, 500);
  if (optedOut !== undefined) contact.optedOut = !!optedOut;
  let statusChanged = false;
  if (status !== undefined && cleanStatus(status) && cleanStatus(status) !== contact.status) {
    contact.status = cleanStatus(status);
    contact.statusAt = new Date(); // the clock for "N days with no change" starts again
    statusChanged = true;
  }
  await contact.save();
  if (statusChanged) fireContactEvent(req.userId, contact._id);
  res.json(contactView(contact));
});

router.delete('/contacts/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await Contact.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- situations (rules) ----
const ruleView = (r) => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger, instructions: r.instructions });

router.get('/rules', async (req, res) => {
  res.json((await Rule.find({ userId: req.userId }).sort({ _id: -1 })).map(ruleView));
});

router.post('/rules', async (req, res) => {
  const { fields, error } = validateRule(req.body);
  if (error) return res.status(400).json({ error });
  if ((await Rule.countDocuments({ userId: req.userId })) >= 30) return res.status(400).json({ error: 'You can have up to 30 situations.' });
  res.status(201).json(ruleView(await Rule.create({ userId: req.userId, ...fields })));
});

router.patch('/rules/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const rule = await Rule.findOne({ _id: req.params.id, userId: req.userId });
  if (!rule) return res.status(404).json({ error: 'not found' });
  if (req.body.enabled !== undefined) rule.enabled = !!req.body.enabled;
  if (req.body.name !== undefined || req.body.instructions !== undefined || req.body.trigger !== undefined) {
    const { fields, error } = validateRule({ name: rule.name, instructions: rule.instructions, trigger: rule.trigger, ...req.body });
    if (error) return res.status(400).json({ error });
    Object.assign(rule, fields);
  }
  await rule.save();
  res.json(ruleView(rule));
});

router.delete('/rules/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await Rule.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- the log of every email the agent wrote ----
router.get('/log', async (req, res) => {
  const logs = await EmailLog.find({ userId: req.userId }).sort({ _id: -1 }).limit(100).populate('ruleId', 'name');
  res.json(logs.map((l) => ({
    id: l.id, to: l.to, subject: l.subject, body: l.body, outcome: l.outcome, error: l.error, reason: l.reason,
    source: l.source, rule: l.ruleId?.name || null, at: l.createdAt,
  })));
});

// ---- the inbox: what the agent made of the replies it read ----
const inboxView = (m) => ({
  id: m.id, fromEmail: m.fromEmail, fromName: m.fromName, subject: m.subject, text: m.text, date: m.date,
  category: m.category, outcome: m.outcome, reason: m.reason, draft: m.draft?.body ? { subject: m.draft.subject, body: m.draft.body } : null,
});

router.get('/inbox', async (req, res) => {
  const items = await InboxMessage.find({ userId: req.userId, category: { $ne: 'ignored' }, outcome: { $ne: 'ignored' } }).sort({ date: -1 }).limit(50);
  const ignored = await InboxMessage.countDocuments({ userId: req.userId, outcome: 'ignored' });
  res.json({ items: items.map(inboxView), ignored });
});

router.post('/inbox/sync', async (req, res) => {
  await syncInbox(req.userId);
  res.json({ ok: true });
});

router.post('/inbox/:id/send', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const result = await sendDraft(req.userId, req.params.id, { subject: req.body.subject, body: req.body.body });
  res.status(result.error ? 400 : 200).json(result);
});

router.post('/inbox/:id/dismiss', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const result = await dismissDraft(req.userId, req.params.id);
  res.status(result.error ? 404 : 200).json(result);
});

// ---- what the agent has been doing (also pushed live over the socket) ----
router.get('/activity', async (req, res) => {
  const events = await AgentEvent.find({ userId: req.userId }).sort({ _id: -1 }).limit(80);
  res.json(events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.createdAt })));
});

// A failed email is forgotten, so the next check tries that person again.
router.post('/log/:id/retry', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await EmailLog.deleteOne({ _id: req.params.id, userId: req.userId, outcome: 'failed' });
  if (!deletedCount) return res.status(404).json({ error: 'only failed emails can be retried' });
  res.json({ ok: true });
});

// "Check now" instead of waiting for the next minute
router.post('/run-now', async (req, res) => {
  await syncInbox(req.userId); // read replies first, so someone who just answered is not followed up
  res.json(await runForUser(req.userId));
});

// ---- talk to the agent ----
router.get('/chat', async (req, res) => {
  const messages = await EmailChatMessage.find({ userId: req.userId }).sort({ _id: -1 }).limit(60);
  res.json(messages.reverse().map((m) => ({ role: m.role, content: m.content })));
});

router.post('/chat', async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  if (message.length > 2000) return res.status(400).json({ error: 'message is too long' });
  try {
    res.json({ reply: await emailAgentReply(req.userId, message) });
  } catch (e) {
    console.error('email chat failed:', e.message);
    res.status(e.status === 429 ? 503 : 502).json({ error: e.status === 429 ? 'The assistant is busy. Try again in a few seconds.' : 'The assistant is unavailable right now.' });
  }
});

export default router;
