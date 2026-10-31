import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { User } from './db.js';
import { decrypt } from './secrets.js';
import { sendGmail } from './google.js';

// The only file that talks to the user's mailbox. Two ways to be connected:
//   apppassword: a Gmail App Password. One password lets us SEND (SMTP) and READ the inbox (IMAP).
//   oauth:       "Connect Gmail" with Google OAuth. Can only SEND.
// Hosts are configurable so tests can point at a local server.

const smtp = () => ({
  host: process.env.MAIL_SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.MAIL_SMTP_PORT || 465),
  secure: process.env.MAIL_SMTP_SECURE !== 'false',
});
const imap = () => ({
  host: process.env.MAIL_IMAP_HOST || 'imap.gmail.com',
  port: Number(process.env.MAIL_IMAP_PORT || 993),
  secure: process.env.MAIL_IMAP_SECURE !== 'false',
});

// How this user is connected, or null.
export async function getConnection(userId) {
  const user = await User.findById(userId, 'google mailbox');
  if (user?.mailbox?.passwordEnc) {
    try {
      return { type: 'apppassword', email: user.mailbox.email, password: decrypt(user.mailbox.passwordEnc) };
    } catch {
      return null; // the secret key changed: they must reconnect
    }
  }
  if (user?.google?.refreshToken) return { type: 'oauth', email: user.google.email };
  return null;
}

export const canRead = (conn) => conn?.type === 'apppassword';

const friendly = (e) => {
  const text = String(e?.responseText || e?.message || e);
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|535|Application-specific password|Username and Password not accepted/i.test(text)) {
    return new Error('Gmail rejected that password. Use a 16-character App Password (not your normal password), and make sure 2-Step Verification is on.');
  }
  return new Error(`Could not reach the mailbox: ${text.slice(0, 160)}`);
};

// Strips the quoted earlier messages from a reply, so the agent reads only what the person just wrote.
export function stripQuoted(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const cut = lines.findIndex((l) => /^On .{5,200}wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From:\s.+<.+>/.test(l));
  return lines
    .slice(0, cut < 0 ? lines.length : cut)
    .filter((l) => !l.startsWith('>'))
    .join('\n')
    .trim();
}

// A parsed email (from mailparser) in the shape the rest of the app uses.
export function toMessage(uid, parsed) {
  const from = parsed.from?.value?.[0] || {};
  // Read the raw header lines: mailparser files some headers (like List-Unsubscribe) under other names.
  const header = (name) => {
    const found = (parsed.headerLines || []).find((l) => l.key === name);
    return found ? String(found.line).replace(/^[^:]*:\s*/, '') || 'yes' : '';
  };
  return {
    uid,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    references: [].concat(parsed.references || []),
    fromEmail: (from.address || '').toLowerCase(),
    fromName: from.name || '',
    subject: parsed.subject || '',
    text: stripQuoted(parsed.text || '').slice(0, 4000),
    date: parsed.date || new Date(),
    automated: {
      autoSubmitted: String(header('auto-submitted') || ''),
      precedence: String(header('precedence') || ''),
      listUnsubscribe: !!header('list-unsubscribe'),
      autoReplySuppress: !!header('x-auto-response-suppress'),
    },
  };
}

const real = {
  // Sends one email. For replies, inReplyTo and references keep it in the same conversation.
  async send(conn, userId, mail) {
    if (conn.type === 'oauth') {
      const sent = await sendGmail(userId, { to: mail.to, subject: mail.subject, body: mail.body });
      return { messageId: null, from: sent.from };
    }
    const transporter = nodemailer.createTransport({ ...smtp(), auth: { user: conn.email, pass: conn.password } });
    try {
      const info = await transporter.sendMail({
        from: conn.email,
        to: mail.to,
        subject: mail.subject,
        text: mail.body,
        inReplyTo: mail.inReplyTo,
        references: mail.references,
      });
      return { messageId: info.messageId, from: conn.email };
    } catch (e) {
      throw friendly(e);
    }
  },

  // Checks the address and App Password really work, for both reading and sending.
  async verify(email, password) {
    const client = new ImapFlow({ ...imap(), auth: { user: email, pass: password }, logger: false });
    try {
      await client.connect();
    } catch (e) {
      throw friendly(e);
    } finally {
      await client.logout().catch(() => {});
    }
    try {
      await nodemailer.createTransport({ ...smtp(), auth: { user: email, pass: password } }).verify();
    } catch (e) {
      throw friendly(e);
    }
  },

  // New inbox messages after `sinceUid`. With sinceUid null it only reports where the inbox is now,
  // so connecting never makes the agent react to old mail.
  async fetchNew(conn, sinceUid) {
    const client = new ImapFlow({ ...imap(), auth: { user: conn.email, pass: conn.password }, logger: false });
    try {
      await client.connect();
    } catch (e) {
      throw friendly(e);
    }
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const newest = (client.mailbox.uidNext || 1) - 1;
        if (sinceUid == null) return { highestUid: newest, messages: [] };
        if (newest <= sinceUid) return { highestUid: sinceUid, messages: [] };
        const messages = [];
        for await (const msg of client.fetch(`${sinceUid + 1}:${newest}`, { uid: true, source: { maxLength: 400000 } }, { uid: true })) {
          if (msg.uid <= sinceUid) continue; // IMAP can return the last message even when it is older than the range
          messages.push(toMessage(msg.uid, await simpleParser(msg.source)));
          if (messages.length >= 20) break;
        }
        // If we stopped early, continue from where we stopped next time.
        return { highestUid: messages.length >= 20 ? messages.at(-1).uid : newest, messages };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  },
};

let transport = real;
// Tests swap in a fake mailbox here. Call with nothing to go back to the real one.
export const setMailTransport = (fake) => {
  transport = fake || real;
};

export async function sendMail(userId, mail) {
  const conn = await getConnection(userId);
  if (!conn) throw new Error('No email account is connected. Connect Gmail first.');
  return transport.send(conn, userId, mail);
}

export const verifyAppPassword = (email, password) => transport.verify(email, password);

export async function fetchNewMessages(userId, sinceUid) {
  const conn = await getConnection(userId);
  if (!canRead(conn)) throw new Error('Reading the inbox needs a Gmail App Password connection.');
  return transport.fetchNew(conn, sinceUid);
}
