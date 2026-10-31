import { useEffect, useState } from 'react';
import { getLeads, setLeadStatus } from './api.js';

const STATUSES = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['done', 'Done'],
];

export default function Leads({ signal }) {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');

  const load = () => getLeads().then(setLeads).catch((e) => setError(e.message));

  // The dashboard bumps `signal` when the server says leads changed, so new customers appear at once.
  useEffect(() => {
    load();
  }, [signal]);

  async function change(id, status) {
    setLeads((all) => all.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await setLeadStatus(id, status);
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  if (!leads) return <p className="muted">{error || 'Loading...'}</p>;

  return (
    <div className="panel-stack">
      <p className="muted">Customers who asked for an order or a callback. Call them back to close the sale.</p>
      {error && <div className="error">{error}</div>}
      {leads.length === 0 && <div className="card muted">No leads yet. Share your shop link and they will appear here.</div>}
      {leads.map((l) => (
        <div key={l.id} className={`card lead ${l.status}`}>
          <div className="lead-top">
            <strong>{l.name || 'Customer'}</strong>
            <a href={`tel:${l.phone}`}>{l.phone}</a>
            <span className="muted">{new Date(l.createdAt).toLocaleString()}</span>
          </div>
          <p>{l.note}</p>
          <div className="status-row">
            {STATUSES.map(([value, label]) => (
              <button key={value} className={`pill ${l.status === value ? 'on' : ''}`} onClick={() => change(l.id, value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
