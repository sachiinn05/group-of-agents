import { useEffect, useState } from 'react';
import { getRules, addRule, updateRule, deleteRule, runEmailRulesNow } from '../api.js';

const TRIGGER_LABEL = {
  contact_added: 'A contact is added',
  status_changed: 'A contact\'s status changes to...',
  status_for_days: 'A contact stays in a status for N days',
};

// One click fills the form with a common situation.
const PRESETS = [
  {
    label: 'Follow up after 5 days',
    name: 'Follow up after 5 days',
    type: 'status_for_days', status: 'applied', days: 5,
    instructions: 'Politely ask if there is any update on my application and say I am still very interested.',
  },
  {
    label: 'Welcome new contact',
    name: 'Welcome new contact',
    type: 'contact_added', status: '', days: 5,
    instructions: 'Welcome them warmly, say it is nice to connect, and that I will be in touch soon.',
  },
  {
    label: 'Thank after interview',
    name: 'Thank after interview',
    type: 'status_changed', status: 'interview', days: 5,
    instructions: 'Thank them for the interview and confirm I am looking forward to it.',
  },
];

const describe = ({ type, status, days }) =>
  type === 'contact_added' ? 'When a contact is added' : type === 'status_changed' ? `The moment a status becomes "${status}"` : `${days} days after the status "${status}", if it has not changed`;

// The situations the agent watches. When one becomes true for a contact, it writes and sends the email.
export default function Situations() {
  const [rules, setRules] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'status_for_days', status: 'applied', days: 5, instructions: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const load = () => getRules().then(setRules).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await addRule({
        name: form.name,
        instructions: form.instructions,
        trigger: { type: form.type, status: form.status, days: Number(form.days) },
      });
      setForm({ name: '', type: 'status_for_days', status: 'applied', days: 5, instructions: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function checkNow() {
    setChecking(true);
    setError('');
    setMessage('');
    try {
      const r = await runEmailRulesNow();
      setMessage(
        r.stoppedBecause
          ? `Stopped: ${r.stoppedBecause}`
          : r.written === 0
            ? 'Checked. Nobody needs an email right now.'
            : `Wrote ${r.written} email${r.written > 1 ? 's' : ''}${r.sent ? `, sent ${r.sent}` : ' (see Sent emails)'}.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  if (!rules) return <p className="muted">{error || 'Loading...'}</p>;

  return (
    <div className="panel-stack">
      <p className="muted">
        A situation says <b>when</b> to email and <b>what</b> to say. The agent checks every minute, writes each email with AI using the contact's details, and sends it.
        Each person gets one email per situation.
      </p>
      <div className="link-row">
        <button className="btn small ghost" onClick={checkNow} disabled={checking}>{checking ? 'Checking...' : 'Check now'}</button>
        {message && <span className="ok">{message}</span>}
      </div>

      <form className="card rule-form" onSubmit={add}>
        <h3>New situation</h3>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="pill" onClick={() => setForm({ name: p.name, type: p.type, status: p.status, days: p.days, instructions: p.instructions })}>
              {p.label}
            </button>
          ))}
        </div>
        <input placeholder="Name (for you)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <label className="mini">
          When
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(TRIGGER_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {form.type !== 'contact_added' && (
          <input placeholder="Status, like applied, interview, customer" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} required />
        )}
        {form.type === 'status_for_days' && (
          <label className="mini">
            Days
            <input type="number" min="1" max="365" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required />
          </label>
        )}
        <textarea rows={3} placeholder="What should the email say? In plain words." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} required maxLength={1000} />
        <button className="btn small">Add situation</button>
      </form>
      {error && <div className="error">{error}</div>}

      {rules.length === 0 && <div className="card muted">No situations yet. Add one above, or just tell the agent in the Agent tab.</div>}
      {rules.map((r) => (
        <div key={r.id} className={`card rule-card ${r.enabled ? '' : 'off'}`}>
          <div className="rule-top">
            <strong>{r.name}</strong>
            <span>
              <button className={`pill ${r.enabled ? 'on' : ''}`} onClick={async () => { await updateRule(r.id, { enabled: !r.enabled }); load(); }}>{r.enabled ? 'On' : 'Off'}</button>{' '}
              <button className="link-btn danger" onClick={async () => { await deleteRule(r.id); load(); }}>Delete</button>
            </span>
          </div>
          <span className="muted">{describe(r.trigger)}</span>
          <span>{r.instructions}</span>
        </div>
      ))}
    </div>
  );
}
