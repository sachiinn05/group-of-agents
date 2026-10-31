import { Contact, Rule, EmailChatMessage, EmailLog, User, TRIGGERS } from './db.js';
import { runToolLoop } from './toolLoop.js';
import { getSettings, isEmail, validateRule, blockReason, deliver, fireContactEvent } from './emailEngine.js';

// The Email Agent you can talk to. It can send an email now, add contacts, change a contact's status,
// and create situations (rules) so emails go out by themselves from then on.

const HISTORY = 10;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send one email now. Only to an address the user gave you or that is in CONTACTS. Write subject and body yourself, plain text, no signature (it is added).',
      parameters: {
        type: 'object',
        properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_contact',
      description: 'Add a person the agent may email. Always pass the name, company and status when the user gave them.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          name: { type: ['string', 'null'] },
          company: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'], description: 'Anything useful to know when writing to them' },
          status: { type: ['string', 'null'], description: 'For example applied, interview, customer. Default new.' },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_contact_status',
      description: "Change a contact's status. Situations that watch that status then react by themselves.",
      parameters: { type: 'object', properties: { email: { type: 'string' }, status: { type: 'string' } }, required: ['email', 'status'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_situation',
      description: 'Create a situation so emails are sent automatically from now on. contact_added: when a contact is added. status_changed: the moment a status becomes `status`. status_for_days: `days` days after the status became `status`, if it has not changed.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          trigger_type: { type: 'string', enum: TRIGGERS },
          status: { type: ['string', 'null'] },
          days: { type: ['number', 'null'] },
          instructions: { type: 'string', description: 'What the email should say, in plain words' },
        },
        required: ['name', 'trigger_type', 'instructions'],
      },
    },
  },
];

const describeTrigger = ({ type, status, days }) =>
  type === 'contact_added' ? 'when a contact is added' : type === 'status_changed' ? `when status becomes "${status}"` : `${days} days after status "${status}"`;

async function buildPrompt(userId, settings) {
  const [user, rules, contacts] = await Promise.all([
    User.findById(userId, 'google'),
    Rule.find({ userId }).sort({ _id: -1 }).limit(20),
    Contact.find({ userId }).sort({ updatedAt: -1 }).limit(40),
  ]);
  const gmail = user?.google?.email ? `connected (${user.google.email})` : 'NOT connected';
  const state = [
    `Sending mode: ${settings.mode === 'live' ? 'LIVE (emails really go out)' : 'TEST (dry-run: emails are written and logged but NOT sent)'}`,
    `Agent paused: ${settings.paused ? 'yes' : 'no'}`,
    `Gmail: ${gmail}`,
    `Daily limit: ${settings.dailyLimit}`,
  ].join('\n');
  const situations = rules.map((r) => `- ${r.name} [${r.enabled ? 'on' : 'off'}]: ${describeTrigger(r.trigger)} -> ${r.instructions}`).join('\n') || '(none yet)';
  const people = contacts.map((c) => `- ${c.name || '(no name)'} <${c.email}> status: ${c.status}${c.company ? `, ${c.company}` : ''}${c.optedOut ? ' [do not email]' : ''}`).join('\n') || '(none yet)';

  return `You are the Email Agent inside a platform of AI agents. You help the user run emails that go out automatically, depending on the situation. Today is ${new Date().toDateString()}.

RULES
- Copy every email address EXACTLY, character for character, as the user typed it. A wrong letter sends the email to a stranger.
- Send an email with send_email only when the user asks you to. Write it yourself: short, polite, plain text, no signature (it is added). Only to an address the user gave you or that is in CONTACTS.
- When the user describes something that should happen automatically ("follow up after 5 days", "thank every new customer"), call create_situation, then explain it back in one line.
- Statuses are free words in lower case, like applied, interview, customer. Changing a status can make situations fire.
- Never say an email was sent unless send_email returned outcome "sent". If the outcome is "dry_run", say it was only prepared because the agent is in test mode, and the user can switch to live sending in Settings.
- If a tool returns an error, explain it simply.
- Keep replies short. Do not discuss anything unrelated to email.

STATE
${state}

SITUATIONS
${situations}

CONTACTS
${people}`;
}

// The model can mistype an address when it copies it (priya.k@x.io -> priyaa.k@x.io), and an email to a
// wrong address cannot be taken back. So an address is only used if the user typed exactly that, or it
// belonged to one of their contacts before this conversation turn.
const NOT_TYPED = (email) =>
  `The address ${email} is not exactly what the user typed. Copy the address character for character from the user's message, or ask them for it.`;

export async function sendEmailTool(userId, settings, args, typed) {
  const to = String(args.to || '').trim().toLowerCase();
  if (!isEmail(to)) return { error: 'Send to exactly one valid email address.' };
  const contact = await Contact.findOne({ userId, email: to });
  if (!contact && !typed.includes(to)) return { error: NOT_TYPED(to) };
  if (contact?.optedOut) return { error: `${to} is marked do-not-email.` };
  const subject = String(args.subject || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  const body = String(args.body || '').trim().slice(0, 3000);
  if (!subject || !body) return { error: 'subject and body are required' };

  const stop = await blockReason(userId, settings);
  if (stop) return { error: stop };
  const log = await deliver({ userId, settings, to, subject, body, contactId: contact?._id, source: 'chat' });
  if (log.outcome === 'failed') return { error: log.error || 'Sending failed.' };
  return { outcome: log.outcome, to, subject, mode: settings.mode };
}

export async function addContactTool(userId, args, typed) {
  const email = String(args.email || '').trim().toLowerCase();
  if (!isEmail(email)) return { error: 'That email address looks invalid.' };
  if (!typed.includes(email)) return { error: NOT_TYPED(email) };
  if (await Contact.exists({ userId, email })) return { error: `${email} is already a contact. Use set_contact_status to change its status.` };
  const contact = await Contact.create({
    userId, email,
    name: String(args.name || '').trim().slice(0, 80),
    company: String(args.company || '').trim().slice(0, 80),
    notes: String(args.notes || '').trim().slice(0, 500),
    status: String(args.status || 'new').trim().toLowerCase().slice(0, 40) || 'new',
  });
  fireContactEvent(userId, contact._id);
  return { ok: true, email, status: contact.status };
}

async function setStatusTool(userId, args) {
  const email = String(args.email || '').trim().toLowerCase();
  const status = String(args.status || '').trim().toLowerCase().slice(0, 40);
  if (!status) return { error: 'Say which status.' };
  const contact = await Contact.findOne({ userId, email });
  if (!contact) return { error: `No contact with the address ${email}. Add them first.` };
  if (contact.status !== status) {
    contact.status = status;
    contact.statusAt = new Date();
    await contact.save();
    fireContactEvent(userId, contact._id);
  }
  return { ok: true, email, status };
}

async function createSituationTool(userId, args) {
  const { fields, error } = validateRule({
    name: args.name,
    instructions: args.instructions,
    trigger: { type: args.trigger_type, status: args.status, days: args.days },
  });
  if (error) return { error };
  const rule = await Rule.create({ userId, ...fields });
  return { ok: true, name: rule.name, runs: describeTrigger(rule.trigger) };
}

// One turn of the conversation. Returns the assistant's reply.
export async function emailAgentReply(userId, message) {
  await EmailChatMessage.create({ userId, role: 'user', content: message });
  const settings = await getSettings(userId);
  const recent = await EmailChatMessage.find({ userId }).sort({ _id: -1 }).limit(HISTORY);
  const history = recent.reverse().map((m) => ({ role: m.role, content: m.content }));
  // Everything the user typed in this conversation. Addresses must match this exactly (see NOT_TYPED).
  const typed = history.filter((m) => m.role === 'user').map((m) => m.content).join('\n').toLowerCase();

  const reply =
    (await runToolLoop({
      systemPrompt: await buildPrompt(userId, settings),
      history,
      tools: TOOLS,
      execute: async (name, args) => {
        try {
          const result =
            name === 'send_email' ? await sendEmailTool(userId, settings, args, typed)
            : name === 'add_contact' ? await addContactTool(userId, args, typed)
            : name === 'set_contact_status' ? await setStatusTool(userId, args)
            : name === 'create_situation' ? await createSituationTool(userId, args)
            : { error: `Unknown tool ${name}` };
          if (process.env.DEBUG_EMAIL_AGENT) console.log(`[email agent] ${name}(${JSON.stringify(args)}) ->`, JSON.stringify(result));
          return JSON.stringify(result);
        } catch (e) {
          console.error(`email tool ${name} failed:`, e.message);
          return JSON.stringify({ error: 'That action failed. Tell the user to try again.' });
        }
      },
    })) || 'Sorry, I could not do that. Please try again.';

  await EmailChatMessage.create({ userId, role: 'assistant', content: reply });
  return reply;
}

export const recentEmailsSent = (userId) => EmailLog.countDocuments({ userId, outcome: 'sent' });
