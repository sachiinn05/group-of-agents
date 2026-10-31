import { AgentEvent } from './db.js';
import { emitToUser } from './realtime.js';

// An agent's activity feed: a line for each thing it does, saved and pushed live to the user's screen,
// so they can watch it work. `agent` says whose line it is ('email' or 'khata'), so each agent shows only its own.
// Never throws: a failed log line must not stop the agent.
export async function logActivity(userId, text, kind = 'info', agent = 'email') {
  try {
    const event = await AgentEvent.create({ userId, agent, kind, text: String(text).slice(0, 300) });
    emitToUser(userId, 'agent:event', { id: event.id, agent, kind, text: event.text, at: event.createdAt });
  } catch (e) {
    console.error('activity log failed:', e.message);
  }
}

// For things that stay true for a while (paused, limit reached): say it once, not every minute.
const recent = new Map();
export async function logActivityOnce(userId, text, kind = 'warn', everyMs = 30 * 60_000, agent = 'email') {
  const key = `${userId}:${agent}:${text}`;
  if (Date.now() - (recent.get(key) || 0) < everyMs) return;
  recent.set(key, Date.now());
  await logActivity(userId, text, kind, agent);
}
