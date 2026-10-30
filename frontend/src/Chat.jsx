import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { getMessages, sendMessage } from './api.js';

export default function Chat({ agent }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  // Parent remounts this component per agent (key), so this runs once per agent.
  useEffect(() => {
    getMessages(agent.id).then(setMessages).catch((e) => setError(e.message));
  }, [agent.id]);

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
      const { reply } = await sendMessage(agent.id, text);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
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

  return (
    <section className="chat">
      <div className="chat-head">
        <h2>{agent.name}</h2>
        <span>{agent.role}</span>
      </div>
      <div className="messages">
        {messages.length === 0 && !sending && (
          <div className="empty">Say something to {agent.name}.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
          </div>
        ))}
        {sending && <div className="typing">{agent.name} is thinking...</div>}
        {error && <div className="error">{error}</div>}
        <div ref={bottom} />
      </div>
      <div className="composer">
        <textarea
          rows={1}
          placeholder={`Message ${agent.name} (Enter to send, Shift+Enter for new line)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn" onClick={send} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}
