import { useState } from 'react';
import { saveKhataSettings } from '../api.js';

const TONES = [['gentle', 'Gentle'], ['firm', 'Firm'], ['final', 'Final']];

// When to remind, how firm to be, who the reminders come from, and the safety switches.
export default function KhataSettings({ settings, onChanged }) {
  const [form, setForm] = useState({
    businessName: settings.businessName, senderName: settings.senderName, signature: settings.signature, upiId: settings.upiId,
    language: settings.language, dailyLimit: settings.dailyLimit, sendFrom: settings.sendFrom, sendTo: settings.sendTo,
  });
  const [steps, setSteps] = useState(settings.steps);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(fields, okText) {
    setError('');
    setMessage('');
    try {
      await saveKhataSettings(fields);
      setMessage(okText || 'Saved.');
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  const live = settings.mode === 'live';
  const setStep = (i, patch) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="panel-stack">
      <section className="card">
        <h3>Sending</h3>
        {settings.connection ? (
          <p className="ok">Sends from {settings.connection.email} (the account you connected in the Email Agent).</p>
        ) : (
          <p className="muted">No email account is connected yet. Open the Email Agent, go to Settings, and connect your Gmail. This agent uses the same account.</p>
        )}
        <div className="seg">
          <button type="button" className={!live ? 'on' : ''} onClick={() => save({ mode: 'dryrun' }, 'Test mode on. Nothing will be sent.')}>Test mode</button>
          <button type="button" className={live ? 'on' : ''} onClick={() => save({ mode: 'live' }, 'Live. Reminders now go out by themselves.')} disabled={!settings.connection}>Live</button>
        </div>
        <p className="muted small">{live ? 'Live: reminders are sent by themselves, with no approval step.' : 'Test mode: reminders are written and listed under Reminders sent, but not sent. Use it to see what customers would receive.'}</p>
        <label className="check-line">
          <input type="checkbox" checked={settings.paused} onChange={(e) => save({ paused: e.target.checked }, e.target.checked ? 'Paused.' : 'Resumed.')} />
          Pause everything (no reminders until you resume)
        </label>
      </section>

      <section className="card">
        <h3>When to remind</h3>
        <p className="muted small">Days counted from the due date. A negative number is before it (for example -2 is a heads-up two days early). One reminder per check at most, and never two within 2 days.</p>
        {steps.map((s, i) => (
          <div key={i} className="offer-form">
            <label className="mini">Day<input type="number" min="-30" max="365" value={s.days} onChange={(e) => setStep(i, { days: Number(e.target.value) })} /></label>
            <select value={s.tone} onChange={(e) => setStep(i, { tone: e.target.value })}>
              {TONES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            {steps.length > 1 && <button className="link-btn danger" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <div className="link-row">
          {steps.length < 6 && <button className="link-btn" onClick={() => setSteps((l) => [...l, { days: (l.at(-1)?.days || 0) + 7, tone: 'final' }])}>+ Add a reminder</button>}
          <button className="btn small" onClick={() => save({ steps }, 'Schedule saved.')}>Save schedule</button>
        </div>
        <p className="muted small">
          Gentle assumes they forgot. Firm asks for a payment date. Final asks them to pay or reply. None of them threaten, and the amount and dates are always filled in by the system, never by the AI.
        </p>
      </section>

      <form className="card" onSubmit={(e) => { e.preventDefault(); save({ ...form, dailyLimit: Number(form.dailyLimit), sendFrom: Number(form.sendFrom), sendTo: Number(form.sendTo) }); }}>
        <h3>The reminders</h3>
        <label>Business or shop name<input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Sharma General Store" maxLength={80} /></label>
        <label>Your name<input value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} placeholder="Ramesh Sharma" maxLength={80} /></label>
        <label>Your UPI ID (shown in every reminder so they can pay at once)<input value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} placeholder="sharma@okicici" maxLength={80} /></label>
        <label>
          Language
          <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
        <label>Signature<textarea rows={3} value={form.signature} onChange={(e) => setForm({ ...form, signature: e.target.value })} placeholder={'Regards,\nRamesh Sharma'} maxLength={500} /></label>
        <div className="add-row">
          <label>Send from (hour)<input type="number" min="0" max="23" value={form.sendFrom} onChange={(e) => setForm({ ...form, sendFrom: e.target.value })} /></label>
          <label>Send until (hour)<input type="number" min="1" max="24" value={form.sendTo} onChange={(e) => setForm({ ...form, sendTo: e.target.value })} /></label>
          <label>Daily limit<input type="number" min="1" max="400" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} /></label>
        </div>
        <button className="btn small">Save</button>
      </form>

      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
