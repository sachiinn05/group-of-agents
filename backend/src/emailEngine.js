import { EmailSettings, Contact, Rule, EmailLog, TRIGGERS } from './db.js';
import { composeEmail, withSignature } from './emailCompose.js';
import { getConnection, sendMail } from './mail.js';
import { logActivity, logActivityOnce } from './activity.js';

// The Email Agent's engine. It looks for people who are in a situation a rule describes, has the AI write
// the email, and sends it, all by itself. Safety comes first: one email per situation per person, a daily
// limit, a pause switch, "do not email" contacts, and a dry-run mode that writes without sending.

const DAY = 86400000;
const STALE_GRACE_DAYS = 14; // a "follow up after N days" rule ignores people who passed that point long ago
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export const isEmail = (s) => EMAIL_RE.test(String(s || '').trim());

export const getSettings = (userId) =>
  EmailSettings.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, returnDocument: 'after' });

// Checks a rule from the dashboard or from the chat agent. Returns { fields } or { error }.
export function validateRule(body) {
  const name = String(body.name || '').trim().slice(0, 80);
  const instructions = String(body.instructions || '').trim().slice(0, 1000);
  const type = body.trigger?.type;
  const status = String(body.trigger?.status || '').trim().toLowerCase().slice(0, 40);
  const days = Number(body.trigger?.days);
  if (!name) return { error: 'give the situation a name' };
  if (!instructions) return { error: 'say what the email should be about' };
  if (!TRIGGERS.includes(type)) return { error: 'unknown trigger' };
  if (type !== 'contact_added' && !status) return { error: 'say which status this is about' };
  if (type === 'status_for_days' && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
    return { error: 'days must be a whole number from 1 to 365' };
  }
  return {
    fields: { name, instructions, trigger: { type, status: type === 'contact_added' ? '' : status, days: type === 'status_for_days' ? days : 0 } },
  };
}

// Contacts that are in the rule's situation right now.
function dueQuery(rule, now) {
  const base = { userId: rule.userId, optedOut: false };
  const { type, status, days } = rule.trigger;
  if (type === 'contact_added') return { ...base, createdAt: { $gt: new Date(now - DAY) } };
  if (type === 'status_changed') return { ...base, status, statusAt: { $gt: new Date(now - DAY) } };
  return {
    ...base,
    status,
    statusAt: { $lte: new Date(now - days * DAY), $gt: new Date(now - (days + STALE_GRACE_DAYS) * DAY) },
    // "N days with no change" also means no reply: someone who wrote back since the status changed needs no follow-up.
    $expr: { $lt: [{ $ifNull: ['$lastRepliedAt', new Date(0)] }, '$statusAt'] },
  };
}

// The key that marks "we already handled this situation for this person".
const dedupeKey = (rule, contact) =>
  rule.trigger.type === 'contact_added' ? 'added' : `${rule.trigger.type === 'status_changed' ? 's' : 'd'}:${new Date(contact.statusAt).getTime()}`;

const situationText = (rule) => {
  const { type, status, days } = rule.trigger;
  if (type === 'contact_added') return 'The contact was just added.';
  if (type === 'status_changed') return `The contact's status just became "${status}".`;
  return `The contact has been in the status "${status}" for ${days} or more days, with no change and no reply.`;
};

// Why the agent is writing, in one line for the Sent emails list.
const reasonText = (rule, contact) => {
  const { type, status, days } = rule.trigger;
  const who = contact.name || contact.email;
  if (type === 'contact_added') return `${who} was added, and the situation "${rule.name}" welcomes new contacts.`;
  if (type === 'status_changed') return `${who} moved to "${status}", which the situation "${rule.name}" watches.`;
  return `${who} has been "${status}" for ${days}+ days with no reply (situation "${rule.name}").`;
};

// How many real emails went out (or are going out) in the last 24 hours.
const sentLast24h = (userId) =>
  EmailLog.countDocuments({ userId, outcome: { $in: ['sending', 'sent'] }, createdAt: { $gt: new Date(Date.now() - DAY) } });

// Why the agent must not send right now, or null if it may.
export async function blockReason(userId, settings) {
  if (settings.paused) return 'The agent is paused.';
  if (settings.mode === 'live') {
    if (!(await getConnection(userId))) return 'No email account is connected.';
    if ((await sentLast24h(userId)) >= settings.dailyLimit) return `Daily limit of ${settings.dailyLimit} emails reached.`;
  }
  return null;
}

// Sends one email (or, in test mode, only records it). Claims the dedupe key FIRST, so two overlapping
// runs can never send the same email twice. Returns the log, or null if it was already handled.
// For a reply, pass inReplyTo and references so it lands in the same conversation.
export async function deliver({ userId, settings, to, subject, body, ruleId, contactId, source, key, reason, inReplyTo, references }) {
  const live = settings.mode === 'live';
  const text = withSignature(body, settings);
  let log;
  try {
    log = await EmailLog.create({
      userId, ruleId, contactId, source, to, subject, body: text, reason,
      outcome: live ? 'sending' : 'dry_run',
      // A preview must not use up the real key, so switching to live later still sends it.
      dedupeKey: key && (live ? key : `${key}:dry`),
    });
  } catch (e) {
    if (e.code === 11000) return null; // already handled
    throw e;
  }
  if (!live) return log;

  try {
    const sent = await sendMail(userId, { to, subject, body: text, inReplyTo, references });
    log.outcome = 'sent';
    log.messageId = sent.messageId || undefined;
  } catch (e) {
    log.outcome = 'failed';
    log.error = e.message.slice(0, 300);
  }
  await log.save();
  return log;
}

// Looks for people in this rule's situation and emails them. `onlyContactId` limits it to one person
// (used right after a contact is added or changes status).
export async function runRule(rule, settings, { onlyContactId } = {}) {
  const result = { written: 0, sent: 0, failed: 0, stoppedBecause: null };
  const query = dueQuery(rule, Date.now());
  if (onlyContactId) query._id = onlyContactId;
  const contacts = await Contact.find(query).limit(100);

  for (const contact of contacts) {
    const stop = await blockReason(rule.userId, settings);
    if (stop) {
      result.stoppedBecause = stop;
      await logActivityOnce(rule.userId, `Not sending: ${stop}`);
      break;
    }
    if (!isEmail(contact.email)) continue;

    const key = dedupeKey(rule, contact);
    const seenKey = settings.mode === 'live' ? key : `${key}:dry`;
    if (await EmailLog.exists({ ruleId: rule._id, contactId: contact._id, dedupeKey: seenKey })) continue;

    const who = contact.name || contact.email;
    try {
      await logActivity(rule.userId, `Writing an email to ${who}: ${reasonText(rule, contact)}`, 'write');
      const previous = await EmailLog.find({ userId: rule.userId, contactId: contact._id, outcome: { $in: ['sent', 'dry_run'] } }).sort({ _id: -1 }).limit(2);
      const email = await composeEmail({ settings, contact, instructions: rule.instructions, situation: situationText(rule), previous });
      const log = await deliver({
        userId: rule.userId, settings, to: contact.email, subject: email.subject, body: email.body,
        ruleId: rule._id, contactId: contact._id, source: 'rule', key, reason: reasonText(rule, contact),
      });
      if (!log) continue;
      result.written++;
      if (log.outcome === 'sent') {
        result.sent++;
        await logActivity(rule.userId, `Sent "${email.subject}" to ${who}.`, 'send');
      } else if (log.outcome === 'failed') {
        result.failed++;
        await logActivity(rule.userId, `Could not send to ${who}: ${log.error}`, 'error');
      } else {
        await logActivity(rule.userId, `Prepared "${email.subject}" for ${who} (test mode, not sent).`, 'send');
      }
    } catch (e) {
      console.error('email rule failed:', e.message);
      result.failed++;
      await logActivity(rule.userId, `Could not write the email for ${who}: ${e.message}`, 'error');
    }
  }
  return result;
}

// Runs every enabled rule of one user.
export async function runForUser(userId) {
  const settings = await getSettings(userId);
  const total = { written: 0, sent: 0, failed: 0, stoppedBecause: null };
  for (const rule of await Rule.find({ userId, enabled: true })) {
    const r = await runRule(rule, settings);
    total.written += r.written;
    total.sent += r.sent;
    total.failed += r.failed;
    total.stoppedBecause ||= r.stoppedBecause;
    if (r.stoppedBecause) break; // paused, not connected or over the limit: no point trying the other rules
  }
  return total;
}

// Something just happened to one contact (added, or its status changed): react right away.
// Runs in the background so the request that caused it does not wait for the AI.
export function fireContactEvent(userId, contactId) {
  setImmediate(async () => {
    try {
      const settings = await getSettings(userId);
      for (const rule of await Rule.find({ userId, enabled: true, 'trigger.type': { $in: ['contact_added', 'status_changed'] } })) {
        const r = await runRule(rule, settings, { onlyContactId: contactId });
        if (r.stoppedBecause) break;
      }
    } catch (e) {
      console.error('email event failed:', e.message);
    }
  });
}
