import { useState } from 'react';
import { runEmailRulesNow } from '../api.js';

const ICON = { write: '✍️', send: '📤', read: '📥', decide: '🧠', warn: '⚠️', error: '❌', info: '•' };

const ago = (date) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(date).toLocaleDateString();
};

// What the agent is doing, newest first. New lines appear live as it works.
export default function Activity({ events, onCheck = runEmailRulesNow, help }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');

  async function checkNow() {
    setChecking(true);
    setNote('');
    try {
      const r = await onCheck(); // reads the inbox, then does the agent's round
      setNote(r.stoppedBecause ? `Stopped: ${r.stoppedBecause}` : r.written ? `Wrote ${r.written} email${r.written > 1 ? 's' : ''}.` : 'Checked. Nothing needed an email right now.');
    } catch (e) {
      setNote(e.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="panel-stack">
      <p className="muted">{help || 'Everything the agent does shows up here as it happens. It checks your inbox and your situations every minute.'}</p>
      <div className="link-row">
        <button className="btn small ghost" onClick={checkNow} disabled={checking}>{checking ? 'Checking...' : 'Check now'}</button>
        {note && <span className="ok">{note}</span>}
      </div>
      <div className="card feed">
        {!events && <span className="muted">Loading...</span>}
        {events?.length === 0 && <span className="muted">Nothing yet. Connect your email, add contacts and situations, and the agent's work will appear here.</span>}
        {events?.map((e) => (
          <div key={e.id} className={`feed-row ${e.kind}`}>
            <span className="feed-icon">{ICON[e.kind] || ICON.info}</span>
            <span className="feed-text">{e.text}</span>
            <span className="muted small">{ago(e.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
