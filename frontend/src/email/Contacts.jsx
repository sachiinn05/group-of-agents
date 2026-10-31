import { useEffect, useState } from 'react';
import { getContacts, addContact, addContactsBulk, updateContact, deleteContact } from '../api.js';

const blank = { name: '', email: '', company: '', notes: '', status: 'new' };
const daysSince = (date) => Math.floor((Date.now() - new Date(date).getTime()) / 86400000);

// One person. The status drives the situations, so changing it can make the agent send an email.
function Row({ contact, statuses, onChange, onRemove, onError }) {
  const [status, setStatus] = useState(contact.status);

  async function save(fields) {
    try {
      onChange(await updateContact(contact.id, fields));
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div className="contact-row">
      <div className="who">
        <strong>{contact.name || contact.email}</strong>
        <span className="muted">{[contact.name && contact.email, contact.company].filter(Boolean).join(' · ')}</span>
        {contact.notes && <span className="muted small">{contact.notes}</span>}
      </div>
      <label className="mini">
        Status
        <input className="status" list="statuses" value={status} onChange={(e) => setStatus(e.target.value)}
          onBlur={() => status.trim().toLowerCase() !== contact.status && save({ status })} />
      </label>
      <span className="muted small">
        {daysSince(contact.statusAt)}d{contact.lastRepliedAt ? ` · replied ${daysSince(contact.lastRepliedAt)}d ago` : ''}
      </span>
      <button className={`pill ${contact.optedOut ? 'on' : ''}`} onClick={() => save({ optedOut: !contact.optedOut })} title="Never email this person automatically">
        {contact.optedOut ? 'Do not email' : 'Emailing on'}
      </button>
      <button className="link-btn danger" onClick={onRemove}>Delete</button>
      <datalist id="statuses">{statuses.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

// The people the agent may email.
export default function Contacts() {
  const [contacts, setContacts] = useState(null);
  const [form, setForm] = useState(blank);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => getContacts().then(setContacts).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await addContact(form);
      setForm(blank);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addBulk() {
    setError('');
    setMessage('');
    try {
      const { added, skipped } = await addContactsBulk(bulk);
      setMessage(`Added ${added}.${skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 3).join(' / ')}` : ''}`);
      setBulk('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!contacts) return <p className="muted">{error || 'Loading...'}</p>;
  const statuses = [...new Set(['new', 'applied', 'interview', 'customer', ...contacts.map((c) => c.status)])];

  return (
    <div className="panel-stack">
      <p className="muted">
        People the agent may email. Each has a <b>status</b>. When you change it, situations that watch that status react by themselves.
        Adding a contact can also trigger a welcome email, if you have that situation on.
      </p>

      <form className="card" onSubmit={add}>
        <h3>Add a contact</h3>
        <div className="add-row">
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <input list="statuses" placeholder="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
        </div>
        <input placeholder="Notes the agent should know (e.g. Applied for Junior Developer on 3 Nov)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
        <div className="link-row">
          <button className="btn small">Add contact</button>
          <button type="button" className="link-btn" onClick={() => setShowBulk(!showBulk)}>{showBulk ? 'Hide' : 'Paste many at once'}</button>
        </div>
        {showBulk && (
          <>
            <textarea className="bulk" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)}
              placeholder={'One per line: name, email, company, status\nRahul Verma, rahul@acme.com, Acme, applied\nmeera@beta.io'} />
            <button type="button" className="btn small" onClick={addBulk} disabled={!bulk.trim()}>Add all</button>
          </>
        )}
      </form>
      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h3>Your contacts ({contacts.length})</h3>
        {contacts.length === 0 && <p className="muted">No contacts yet.</p>}
        {contacts.map((c) => (
          <Row key={c.id} contact={c} statuses={statuses} onError={setError}
            onChange={(u) => setContacts((all) => all.map((x) => (x.id === u.id ? u : x)))}
            onRemove={async () => { await deleteContact(c.id); setContacts((all) => all.filter((x) => x.id !== c.id)); }} />
        ))}
      </div>
    </div>
  );
}
