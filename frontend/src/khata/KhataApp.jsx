import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import Dues from './Dues.jsx';
import KhataLog from './KhataLog.jsx';
import KhataSettings from './KhataSettings.jsx';
import Activity from '../email/Activity.jsx';
import { rupees } from '../Menu.jsx';
import { getKhataSettings, getKhataSummary, getKhataActivity, runKhataNow, getToken } from '../api.js';

const TABS = [
  ['dues', 'Who owes me'],
  ['paid', 'Paid'],
  ['log', 'Reminders sent'],
  ['activity', 'Activity'],
  ['settings', 'Settings'],
];

// The Payment Reminder Agent: add who owes you money, and it reminds them politely until they pay.
export default function KhataApp({ onLogout, onBack }) {
  const [tab, setTab] = useState('dues');
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState(null);
  const [unseen, setUnseen] = useState(0);
  const [refresh, setRefresh] = useState(0); // bumped when the agent changed something, so lists reload

  const loadSettings = () => getKhataSettings().then(setSettings).catch((e) => e.status === 401 && onLogout());
  const loadSummary = () => getKhataSummary().then(setSummary).catch(() => {});
  const changed = () => {
    loadSummary();
    setRefresh((n) => n + 1);
  };

  useEffect(() => {
    loadSettings();
    loadSummary();
    getKhataActivity().then(setEvents).catch(() => setEvents([]));
  }, []);

  // The agent's work arrives live while the screen is open.
  useEffect(() => {
    const socket = io({ auth: { token: getToken() } });
    socket.on('agent:event', (e) => {
      if (e.agent !== 'khata') return; // the Email Agent's lines are not shown here
      setEvents((list) => [{ id: e.id, kind: e.kind, text: e.text, at: e.at }, ...(list || [])].slice(0, 80));
      setUnseen((n) => n + 1);
    });
    socket.on('khata:changed', changed);
    return () => socket.close();
  }, []);

  const live = settings?.mode === 'live';

  return (
    <div className="dash">
      <header className="dash-head">
        <span className="head-left">
          <button className="link-btn" onClick={onBack}>← All agents</button>
          <strong>💸 Payment Reminder Agent</strong>
        </span>
        <button className="logout" onClick={onLogout}>Log out</button>
      </header>

      {settings && (
        <div className={`banner ${settings.paused ? 'paused' : live ? 'live' : 'test'}`}>
          {settings.paused ? (
            <span>⏸ Paused. No reminders are being sent.</span>
          ) : live ? (
            <span>🟢 Live. Reminders go out by themselves from {settings.connection?.email}, between {settings.sendFrom}:00 and {settings.sendTo}:00.</span>
          ) : (
            <span>🧪 Test mode. The agent writes the reminders and lists them under Reminders sent, but does not send them.</span>
          )}
          {!live && !settings.paused && (
            <button className="link-btn" onClick={() => setTab('settings')}>{settings.connection ? 'Turn on live sending' : 'Connect your email to go live'}</button>
          )}
        </div>
      )}

      {summary && (
        <div className="stat-row">
          <div className="stat"><span className="muted small">Still to collect</span><strong>{rupees(summary.outstanding)}</strong></div>
          <div className="stat"><span className="muted small">Overdue</span><strong className={summary.overdue ? 'late' : ''}>{rupees(summary.overdue)}</strong></div>
          <div className="stat"><span className="muted small">Collected this month</span><strong className="okc">{rupees(summary.collectedThisMonth)}</strong></div>
          <div className="stat"><span className="muted small">People</span><strong>{summary.people}</strong></div>
        </div>
      )}

      <nav className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => { setTab(key); if (key === 'activity') setUnseen(0); }}>
            {label}
            {key === 'activity' && unseen > 0 && tab !== 'activity' && <span className="badge">{unseen}</span>}
          </button>
        ))}
      </nav>
      <main className="dash-body">
        {(tab === 'dues' || tab === 'paid') && <Dues status={tab === 'paid' ? 'paid' : 'unpaid'} refreshKey={refresh} onChanged={changed} />}
        {tab === 'log' && <KhataLog refreshKey={refresh} />}
        {tab === 'activity' && (
          <Activity events={events} onCheck={runKhataNow} help="Everything the agent does shows up here as it happens. It checks your dues every minute and only sends during the hours you set." />
        )}
        {tab === 'settings' && settings && <KhataSettings settings={settings} onChanged={loadSettings} />}
      </main>
    </div>
  );
}
