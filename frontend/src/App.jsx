import { useState } from 'react';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import ShopChat from './ShopChat.jsx';
import { getToken, clearToken } from './api.js';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());

  // Customers open /shop/<slug>. Everything else is the owner's area.
  const shopMatch = window.location.pathname.match(/^\/shop\/([^/]+)/);
  if (shopMatch) return <ShopChat slug={decodeURIComponent(shopMatch[1])} />;

  function logout() {
    clearToken();
    setLoggedIn(false);
  }

  return loggedIn ? <Dashboard onLogout={logout} /> : <Login onAuth={() => setLoggedIn(true)} />;
}
