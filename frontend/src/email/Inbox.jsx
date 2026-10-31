import { useEffect, useState } from 'react';
import { getInbox, syncInboxNow, sendInboxDraft, dismissInboxDraft } from '../api.js';

const OUTCOME = {
  replied: ['Replied', 'sent'],
  needs_you: ['Needs you', 'failed'],
  noted: ['Noted', ''],
  sent: ['You sent a reply', 'sent'],
  dismissed: ['Dismissed', ''],
  failed: ['Failed', 'failed'],
};

// A draft the agent wrote that waits for the owner: edit it, send it, or dismiss it.
function Draft({ item, onDone }) {
  const [body, setBody] = useState(item.draft.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      await sendInboxDraft(item.id, item.draft.subject, body);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="draft">
      <strong>Draft reply</strong>
      <span className="muted small">{item.draft.subject}</span>
      <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} />
      <div className="link-row">
        <button className="btn small" onClick={send} disabled={busy || !body.trim()}>Send this reply</button>
        <button className="link-btn danger" onClick={async () => { await dismissInboxDraft(item.id); onDone(); }}>Dismiss</button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

// The replies the agent read, what it understood, and what it did about them.
export default function Inbox({ canRead, inboxMode, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const load = () => getInbox().then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [refreshKey]);

  async function check() {
    setSyncing(true);
    try {
      await syncInboxNow();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="panel-stack">
      {!canRead ? (
        <div className="card">
          <strong>The agent cannot read your inbox yet.</strong>
          <p className="muted">Connect your Gmail with an App Password in Settings. Then it notices when people reply, stops following up with them, and answers for you.</p>
        </div>
      ) : (
        <p className="muted">
          When a contact writes back, the agent reads it, updates their status, and either answers or leaves you a draft.
          {inboxMode === 'off' ? ' Inbox reading is OFF (see Settings).' : inboxMode === 'draft' ? ' It prepares drafts and never sends by itself.' : ' It sends only safe replies (thanks, simple questions) by itself. Anything about times, money or decisions waits for you.'}
        </p>
      )}
      {canRead && (
        <div className="link-row">
          <button className="btn small ghost" onClick={check} disabled={syncing}>{syncing ? 'Checking...' : 'Check inbox now'}</button>
          {data?.ignored > 0 && <span className="muted small">{data.ignored} automatic or unknown emails were left alone.</span>}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {data?.items.length === 0 && canRead && <div className="card muted">No replies from your contacts yet. Only new mail from now on is handled.</div>}
      {data?.items.map((m) => {
        const [label, cls] = OUTCOME[m.outcome] || [m.outcome, ''];
        return (
          <div key={m.id} className="card">
            <div className="lead-top">
              <span className={`tag ${cls}`}>{label}</span>
              <strong>{m.fromName || m.fromEmail}</strong>
              {m.category && <span className="tag">{m.category.replace('_', ' ')}</span>}
              <span className="muted small">{new Date(m.date).toLocaleString()}</span>
            </div>
            <span className="muted small">{m.subject}</span>
            <div className="log-body">{m.text}</div>
            <span className="muted">🧠 {m.reason}</span>
            {m.outcome === 'needs_you' && m.draft && <Draft item={m} onDone={load} />}
            {m.outcome === 'replied' && m.draft && <div className="log-body"><strong>Reply sent:</strong>{'\n'}{m.draft.body}</div>}
          </div>
        );
      })}
    </div>
  );
}
