import { useState } from 'react';
import { saveEmailSettings, getGmailUrl, disconnectGmail } from '../api.js';

// Connect Gmail, choose test or live sending, pause, set the daily limit and your signature.
export default function EmailSettings({ settings, onChanged }) {
  const [senderName, setSenderName] = useState(settings.senderName);
  const [signature, setSignature] = useState(settings.signature);
  const [dailyLimit, setDailyLimit] = useState(settings.dailyLimit);
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

  async function connect() {
    setError('');
    try {
      const { url } = await getGmailUrl();
      window.location.href = url; // Google asks for consent, then sends us back here
    } catch (e) {
      setError(e.message);
    }
  }

  const live = settings.mode === 'live';

  return (
    <div className="panel-stack">
      <section className="card">
        <h3>Gmail</h3>
        {!settings.googleConfigured && (
          <p className="muted">Gmail connection is not set up on this server yet (the owner of the app must add Google credentials; see the README).</p>
        )}
        {settings.gmail ? (
          <>
            <p className="ok">Connected as {settings.gmail}. Emails are sent from this address.</p>
            <button className="link-btn danger" onClick={async () => { await disconnectGmail(); await save({ mode: 'dryrun' }, 'Disconnected.'); }}>Disconnect</button>
          </>
        ) : (
          <>
            <p className="muted">Connect the Gmail account the agent should send from. It only gets permission to send emails, not to read your inbox.</p>
            <button className="btn" onClick={connect} disabled={!settings.googleConfigured}>Connect Gmail</button>
          </>
        )}
      </section>

      <section className="card">
        <h3>Sending</h3>
        <div className="seg">
          <button type="button" className={!live ? 'on' : ''} onClick={() => save({ mode: 'dryrun' }, 'Test mode on. Nothing will be sent.')}>Test mode</button>
          <button type="button" className={live ? 'on' : ''} onClick={() => save({ mode: 'live' }, 'Live. The agent now sends emails by itself.')} disabled={!settings.gmail}>Live</button>
        </div>
        <p className="muted small">
          {live
            ? 'Live: when a situation matches, the agent writes the email and sends it, with no approval step.'
            : 'Test mode: the agent writes the emails and lists them under Sent emails, but does not send them. Use it to check what it writes. Connect Gmail to go live.'}
        </p>
        <label className="check-line">
          <input type="checkbox" checked={settings.paused} onChange={(e) => save({ paused: e.target.checked }, e.target.checked ? 'Paused.' : 'Resumed.')} />
          Pause everything (nothing is sent until you resume)
        </label>
      </section>

      <form className="card" onSubmit={(e) => { e.preventDefault(); save({ senderName, signature, dailyLimit: Number(dailyLimit) }); }}>
        <h3>Your emails</h3>
        <label>
          Your name (the agent writes on your behalf)
          <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sachin Singh" maxLength={80} />
        </label>
        <label>
          Signature (added under every email)
          <textarea rows={3} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={'Regards,\nSachin Singh'} maxLength={500} />
        </label>
        <label>
          Daily limit: the most emails sent in 24 hours
          <input type="number" min="1" max="400" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
        </label>
        <button className="btn small">Save</button>
      </form>

      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
