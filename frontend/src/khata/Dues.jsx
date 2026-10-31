import { useEffect, useState } from 'react';
import { getDues, addDue, addDuesBulk, updateDue, deleteDue, payDue, getDueMessage } from '../api.js';
import { rupees } from '../Menu.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const blank = { name: '', amount: '', dueDate: today(), phone: '', email: '', note: '' };
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const dueText = (d) =>
  d.daysOverdue > 0 ? `${d.daysOverdue} day${d.daysOverdue > 1 ? 's' : ''} late` : d.daysOverdue === 0 ? 'due today' : `due in ${-d.daysOverdue} day${d.daysOverdue < -1 ? 's' : ''}`;

// The message for people without an email: copy it, or open WhatsApp with it ready.
function Message({ due }) {
  const [tone, setTone] = useState('');
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDueMessage(due.id, tone || undefined).then(setMsg).catch(() => setMsg(null));
  }, [due.id, tone]);

  if (!msg) return <p className="muted small">Preparing the message...</p>;
  return (
    <div className="draft">
      <div className="link-row">
        <strong>Message for {due.name}</strong>
        <select value={tone || msg.tone} onChange={(e) => setTone(e.target.value)}>
          <option value="gentle">Gentle</option>
          <option value="firm">Firm</option>
          <option value="final">Final</option>
        </select>
      </div>
      <textarea readOnly rows={7} value={msg.text} onFocus={(e) => e.target.select()} />
      <div className="link-row">
        {msg.whatsappLink ? <a className="btn small" href={msg.whatsappLink} target="_blank" rel="noreferrer">Open WhatsApp</a> : <span className="muted small">Add a phone number to open WhatsApp.</span>}
        <button className="btn small ghost" onClick={async () => { await navigator.clipboard.writeText(msg.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

function DueCard({ due, onChanged, onError }) {
  const [panel, setPanel] = useState(null); // 'pay' | 'message' | 'pause'
  const [amount, setAmount] = useState('');
  const [pauseDate, setPauseDate] = useState('');
  const unpaid = due.status === 'unpaid';

  const run = async (fn) => {
    onError('');
    try {
      await fn();
      setPanel(null);
      onChanged();
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div className={`card due ${due.daysOverdue > 0 && unpaid ? 'late-card' : ''}`}>
      <div className="rule-top">
        <strong>{due.name}</strong>
        <strong>{rupees(due.balance)}{due.paid > 0 && <span className="muted small"> of {rupees(due.amount)}</span>}</strong>
      </div>
      <div className="lead-top">
        <span className={`tag ${due.daysOverdue > 0 && unpaid ? 'failed' : ''}`}>{unpaid ? dueText(due) : `paid ${fmt(due.paidAt)}`}</span>
        <span className="muted small">due {fmt(due.dueDate)}</span>
        {due.note && <span className="muted small">· {due.note}</span>}
      </div>
      <span className="muted small">
        {[due.email, due.phone].filter(Boolean).join(' · ') || 'No email or phone yet'}
        {!due.email && unpaid && ' · no email, so use the WhatsApp message'}
      </span>

      {unpaid && (
        <span className="muted small">
          {due.optedOut ? '🚫 Not reminding this person.' : due.nextReminder ? `Next: ${due.nextReminder.tone} reminder ${due.nextReminder.inDays > 0 ? `in ${due.nextReminder.inDays} day${due.nextReminder.inDays > 1 ? 's' : ''}` : 'is due now'}.` : 'All reminders have been sent.'}
          {due.remindersSent > 0 && ` ${due.remindersSent} sent so far.`}
          {due.pausedUntil && new Date(due.pausedUntil) > new Date() && ` ⏸ Paused until ${fmt(due.pausedUntil)}.`}
        </span>
      )}
      {due.replyText && unpaid && <div className="log-body"><strong>They replied:</strong>{'\n'}{due.replyText}</div>}
      {due.payments.length > 0 && <span className="muted small">Payments: {due.payments.map((p) => `${rupees(p.amount)} on ${fmt(p.at)}`).join(', ')}</span>}

      {unpaid && (
        <div className="link-row">
          <button className="btn small" onClick={() => setPanel(panel === 'pay' ? null : 'pay')}>Record payment</button>
          <button className="btn small ghost" onClick={() => setPanel(panel === 'message' ? null : 'message')}>WhatsApp / copy message</button>
          <button className="link-btn" onClick={() => setPanel(panel === 'pause' ? null : 'pause')}>Pause</button>
          <button className="link-btn" onClick={() => run(() => updateDue(due.id, { optedOut: !due.optedOut }))}>{due.optedOut ? 'Resume reminders' : 'Stop reminders'}</button>
          <button className="link-btn danger" onClick={() => window.confirm(`Delete ${due.name}?`) && run(() => deleteDue(due.id))}>Delete</button>
        </div>
      )}

      {panel === 'pay' && (
        <div className="offer-form">
          <input type="number" min="1" step="any" placeholder={`Amount received (up to ${due.balance})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn small" onClick={() => run(() => payDue(due.id, { amount }))} disabled={!amount}>Save</button>
          <button className="btn small ghost" onClick={() => run(() => payDue(due.id, { full: true }))}>Received in full ({rupees(due.balance)})</button>
        </div>
      )}
      {panel === 'message' && <Message due={due} />}
      {panel === 'pause' && (
        <div className="offer-form">
          <label className="mini">No reminders until<input type="date" min={today()} value={pauseDate} onChange={(e) => setPauseDate(e.target.value)} /></label>
          <button className="btn small" onClick={() => run(() => updateDue(due.id, { pausedUntil: pauseDate }))} disabled={!pauseDate}>Pause</button>
          {due.pausedUntil && <button className="link-btn" onClick={() => run(() => updateDue(due.id, { pausedUntil: '' }))}>Remove pause</button>}
        </div>
      )}
    </div>
  );
}

// The list of people who owe money (or have paid), and a form to add more.
export default function Dues({ status, refreshKey, onChanged }) {
  const [dues, setDues] = useState(null);
  const [form, setForm] = useState(blank);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => getDues(status).then(setDues).catch((e) => setError(e.message));
  useEffect(() => {
    setDues(null);
    load();
  }, [status, refreshKey]);

  async function add(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await addDue(form);
      setForm({ ...blank, dueDate: form.dueDate });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addBulk() {
    setError('');
    setMessage('');
    try {
      const { added, skipped } = await addDuesBulk(bulk);
      setMessage(`Added ${added}.${skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 2).join(' / ')}` : ''}`);
      setBulk('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel-stack">
      {status === 'unpaid' && (
        <>
          <p className="muted">
            Add each person who owes you money. The agent reminds them by email on the schedule you set (default: 1 day after the due date, then 7, then 15 days),
            and stops when you record the payment or they reply. For people with only a phone number, it prepares a WhatsApp message you send with one tap.
          </p>
          <form className="card" onSubmit={add}>
            <h3>Add who owes you</h3>
            <div className="add-row">
              <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input type="number" min="1" step="any" placeholder="Amount ₹" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              <label className="mini">Due on<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required /></label>
            </div>
            <div className="add-row">
              <input type="email" placeholder="Email (for automatic reminders)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input placeholder="Phone (for WhatsApp)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input placeholder="What it is for (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={120} />
            </div>
            <div className="link-row">
              <button className="btn small">Add</button>
              <button type="button" className="link-btn" onClick={() => setShowBulk(!showBulk)}>{showBulk ? 'Hide' : 'Paste many at once'}</button>
            </div>
            {showBulk && (
              <>
                <textarea className="bulk" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)}
                  placeholder={'One per line: name | amount | due date | phone or email | note\nRavi Kumar | 1500 | 2026-11-05 | 9876543210 | groceries\nMeera Shah | 800 | 5/11/2026 | meera@beta.io'} />
                <button type="button" className="btn small" onClick={addBulk} disabled={!bulk.trim()}>Add all</button>
              </>
            )}
          </form>
        </>
      )}
      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}
      {!dues && !error && <p className="muted">Loading...</p>}
      {dues?.length === 0 && <div className="card muted">{status === 'paid' ? 'Nobody has paid in full yet.' : 'Nobody owes you anything yet. Add the first person above.'}</div>}
      {dues?.map((d) => <DueCard key={d.id} due={d} onChanged={onChanged} onError={setError} />)}
    </div>
  );
}
