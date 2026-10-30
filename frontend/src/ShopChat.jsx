import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { getShop, getShopHistory, sendShopMessage } from './api.js';

// The page a shop's customers see at /shop/<slug>. No login.
function sessionFor(slug) {
  const key = `shop_session_${slug}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ShopChat({ slug }) {
  const [sessionId] = useState(() => sessionFor(slug));
  const [shop, setShop] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  useEffect(() => {
    getShop(slug).then(setShop).catch(() => setNotFound(true));
    getShopHistory(slug, sessionId).then(setMessages).catch(() => {});
  }, [slug, sessionId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const { reply, leadSaved } = await sendShopMessage(slug, sessionId, text);
      setMessages((m) => [...m, { role: 'assistant', content: reply, leadSaved }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (notFound) return <div className="auth-wrap"><div className="auth-card"><h1>Shop not found</h1><p>Check the link and try again.</p></div></div>;
  if (!shop) return <div className="auth-wrap"><p className="muted">Loading...</p></div>;

  return (
    <div className="shop-page">
      <header className="shop-head">
        <h1>{shop.name}</h1>
        <span>{[shop.timings, shop.address].filter(Boolean).join(' · ')}</span>
      </header>
      <div className="messages">
        <div className="msg assistant">
          Hi! Welcome to {shop.name}. Ask me about products, prices, timings or delivery, or tell me what you want to order.
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
            {m.leadSaved && <div className="lead-ok">✓ Sent to the shop. They will contact you.</div>}
          </div>
        ))}
        {sending && <div className="typing">typing...</div>}
        {error && <div className="error">{error}</div>}
        <div ref={bottom} />
      </div>
      <div className="composer">
        <textarea
          rows={1}
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={1000}
        />
        <button className="btn" onClick={send} disabled={sending || !input.trim()}>Send</button>
      </div>
      <footer className="shop-foot">Answers come from the shop's own information.</footer>
    </div>
  );
}
