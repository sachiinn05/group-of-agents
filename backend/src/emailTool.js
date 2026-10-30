import { Attachment } from './db.js';
import { sendGmail } from './google.js';

export const sendEmailTool = {
  type: 'function',
  function: {
    name: 'send_email',
    description:
      "Send an email from the user's connected Gmail account. Use it when the user asks you to send or apply by email. The recipient must be an address the user gave you.",
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'One recipient email address' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain-text email body' },
        attachment_filenames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact names of files the user uploaded in this chat, to attach',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
};

export const TOOLS = { send_email: sendEmailTool };

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

// Runs one tool call. Always returns a string for the model; `sent` collects what really went out.
export async function runTool(name, args, { userId, agentId, knownText, sent }) {
  if (name !== 'send_email') return JSON.stringify({ error: `Unknown tool ${name}` });

  const to = String(args.to || '').trim();
  if (!EMAIL_RE.test(to)) {
    return JSON.stringify({ error: 'Invalid recipient. Send to exactly one valid email address.' });
  }
  // Stops the model from inventing a recipient: the address must appear in the conversation.
  if (!knownText.toLowerCase().includes(to.toLowerCase())) {
    return JSON.stringify({ error: `The user never gave the address ${to}. Ask the user for the recipient address.` });
  }
  if (!args.subject || !args.body) {
    return JSON.stringify({ error: 'subject and body are required' });
  }

  const wanted = Array.isArray(args.attachment_filenames) ? args.attachment_filenames : [];
  const attachments = [];
  for (const filename of wanted) {
    const file = await Attachment.findOne({ userId, agentId, filename }).sort({ _id: -1 });
    if (!file) return JSON.stringify({ error: `No uploaded file named ${filename}` });
    attachments.push(file);
  }

  try {
    const result = await sendGmail(userId, { to, subject: args.subject, body: args.body, attachments });
    sent.push({ to, subject: args.subject, from: result.from, attachments: wanted });
    return JSON.stringify({ ok: true, sent_to: to, from: result.from });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
