import { chat } from './llm.js';

const SYSTEM = `You write ONE short email for the user to send to a contact.
- Plain text only. 60 to 140 words. Warm, polite, specific. No buzzwords, no emojis.
- Use ONLY the facts given. Never invent dates, numbers, prices, promises, links, attachments, job details or names.
- Start with a greeting using the contact's first name if known, otherwise "Hello".
- Do NOT write a signature or sign-off name: it is added automatically.
- Follow the INSTRUCTIONS for what the email should say.
Reply with ONLY a JSON object, nothing else: {"subject": "...", "body": "..."}`;

// Finds the JSON object in the model's reply, even if it wrapped it in text or a code block.
function parse(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const { subject, body } = JSON.parse(text.slice(start, end + 1));
    if (typeof subject !== 'string' || typeof body !== 'string') return null;
    const clean = { subject: subject.replace(/\s+/g, ' ').trim().slice(0, 150), body: body.trim().slice(0, 3000) };
    return clean.subject && clean.body ? clean : null;
  } catch {
    return null;
  }
}

// Asks the model to write the email for this situation. Throws if it cannot produce a usable one.
export async function composeEmail({ settings, contact, instructions, situation }) {
  const daysSince = contact.statusAt ? Math.floor((Date.now() - new Date(contact.statusAt).getTime()) / 86400000) : null;
  const details = {
    from: settings.senderName || 'the user',
    situation,
    instructions,
    contact: {
      name: contact.name || '',
      company: contact.company || '',
      email: contact.email,
      status: contact.status,
      days_in_this_status: daysSince,
      notes: contact.notes || '',
    },
    today: new Date().toDateString(),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await chat(SYSTEM, [{ role: 'user', content: JSON.stringify(details) }]);
    const email = parse(msg.content || '');
    if (email) return email;
  }
  throw new Error('The assistant could not write a usable email for this situation.');
}

// The text that goes under every email: the saved signature, or at least the sender's name.
export const withSignature = (body, settings) => {
  const sign = (settings.signature || settings.senderName || '').trim();
  return sign ? `${body}\n\n${sign}` : body;
};
