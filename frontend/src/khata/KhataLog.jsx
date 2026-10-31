import { useEffect, useState } from 'react';
import { getReminderLog, retryReminder } from '../api.js';

const OUTCOME = { sent: 'Sent', dry_run: 'Test (not sent)', failed: 'Failed', sending: 'Sending...' };

// Every reminder the agent wrote, whether it was sent or not.
export default function KhataLog({ refreshKey }) {
  const [log, setLog] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = () => getReminderLog().then(setLog).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [refreshKey]);

  if (!log) return <p className="muted">{error || 'Loading...'}</p>;
  return (
    <div className="panel-stack">
      <p className="muted">Every reminder the agent wrote, newest first. Tap one to read it.</p>
      {error && <div className="error">{error}</div>}
      {log.length === 0 && <div className="card muted">No reminders yet. They start once someone is past their due date.</div>}
      {log.map((l) => (
        <div key={l.id} className="card">
          <button className="log-row" onClick={() => setOpen(open === l.id ? null : l.id)}>
            <div className="lead-top">
              <span className={`tag ${l.outcome}`}>{OUTCOME[l.outcome] || l.outcome}</span>
              <strong>{l.subject}</strong>
            </div>
            <span className="muted small">To {l.name} ({l.to}) · {l.tone} · {new Date(l.at).toLocaleString()}</span>
            {l.reason && <span className="muted small">Why: {l.reason}</span>}
          </button>
          {l.error && <div className="error">{l.error}</div>}
          {l.outcome === 'failed' && (
            <button className="btn small ghost" style={{ justifySelf: 'start' }} onClick={async () => { await retryReminder(l.id); load(); }}>Try again on the next check</button>
          )}
          {open === l.id && <div className="log-body">{l.body}</div>}
        </div>
      ))}
    </div>
  );
}
