import { useCallback, useEffect, useState } from 'react';
import { getChats, getChat, replyToChat, getUnanswered, markUnansweredDone } from './api.js';

const WHO = { user: 'Customer', assistant: 'Assistant', owner: 'You' };

// A customer's conversation, with a box for the owner to write back.
function Thread({ chat, signal, onBack }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => getChat(chat.sessionId).then(setMessages).catch((e) => setError(e.message)), [chat.sessionId]);
  useEffect(() => {
    load();
  }, [load, signal]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setError('');
    try {
      await replyToChat(chat.sessionId, text);
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="panel-stack">
      <div className="lead-top">
        <button className="link-btn" onClick={onBack}>← All chats</button>
        <strong>{chat.name || 'Customer'}</strong>
        {chat.phone && <a href={`tel:${chat.phone}`}>{chat.phone}</a>}
      </div>
      <div className="card thread">
        {!messages && <span className="muted">Loading...</span>}
        {messages?.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <span className="who">{WHO[m.role]} · {new Date(m.at).toLocaleString()}</span>
            {m.content}
          </div>
        ))}
      </div>
      <form className="offer-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to this customer (they see it in their chat)" maxLength={1000} />
        <button className="btn small">Send</button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

// Conversations with customers, and the questions the assistant could not answer.
export default function Chats({ chatsSignal, unansweredSignal }) {
  const [chats, setChats] = useState(null);
  const [unanswered, setUnanswered] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getChats().then(setChats).catch((e) => setError(e.message));
  }, [chatsSignal]);
  useEffect(() => {
    getUnanswered().then(setUnanswered).catch(() => {});
  }, [unansweredSignal]);

  async function done(id) {
    await markUnansweredDone(id);
    setUnanswered((list) => list.filter((u) => u.id !== id));
  }

  if (open) return <Thread chat={open} signal={chatsSignal} onBack={() => setOpen(null)} />;

  return (
    <div className="panel-stack">
      <section className="card">
        <h3>Questions your assistant could not answer</h3>
        <p className="muted">Customers asked these. Add the answer to your shop details, documents or products, then tap Done.</p>
        <ul className="doc-list">
          {unanswered.map((u) => (
            <li key={u.id}>
              <span>{u.question} <span className="tag">asked {u.count}×</span></span>
              <button className="link-btn" onClick={() => done(u.id)}>Done</button>
            </li>
          ))}
          {unanswered.length === 0 && <li className="muted">Nothing new. Your assistant is answering everything.</li>}
        </ul>
      </section>

      <h3 className="cart-title">All customer chats</h3>
      {error && <div className="error">{error}</div>}
      {chats?.length === 0 && <div className="card muted">No conversations yet. Share your shop link.</div>}
      {chats?.map((c) => (
        <button key={c.sessionId} className="card chat-row" onClick={() => setOpen(c)}>
          <div className="lead-top">
            <strong>{c.name || `Customer ${c.sessionId.slice(-4)}`}</strong>
            {c.phone && <span className="muted">{c.phone}</span>}
            <span className="muted small">{new Date(c.lastAt).toLocaleString()} · {c.count} messages</span>
          </div>
          <span className="muted">{c.lastRole === 'owner' ? 'You: ' : ''}{c.last}</span>
        </button>
      ))}
    </div>
  );
}
