import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import EmailChat from './EmailChat.jsx';
import Activity from './Activity.jsx';
import Inbox from './Inbox.jsx';
import Situations from './Situations.jsx';
import Contacts from './Contacts.jsx';
import SentLog from './SentLog.jsx';
import EmailSettings from './EmailSettings.jsx';
import { getEmailSettings, getActivity, getToken } from '../api.js';

const TABS = [
  ['chat', 'Agent'],
  ['activity', 'Activity'],
  ['inbox', 'Inbox'],
  ['situations', 'Situations'],
  ['contacts', 'Contacts'],
  ['sent', 'Sent emails'],
  ['settings', 'Settings'],
];

const NOTICES = {
  connected: 'Gmail connected. Now turn on live sending when you are ready.',
  'error:access_denied': 'Gmail connection was cancelled.',
  'error:invalid_state': 'Gmail connection failed (the link expired). Try again.',
  'error:no_refresh_token': 'Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and try again.',
};

export default function EmailApp({ onLogout, onBack }) {
  const [tab, setTab] = useState('chat');
  const [settings, setSettings] = useState(null);
  const [events, setEvents] = useState(null); // the live activity feed, newest first
  const [unseen, setUnseen] = useState(0); // new activity while another tab is open
  const [inboxKey, setInboxKey] = useState(0); // bumped when the agent did something with the inbox
  // Google sends the browser back to /?gmail=connected (or error:...). Read it once, then tidy the URL.
  const [notice] = useState(() => new URLSearchParams(window.location.search).get('gmail'));

  const reload = () => getEmailSettings().then(setSettings).catch((e) => e.status === 401 && onLogout());

  useEffect(() => {
    reload();
    getActivity().then(setEvents).catch(() => setEvents([]));
    if (notice) {
      window.history.replaceState({}, '', window.location.pathname);
      setTab('settings');
    }
  }, []);

  // The agent's work arrives live while the screen is open.
  useEffect(() => {
    const socket = io({ auth: { token: getToken() } });
    socket.on('agent:event', (e) => {
      if (e.agent === 'khata') return; // that is the Payment Reminder Agent's feed
      setEvents((list) => [{ id: e.id, kind: e.kind, text: e.text, at: e.at }, ...(list || [])].slice(0, 80));
      setUnseen((n) => n + 1);
      if (['read', 'decide', 'write'].includes(e.kind)) setInboxKey((k) => k + 1);
    });
    return () => socket.close();
  }, []);

  function open(key) {
    setTab(key);
    if (key === 'activity') setUnseen(0);
  }

  const live = settings?.mode === 'live';

  return (
    <div className="dash">
      <header className="dash-head">
        <span className="head-left">
          <button className="link-btn" onClick={onBack}>← All agents</button>
          <strong>✉️ Email Agent</strong>
        </span>
        <button className="logout" onClick={onLogout}>Log out</button>
      </header>

      {settings && (
        <div className={`banner ${settings.paused ? 'paused' : live ? 'live' : 'test'}`}>
          {settings.paused ? (
            <span>⏸ Paused. Nothing is being sent.</span>
          ) : live ? (
            <span>
              🟢 Live. The agent sends emails by itself from {settings.gmail}
              {settings.canRead && settings.inboxMode !== 'off' ? ' and reads your replies.' : '.'}
            </span>
          ) : (
            <span>🧪 Test mode. The agent writes emails and lists them in Sent emails, but does not send them.</span>
          )}
          {!live && !settings.paused && (
            <button className="link-btn" onClick={() => open('settings')}>
              {settings.gmail ? 'Turn on live sending' : 'Connect Gmail to go live'}
            </button>
          )}
        </div>
      )}
      {notice && <div className={`banner ${notice === 'connected' ? 'live' : 'paused'}`}>{NOTICES[notice] || `Gmail: ${notice.replace('error:', '')}`}</div>}

      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => open(key)}>
            {label}
            {key === 'activity' && unseen > 0 && tab !== 'activity' && <span className="badge">{unseen}</span>}
          </button>
        ))}
      </nav>
      <main className="dash-body">
        {tab === 'chat' && <EmailChat />}
        {tab === 'activity' && <Activity events={events} />}
        {tab === 'inbox' && settings && <Inbox canRead={settings.canRead} inboxMode={settings.inboxMode} refreshKey={inboxKey} />}
        {tab === 'situations' && <Situations />}
        {tab === 'contacts' && <Contacts />}
        {tab === 'sent' && <SentLog />}
        {tab === 'settings' && settings && <EmailSettings settings={settings} onChanged={reload} />}
      </main>
    </div>
  );
}
