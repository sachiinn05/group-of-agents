import { Router } from 'express';
import jwt from 'jsonwebtoken';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { User } from './db.js';
import { requireAuth } from './auth.js';

const router = Router();

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];
const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/google/callback';
const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

async function tokenRequest(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || 'Google token request failed');
    err.code = data.error;
    throw err;
  }
  return data;
}

// Is Gmail connected for this user?
router.get('/status', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId, 'google');
  res.json({
    configured: configured(),
    connected: !!user?.google?.refreshToken,
    email: user?.google?.email || null,
  });
});

// Start the connect flow: the frontend sends the browser to this URL.
router.get('/url', requireAuth, (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: 'Google is not set up: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env' });
  }
  const state = jwt.sign({ id: req.userId, purpose: 'google' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // gives us a refresh token
    prompt: 'consent', // makes Google return the refresh token every time
    state,
  });
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// Google sends the browser back here with ?code=...&state=...
router.get('/callback', async (req, res) => {
  const back = (result) => res.redirect(`${frontendUrl()}/?gmail=${encodeURIComponent(result)}`);
  const { code, state, error } = req.query;
  if (error) return back(`error:${error}`);

  let userId;
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    if (payload.purpose !== 'google') throw new Error('wrong state');
    userId = payload.id;
  } catch {
    return back('error:invalid_state');
  }

  try {
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    });
    if (!tokens.refresh_token) return back('error:no_refresh_token');
    // The id_token carries the Google account's email. We just received it straight from Google.
    const { email } = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString());
    await User.updateOne({ _id: userId }, { google: { email, refreshToken: tokens.refresh_token } });
    back('connected');
  } catch (e) {
    back(`error:${e.code || 'failed'}`);
  }
});

router.post('/disconnect', requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.userId }, { $unset: { google: 1 } });
  res.json({ ok: true });
});

// Builds the raw RFC 2822 message Gmail expects, base64url encoded.
export function buildRawEmail({ from, to, subject, body, attachments = [] }) {
  const mail = new MailComposer({
    from,
    to,
    subject,
    text: body,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.data,
      contentType: a.mimeType,
    })),
  });
  return new Promise((resolve, reject) =>
    mail.compile().build((err, message) => (err ? reject(err) : resolve(message.toString('base64url'))))
  );
}

// Sends an email from the user's connected Gmail account.
export async function sendGmail(userId, { to, subject, body, attachments }) {
  const user = await User.findById(userId, 'google');
  if (!user?.google?.refreshToken) {
    throw new Error('Gmail is not connected. Connect Gmail first.');
  }

  let accessToken;
  try {
    ({ access_token: accessToken } = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: user.google.refreshToken,
    }));
  } catch (e) {
    if (e.code === 'invalid_grant') {
      await User.updateOne({ _id: userId }, { $unset: { google: 1 } });
      throw new Error('Gmail connection expired. Please connect Gmail again.');
    }
    throw e;
  }

  const raw = await buildRawEmail({ from: user.google.email, to, subject, body, attachments });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gmail error: ${data.error?.message || res.status}`);
  return { id: data.id, from: user.google.email };
}

export default router;
