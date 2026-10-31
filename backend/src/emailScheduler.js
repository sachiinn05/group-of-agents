import { Rule, EmailSettings } from './db.js';
import { runForUser } from './emailEngine.js';
import { syncInbox } from './inbox.js';

// Every minute the Email Agent does two things for each user:
//   1. checks the situations ("5 days with no reply") and sends the emails that are due
//   2. reads the inbox, so replies are noticed and answered
// It runs inside the backend process, so the backend has to be running.
let running = false;

export function startEmailScheduler() {
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const withRules = await Rule.distinct('userId', { enabled: true });
      const watchingInbox = await EmailSettings.distinct('userId', { inboxMode: { $ne: 'off' }, paused: false });
      for (const userId of new Set([...withRules, ...watchingInbox].map(String))) {
        await syncInbox(userId); // reply first, so a person who just answered is not followed up
        if (withRules.some((id) => String(id) === userId)) await runForUser(userId);
      }
    } catch (e) {
      console.error('email scheduler failed:', e.message);
    } finally {
      running = false;
    }
  }, 60_000);
}
