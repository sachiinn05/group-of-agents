import { useState } from 'react';
import Login from './Login.jsx';
import Home from './Home.jsx';
import Dashboard from './Dashboard.jsx';
import EmailApp from './email/EmailApp.jsx';
import ShopChat from './ShopChat.jsx';
import { getToken, clearToken } from './api.js';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  // Which agent the user opened. null = the home screen with all agents.
  // Coming back from Google's "connect Gmail" page (/?gmail=...) goes straight to the Email Agent.
  const [agent, setAgent] = useState(() => (new URLSearchParams(window.location.search).has('gmail') ? 'email' : null));

  // Customers open /shop/<slug>. Everything else is for logged-in users.
  const shopMatch = window.location.pathname.match(/^\/shop\/([^/]+)/);
  if (shopMatch) return <ShopChat slug={decodeURIComponent(shopMatch[1])} />;

  function logout() {
    clearToken();
    setLoggedIn(false);
    setAgent(null);
  }

  if (!loggedIn) return <Login onAuth={() => setLoggedIn(true)} />;
  if (agent === 'shop') return <Dashboard onLogout={logout} onBack={() => setAgent(null)} />;
  if (agent === 'email') return <EmailApp onLogout={logout} onBack={() => setAgent(null)} />;
  return <Home onPick={setAgent} onLogout={logout} />;
}
