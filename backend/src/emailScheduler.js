import { Rule, EmailSettings, Due } from './db.js';
import { runForUser } from './emailEngine.js';
import { runKhata } from './khataEngine.js';
import { syncInbox } from './inbox.js';

// Every minute the agents that work on a schedule do their rounds for each user:
//   Email Agent:             read the inbox, then send the emails its situations call for
//   Payment Reminder Agent:  read the inbox (a reply pauses reminders), then send the reminders that are due
// It runs inside the backend process, so the backend has to be running.
let running = false;

export function startEmailScheduler() {
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const withRules = (await Rule.distinct('userId', { enabled: true })).map(String);
      const withDues = (await Due.distinct('userId', { status: 'unpaid', optedOut: false })).map(String);
      const watchingInbox = (await EmailSettings.distinct('userId', { inboxMode: { $ne: 'off' }, paused: false })).map(String);
      for (const userId of new Set([...withRules, ...withDues, ...watchingInbox])) {
        await syncInbox(userId); // read replies first, so someone who just answered is not chased
        if (withRules.includes(userId)) await runForUser(userId);
        if (withDues.includes(userId)) await runKhata(userId);
      }
    } catch (e) {
      console.error('scheduler failed:', e.message);
    } finally {
      running = false;
    }
  }, 60_000);
}
