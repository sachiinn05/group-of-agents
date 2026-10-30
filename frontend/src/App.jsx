import { useEffect, useState } from 'react';
import Login from './Login.jsx';
import Chat from './Chat.jsx';
import { getAgents, getToken, clearToken } from './api.js';

const CATEGORY_ORDER = ['Career', 'Developer', 'Learning', 'General'];

function groupByCategory(agents) {
  const groups = {};
  for (const a of agents) (groups[a.category] ||= []).push(a);
  return CATEGORY_ORDER.filter((c) => groups[c]).map((c) => [c, groups[c]]);
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  // Google sends the browser back to /?gmail=connected (or error:...); read it once, then tidy the URL.
  const [gmailNotice] = useState(() => new URLSearchParams(window.location.search).get('gmail'));

  useEffect(() => {
    if (gmailNotice) window.history.replaceState({}, '', window.location.pathname);
  }, [gmailNotice]);

  function logout() {
    clearToken();
    setAgents([]);
    setSelected(null);
    setLoggedIn(false);
  }

  useEffect(() => {
    if (!loggedIn) return;
    getAgents()
      .then((list) => {
        setAgents(list);
        // Coming back from Google, land on the agent that uses Gmail.
        const emailAgent = gmailNotice && list.find((a) => a.tools?.includes('send_email'));
        setSelected(emailAgent || list[0] || null);
      })
      .catch((err) => err.status === 401 && logout());
  }, [loggedIn]);

  if (!loggedIn) return <Login onAuth={() => setLoggedIn(true)} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">Your agents ({agents.length})</div>
        <div className="agent-list">
          {groupByCategory(agents).map(([category, list]) => (
            <div key={category}>
              <div className="cat-title">{category}</div>
              {list.map((a) => (
                <button
                  key={a.id}
                  className={`agent-item ${selected?.id === a.id ? 'active' : ''}`}
                  onClick={() => setSelected(a)}
                >
                  {a.name}
                  <small>{a.role}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="sidebar-foot">
          <button className="logout" onClick={logout}>Log out</button>
        </div>
      </aside>
      {selected ? <Chat key={selected.id} agent={selected} gmailNotice={gmailNotice} /> : <div className="empty">No agents yet.</div>}
    </div>
  );
}
