import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import ShopSetup from './ShopSetup.jsx';
import Leads from './Leads.jsx';
import Products from './Products.jsx';
import Orders from './Orders.jsx';
import Chats from './Chats.jsx';
import { getBusiness, getToken } from './api.js';

const TABS = [
  ['shop', 'My shop'],
  ['products', 'Products'],
  ['orders', 'Orders'],
  ['leads', 'Leads'],
  ['chats', 'Chats'],
];

export default function Dashboard({ onLogout, onBack }) {
  const [business, setBusiness] = useState(undefined); // undefined = loading, null = no shop yet
  const [tab, setTab] = useState('shop');
  // `signals` goes up each time the server says something changed, so open tabs refetch at once.
  // `unseen` counts changes the owner has not looked at yet (the red numbers on the tabs).
  const [signals, setSignals] = useState({ orders: 0, leads: 0, chats: 0, unanswered: 0 });
  const [unseen, setUnseen] = useState({ orders: 0, leads: 0, chats: 0 });
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = () =>
    getBusiness()
      .then(setBusiness)
      .catch((e) => e.status === 401 && onLogout());

  useEffect(() => {
    load();
  }, []);

  // Live updates from the server, once the shop exists.
  const hasShop = !!business;
  useEffect(() => {
    if (!hasShop) return;
    const socket = io({ auth: { token: getToken() } });
    // event name -> [signal to bump, tab whose badge goes up]
    const events = {
      'orders:changed': ['orders', 'orders'],
      'leads:changed': ['leads', 'leads'],
      'chats:changed': ['chats', null],
      'unanswered:changed': ['unanswered', 'chats'],
    };
    for (const [event, [signal, badgeTab]] of Object.entries(events)) {
      socket.on(event, () => {
        setSignals((s) => ({ ...s, [signal]: s[signal] + 1 }));
        if (badgeTab && tabRef.current !== badgeTab) setUnseen((u) => ({ ...u, [badgeTab]: u[badgeTab] + 1 }));
      });
    }
    return () => socket.close();
  }, [hasShop]);

  function open(key) {
    setTab(key);
    setUnseen((u) => (key in u ? { ...u, [key]: 0 } : u));
  }

  if (business === undefined) return <div className="auth-wrap"><p className="muted">Loading...</p></div>;

  return (
    <div className="dash">
      <header className="dash-head">
        <span className="head-left">
          <button className="link-btn" onClick={onBack}>← All agents</button>
          <strong>{business?.name || 'Set up your shop'}</strong>
        </span>
        <button className="logout" onClick={onLogout}>Log out</button>
      </header>
      {business && (
        <nav className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'on' : ''} onClick={() => open(key)}>
              {label}
              {unseen[key] > 0 && <span className="badge">{unseen[key]}</span>}
            </button>
          ))}
        </nav>
      )}
      <main className="dash-body">
        {business && tab === 'products' ? <Products example={business.example} />
          : business && tab === 'orders' ? <Orders signal={signals.orders} />
          : business && tab === 'leads' ? <Leads signal={signals.leads} />
          : business && tab === 'chats' ? <Chats chatsSignal={signals.chats} unansweredSignal={signals.unanswered} />
          : <ShopSetup key={business?.id || 'new'} business={business} onChanged={load} />}
      </main>
    </div>
  );
}
