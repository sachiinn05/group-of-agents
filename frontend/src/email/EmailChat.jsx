import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { getEmailChat, sendEmailChat } from '../api.js';

const EXAMPLES = [
  'Add rahul@acme.com as a contact, status applied',
  'If someone stays in "applied" for 5 days, send a polite follow-up',
  'Send a thank-you email to rahul@acme.com for the interview',
];

// Talk to the Email Agent: it sends emails, adds contacts, changes statuses and creates situations.
export default function EmailChat() {
  const [messages, setMessages] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  useEffect(() => {
    getEmailChat().then(setMessages).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text = input) {
    const message = text.trim();
    if (!message || sending) return;
    setInput('');
    setError('');
    setMessages((m) => [...(m || []), { role: 'user', content: message }]);
    setSending(true);
    try {
      const { reply } = await sendEmailChat(message);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="email-chat">
      <p className="muted">Tell the agent what you need in plain words. It can send an email, add contacts, change their status, and set up situations so emails go out by themselves.</p>
      <div className="messages">
        {messages?.length === 0 && (
          <div className="presets">
            {EXAMPLES.map((e) => (
              <button key={e} className="pill" onClick={() => send(e)}>{e}</button>
            ))}
          </div>
        )}
        {messages?.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
          </div>
        ))}
        {sending && <div className="typing">working on it...</div>}
        {error && <div className="error">{error}</div>}
        <div ref={bottom} />
      </div>
      <div className="composer">
        <textarea
          rows={1}
          placeholder='For example: "Follow up with everyone who applied 5 days ago"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={2000}
        />
        <button className="btn" onClick={() => send()} disabled={sending || !input.trim()}>Send</button>
      </div>
    </div>
  );
}
