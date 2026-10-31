import { useEffect, useState } from 'react';
import { getEmailLog, retryEmail } from '../api.js';

const OUTCOME = { sent: 'Sent', dry_run: 'Test (not sent)', failed: 'Failed', sending: 'Sending...', skipped: 'Skipped' };

// Every email the agent wrote, whether it was sent or not.
export default function SentLog() {
  const [log, setLog] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const load = () => getEmailLog().then(setLog).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (!log) return <p className="muted">{error || 'Loading...'}</p>;

  return (
    <div className="panel-stack">
      <p className="muted">Everything the agent wrote, newest first. Tap an email to read it.</p>
      <button className="btn small ghost" onClick={load} style={{ justifySelf: 'start' }}>Refresh</button>
      {error && <div className="error">{error}</div>}
      {log.length === 0 && <div className="card muted">Nothing yet. Add contacts and situations, or ask the agent to send an email.</div>}
      {log.map((l) => (
        <div key={l.id} className="card">
          <button className="log-row" onClick={() => setOpen(open === l.id ? null : l.id)}>
            <div className="lead-top">
              <span className={`tag ${l.outcome}`}>{OUTCOME[l.outcome] || l.outcome}</span>
              <strong>{l.subject || '(no subject)'}</strong>
            </div>
            <span className="muted small">
              To {l.to} · {l.rule ? `situation: ${l.rule}` : 'from chat'} · {new Date(l.at).toLocaleString()}
            </span>
          </button>
          {l.error && <div className="error">{l.error}</div>}
          {l.outcome === 'failed' && (
            <button className="btn small ghost" style={{ justifySelf: 'start' }} onClick={async () => { await retryEmail(l.id); load(); }}>
              Try again on the next check
            </button>
          )}
          {open === l.id && <div className="log-body">{l.body}</div>}
        </div>
      ))}
    </div>
  );
}
