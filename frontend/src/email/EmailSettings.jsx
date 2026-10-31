import { useState } from 'react';
import { saveEmailSettings, getGmailUrl, connectAppPassword, disconnectMailbox } from '../api.js';

const INBOX_MODES = [
  ['off', 'Off', 'The agent does not read your inbox.'],
  ['draft', 'Draft', 'It reads replies, updates statuses, and writes draft answers for you to approve. It never sends a reply by itself.'],
  ['auto', 'Auto', 'It also sends the safe replies by itself (a thank-you after a rejection, a simple question). Anything about times, money or decisions still waits for you.'],
];

// Connect the mailbox, choose test or live, how the agent writes, and how it handles replies.
export default function EmailSettings({ settings, onChanged }) {
  const [form, setForm] = useState({
    senderName: settings.senderName, signature: settings.signature, about: settings.about,
    tone: settings.tone, styleSample: settings.styleSample, dailyLimit: settings.dailyLimit,
  });
  const [mail, setMail] = useState({ email: '', password: '' });
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(fields, okText) {
    setError('');
    setMessage('');
    try {
      await saveEmailSettings(fields);
      setMessage(okText || 'Saved.');
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  async function connect(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setConnecting(true);
    try {
      await connectAppPassword(mail.email, mail.password);
      setMail({ email: '', password: '' });
      setMessage('Connected. The agent can now read your inbox and send emails. Turn on Live when you are ready.');
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function googleConnect() {
    setError('');
    try {
      const { url } = await getGmailUrl();
      window.location.href = url; // Google asks for consent, then sends us back here
    } catch (e) {
      setError(e.message);
    }
  }

  const live = settings.mode === 'live';
  const conn = settings.connection;

  return (
    <div className="panel-stack">
      <section className="card">
        <h3>Your email account</h3>
        {conn ? (
          <>
            <p className="ok">
              Connected: {conn.email} {conn.type === 'apppassword' ? '(can send and read your inbox)' : '(can send only)'}
            </p>
            {!settings.canRead && <p className="muted small">To let the agent read replies, connect with an App Password instead.</p>}
            <button className="link-btn danger" onClick={async () => { await disconnectMailbox(); setMessage('Disconnected. Back to test mode.'); await onChanged(); }}>Disconnect</button>
          </>
        ) : (
          <>
            <p className="muted">Connect the Gmail account the agent works from. This takes about 2 minutes and needs no developer setup.</p>
            <ol className="steps">
              <li>Turn on <b>2-Step Verification</b> for your Google account (myaccount.google.com/security).</li>
              <li>Open <b>myaccount.google.com/apppasswords</b>, create an App Password called "Email Agent", and copy the 16 letters.</li>
              <li>Paste your Gmail address and that App Password below.</li>
            </ol>
            <form className="rule-form" onSubmit={connect}>
              <input type="email" placeholder="you@gmail.com" value={mail.email} onChange={(e) => setMail({ ...mail, email: e.target.value })} required />
              <input type="password" placeholder="16-letter App Password" autoComplete="off" value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} required />
              <button className="btn" disabled={connecting}>{connecting ? 'Checking with Gmail...' : 'Connect'}</button>
            </form>
            <p className="muted small">The password is stored encrypted and only used to send and read mail for this agent. You can remove it any time in your Google account.</p>
            <details>
              <summary className="muted small">Or connect with Google sign-in (can send, cannot read your inbox)</summary>
              {settings.googleConfigured ? (
                <button className="btn small ghost" onClick={googleConnect}>Connect with Google</button>
              ) : (
                <p className="muted small">Not set up on this server. See the README if you want this option.</p>
              )}
            </details>
          </>
        )}
      </section>

      <section className="card">
        <h3>Sending</h3>
        <div className="seg">
          <button type="button" className={!live ? 'on' : ''} onClick={() => save({ mode: 'dryrun' }, 'Test mode on. Nothing will be sent.')}>Test mode</button>
          <button type="button" className={live ? 'on' : ''} onClick={() => save({ mode: 'live' }, 'Live. The agent now sends emails by itself.')} disabled={!conn}>Live</button>
        </div>
        <p className="muted small">
          {live
            ? 'Live: when a situation matches, the agent writes the email and sends it, with no approval step.'
            : 'Test mode: the agent writes the emails and lists them under Sent emails, but does not send them. Use it to check what it writes. Connect your email to go live.'}
        </p>
        <label className="check-line">
          <input type="checkbox" checked={settings.paused} onChange={(e) => save({ paused: e.target.checked }, e.target.checked ? 'Paused.' : 'Resumed.')} />
          Pause everything (nothing is sent until you resume)
        </label>
      </section>

      <section className="card">
        <h3>Replies in your inbox</h3>
        <div className="seg">
          {INBOX_MODES.map(([key, label]) => (
            <button key={key} type="button" className={settings.inboxMode === key ? 'on' : ''} disabled={!settings.canRead && key !== 'off'}
              onClick={() => save({ inboxMode: key }, `Inbox mode: ${label}.`)}>{label}</button>
          ))}
        </div>
        <p className="muted small">{INBOX_MODES.find(([k]) => k === settings.inboxMode)?.[2]}</p>
        {!settings.canRead && <p className="muted small">Connect with an App Password above to turn this on.</p>}
        <p className="muted small">It only handles emails from your contacts (or answers to emails it sent), only mail newer than 3 days, and it ignores newsletters and automatic replies.</p>
      </section>

      <form className="card" onSubmit={(e) => { e.preventDefault(); save({ ...form, dailyLimit: Number(form.dailyLimit) }); }}>
        <h3>How the agent writes for you</h3>
        <label>
          Your name
          <input value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} placeholder="Sachin Singh" maxLength={80} />
        </label>
        <label>
          About you (so emails are specific)
          <textarea rows={3} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} placeholder="Fresher full-stack developer (React, Node). Applying for junior roles." maxLength={600} />
        </label>
        <label>
          Tone
          <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
            <option value="friendly">Friendly and natural</option>
            <option value="formal">Formal and respectful</option>
            <option value="short">Very short and direct</option>
          </select>
        </label>
        <label>
          Paste an email you wrote (optional). The agent copies your voice, not your sentences.
          <textarea rows={4} value={form.styleSample} onChange={(e) => setForm({ ...form, styleSample: e.target.value })} placeholder="Hi Anita, thanks for the call today..." maxLength={2500} />
        </label>
        <label>
          Signature (added under every email)
          <textarea rows={3} value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} placeholder={'Regards,\nSachin Singh'} maxLength={500} />
        </label>
        <label>
          Daily limit: the most emails sent in 24 hours
          <input type="number" min="1" max="400" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} />
        </label>
        <button className="btn small">Save</button>
      </form>

      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
