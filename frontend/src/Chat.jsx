import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { getMessages, sendMessage } from './api.js';
import GmailBar from './GmailBar.jsx';

const ACCEPT = '.pdf,.docx,.txt,.csv,.md,.json';
const MAX_FILES = 3;
const MAX_MB = 5;

export default function Chat({ agent, gmailNotice }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const picker = useRef(null);

  const canSendEmail = agent.tools?.includes('send_email');

  // Parent remounts this component per agent (key), so this runs once per agent.
  useEffect(() => {
    getMessages(agent.id).then(setMessages).catch((e) => setError(e.message));
  }, [agent.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  function pickFiles(e) {
    const picked = [...e.target.files];
    e.target.value = ''; // lets the same file be picked again later
    const tooBig = picked.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is over ${MAX_MB} MB.`);
    if (files.length + picked.length > MAX_FILES) return setError(`You can attach up to ${MAX_FILES} files.`);
    setError('');
    setFiles((f) => [...f, ...picked]);
  }

  async function send() {
    const text = input.trim();
    if ((!text && files.length === 0) || sending) return;
    const attached = files;
    setInput('');
    setFiles([]);
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text || '(see attached file)', attachments: attached.map((f) => f.name) }]);
    setSending(true);
    try {
      const { reply } = await sendMessage(agent.id, text, attached);
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
        {canSendEmail && <GmailBar notice={gmailNotice} />}
      </div>
      <div className="messages">
        {messages.length === 0 && !sending && (
          <div className="empty">
            Say something to {agent.name}.
            {canSendEmail && <><br />Attach your resume and tell me who to email. I will send it from your Gmail.</>}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.attachments?.length > 0 && (
              <div className="chips">
                {m.attachments.map((name) => <span key={name} className="chip">📎 {name}</span>)}
              </div>
            )}
            {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
          </div>
        ))}
        {sending && <div className="typing">{agent.name} is thinking...</div>}
        {error && <div className="error">{error}</div>}
        <div ref={bottom} />
      </div>
      {files.length > 0 && (
        <div className="chips pending">
          {files.map((f, i) => (
            <span key={i} className="chip">
              📎 {f.name}
              <button onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="composer">
        <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={pickFiles} />
        <button className="attach" onClick={() => picker.current.click()} title="Attach PDF, Word or text files" disabled={sending}>
          📎
        </button>
        <textarea
          rows={1}
          placeholder={`Message ${agent.name} (Enter to send, Shift+Enter for new line)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn" onClick={send} disabled={sending || (!input.trim() && files.length === 0)}>
          Send
        </button>
      </div>
    </section>
  );
}
