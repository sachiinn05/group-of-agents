// The home of the platform: after logging in, the user picks which agent to use.
// To add an agent, add one entry here and one case in App.jsx.
const AGENTS = [
  {
    key: 'shop',
    icon: '🛒',
    title: 'Shop Agent',
    text: 'An assistant for your shop, restaurant, pharmacy or salon. Customers chat, order and book 24/7 on your own link, and you get every order and lead.',
  },
  {
    key: 'email',
    icon: '✉️',
    title: 'Email Agent',
    text: 'Sends emails by itself, depending on the situation: follow-ups after 5 days with no reply, welcome emails, thank-yous. It writes each one and sends it from your Gmail.',
  },
  {
    key: 'khata',
    icon: '💸',
    title: 'Payment Reminder Agent',
    text: 'Add who owes you money and when it is due. It sends polite reminders by itself (gentle, then firm, then final), and stops when they pay or reply.',
  },
];

export default function Home({ onPick, onLogout }) {
  return (
    <div className="dash">
      <header className="dash-head">
        <strong>Your AI agents</strong>
        <button className="logout" onClick={onLogout}>Log out</button>
      </header>
      <main className="dash-body">
        <p className="muted">Pick an agent to work with.</p>
        <div className="agent-grid">
          {AGENTS.map((a) => (
            <button key={a.key} className="agent-card" onClick={() => onPick(a.key)}>
              <span className="agent-icon">{a.icon}</span>
              <strong>{a.title}</strong>
              <span className="muted">{a.text}</span>
              <span className="agent-open">Open →</span>
            </button>
          ))}
          <div className="agent-card soon">
            <span className="agent-icon">＋</span>
            <strong>More agents coming</strong>
            <span className="muted">New agents will appear here.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
