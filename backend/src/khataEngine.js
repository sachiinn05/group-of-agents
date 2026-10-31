import { KhataSettings, Due, ReminderLog, DEFAULT_STEPS } from './db.js';
import { getConnection, sendMail } from './mail.js';
import { withSignature } from './emailCompose.js';
import { buildReminder } from './khataCompose.js';
import { logActivity, logActivityOnce } from './activity.js';
import { emitToUser } from './realtime.js';

// The Payment Reminder Agent's engine. For every unpaid due it works out how many days past the due date it is,
// and sends the next reminder of the user's schedule (default: day 1 gentle, day 7 firm, day 15 final).
// It never sends the same step twice, never sends more than one reminder per check, only sends in daytime,
// and stops as soon as the money is paid or the person replies.

const DAY = 86400000;
const MIN_GAP_DAYS = 2; // never two reminders closer than this
const STALE_AFTER_LAST_STEP_DAYS = 30; // long after the last step, stop and leave it to the owner
const PAUSE_AFTER_REPLY_DAYS = 3; // a reply pauses reminders while the owner reads it
const AGENT = 'khata';
const log = (userId, text, kind) => logActivity(userId, text, kind, AGENT);

export const getKhataSettings = (userId) =>
  KhataSettings.findOneAndUpdate({ userId }, { $setOnInsert: { userId, steps: DEFAULT_STEPS } }, { upsert: true, returnDocument: 'after' });

const round2 = (n) => Math.round(n * 100) / 100;
export const balanceOf = (due) => round2(due.amount - (due.payments || []).reduce((s, p) => s + (p.amount || 0), 0));
export const daysOverdue = (due, now = Date.now()) => Math.floor((now - new Date(due.dueDate).getTime()) / DAY);

// The reminder due now for this due, or null. At most ONE, even after the server was off for days:
// older missed steps are marked skipped so they are never sent late.
export function pickStep(steps, overdue, doneSteps) {
  const ready = steps.map((s, index) => ({ ...(s.toObject?.() || s), index })).filter((s) => overdue >= s.days && !doneSteps.has(s.index));
  if (!ready.length) return null;
  return { step: ready.at(-1), skipped: ready.slice(0, -1) };
}

const sentIn24h = (userId) =>
  ReminderLog.countDocuments({ userId, dry: false, outcome: { $in: ['sending', 'sent'] }, createdAt: { $gt: new Date(Date.now() - DAY) } });

// Why the agent must not send right now, or null.
export async function blockReason(userId, settings, now = Date.now()) {
  if (settings.paused) return 'The agent is paused.';
  const hour = new Date(now).getHours();
  if (hour < settings.sendFrom || hour >= settings.sendTo) return `Outside sending hours (${settings.sendFrom}:00 to ${settings.sendTo}:00).`;
  if (settings.mode === 'live') {
    if (!(await getConnection(userId))) return 'No email account is connected.';
    if ((await sentIn24h(userId)) >= settings.dailyLimit) return `Daily limit of ${settings.dailyLimit} reminders reached.`;
  }
  return null;
}

// Writes and sends (or, in test mode, only records) one reminder. The step is claimed in the database FIRST,
// so two overlapping checks can never send the same reminder twice.
async function remind(userId, settings, due, step, overdue, now) {
  const dry = settings.mode !== 'live';
  const balance = balanceOf(due);
  const reason = `${due.name} owes the balance and is ${overdue} days past the due date (step ${step.index + 1}, ${step.tone}).`;
  let entry;
  try {
    entry = await ReminderLog.create({ userId, dueId: due._id, step: step.index, dry, to: due.email, tone: step.tone, outcome: dry ? 'dry_run' : 'sending', reason });
  } catch (e) {
    if (e.code === 11000) return null; // someone else already handled this step
    throw e;
  }
  const earlier = await ReminderLog.countDocuments({ dueId: due._id, dry, outcome: { $in: ['sent', 'dry_run'] }, step: { $ne: step.index } });
  const email = await buildReminder({ settings, due, balance, daysOverdue: overdue, tone: step.tone, earlierReminders: earlier });
  entry.subject = email.subject;
  entry.body = withSignature(email.body, settings);
  entry.reason = `${reason}${email.usedAI ? '' : ' Used the plain template.'}`;
  if (!dry) {
    try {
      const sent = await sendMail(userId, { to: due.email, subject: entry.subject, body: entry.body });
      entry.outcome = 'sent';
      entry.messageId = sent.messageId || undefined;
      await Due.updateOne({ _id: due._id }, { $inc: { remindersSent: 1 }, lastReminderAt: new Date(now) });
    } catch (e) {
      entry.outcome = 'failed';
      entry.error = e.message.slice(0, 300);
    }
  }
  await entry.save();
  return entry;
}

// Checks one user's dues and sends the reminders that are due. `now` is injectable for tests.
export async function runKhata(userId, { now = Date.now() } = {}) {
  const result = { written: 0, sent: 0, failed: 0, stoppedBecause: null };
  const settings = await getKhataSettings(userId);
  const stop = await blockReason(userId, settings, now);
  if (stop) {
    result.stoppedBecause = stop;
    if (!/sending hours/.test(stop)) await logActivityOnce(userId, `Not sending reminders: ${stop}`, 'warn', 30 * 60_000, AGENT);
    return result;
  }
  const dues = await Due.find({ userId, status: 'unpaid', optedOut: false, email: { $ne: '' } }).limit(500);
  for (const due of dues) {
    if (balanceOf(due) <= 0) continue;
    if (due.pausedUntil && due.pausedUntil.getTime() > now) continue; // promised to pay, or replied
    if (due.lastReminderAt && now - due.lastReminderAt.getTime() < MIN_GAP_DAYS * DAY && settings.mode === 'live') continue;

    const dry = settings.mode !== 'live';
    const done = new Set((await ReminderLog.find({ dueId: due._id, dry }, 'step')).map((l) => l.step));
    const overdue = daysOverdue(due, now);
    const pick = pickStep(settings.steps, overdue, done);
    if (!pick) continue;

    const lastStepDay = Math.max(...settings.steps.map((s) => s.days));
    if (overdue > lastStepDay + STALE_AFTER_LAST_STEP_DAYS) {
      await logActivityOnce(userId, `${due.name} is ${overdue} days overdue. The reminders are finished, so this is for you to follow up.`, 'warn', 24 * 3600_000, AGENT);
      continue;
    }
    for (const missed of pick.skipped) {
      await ReminderLog.create({ userId, dueId: due._id, step: missed.index, dry, to: due.email, tone: missed.tone, outcome: 'skipped', reason: 'Too late to send this step.' }).catch(() => {});
    }

    const stopNow = await blockReason(userId, settings, now);
    if (stopNow) {
      result.stoppedBecause = stopNow;
      break;
    }
    try {
      await log(userId, `Writing a ${pick.step.tone} reminder to ${due.name} (${overdue} days past due).`, 'write');
      const entry = await remind(userId, settings, due, pick.step, overdue, now);
      if (!entry) continue;
      result.written++;
      if (entry.outcome === 'sent') {
        result.sent++;
        await log(userId, `Sent a ${entry.tone} reminder to ${due.name}.`, 'send');
      } else if (entry.outcome === 'failed') {
        result.failed++;
        await log(userId, `Could not send to ${due.name}: ${entry.error}`, 'error');
      } else {
        await log(userId, `Prepared a ${entry.tone} reminder for ${due.name} (test mode, not sent).`, 'send');
      }
    } catch (e) {
      console.error('khata reminder failed:', e.message);
      result.failed++;
      await log(userId, `Could not write the reminder for ${due.name}: ${e.message}`, 'error');
    }
  }
  if (result.written) emitToUser(userId, 'khata:changed');
  return result;
}

// An email arrived from someone who owes money. Reminders to them pause for a few days, so the owner can read
// the reply first, and the owner sees what they wrote. Called by the inbox reader. Returns true if it matched.
export async function noteDueReply(userId, msg) {
  const dues = await Due.find({ userId, status: 'unpaid', email: String(msg.fromEmail || '').toLowerCase() });
  if (!dues.length) return false;
  const when = msg.date ? new Date(msg.date) : new Date();
  for (const due of dues) {
    due.repliedAt = when;
    due.replyText = String(msg.text || '').slice(0, 600);
    due.pausedUntil = new Date(Date.now() + PAUSE_AFTER_REPLY_DAYS * DAY);
    await due.save();
    await log(userId, `${due.name} replied about the payment: "${due.replyText.replace(/\s+/g, ' ').slice(0, 90)}". Reminders are paused for ${PAUSE_AFTER_REPLY_DAYS} days so you can read it.`, 'read');
  }
  emitToUser(userId, 'khata:changed');
  return true;
}
