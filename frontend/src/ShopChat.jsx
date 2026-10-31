import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { io } from 'socket.io-client';
import { getShop, getShopHistory, getShopMenu, getShopOrders, sendShopMessage } from './api.js';
import ShopOrders from './ShopOrders.jsx';
import Menu, { rupees } from './Menu.jsx';
import Cart from './Cart.jsx';
import { LANGS, initialLang, makeT } from './i18n.js';

// The page a shop's customers see at /shop/<slug>. No login. Also shown inside the website widget (?embed=1).
function sessionFor(slug) {
  const key = `shop_session_${slug}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

const loadCart = (slug) => {
  try {
    return JSON.parse(localStorage.getItem(`shop_cart_${slug}`)) || {};
  } catch {
    return {};
  }
};

// The Cart tab reads these when it opens, so what the customer told the agent fills the form.
function saveCustomerDetails(profile) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('shop_customer_details')) || {};
  } catch {
    // ignore a corrupted value
  }
  localStorage.setItem('shop_customer_details', JSON.stringify({ ...saved, ...profile }));
}

export default function ShopChat({ slug }) {
  const [sessionId] = useState(() => sessionFor(slug));
  const [lang, setLang] = useState(initialLang);
  const t = useMemo(() => makeT(lang), [lang]);
  const [shop, setShop] = useState(null);
  const [menu, setMenu] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState('chat'); // chat | menu | cart | orders
  const [cart, setCart] = useState(() => loadCart(slug)); // { productId: qty }
  const [messages, setMessages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [unread, setUnread] = useState(0); // messages that arrived while another tab was open
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const embedded = new URLSearchParams(window.location.search).has('embed');

  const loadOrders = useCallback(
    () => getShopOrders(slug, sessionId).then(setOrders).catch(() => {}),
    [slug, sessionId]
  );

  useEffect(() => {
    getShop(slug).then(setShop).catch(() => setNotFound(true));
    getShopMenu(slug).then(setMenu).catch(() => {});
    getShopHistory(slug, sessionId).then(setMessages).catch(() => {});
    loadOrders();
  }, [slug, sessionId, loadOrders]);

  useEffect(() => {
    localStorage.setItem(`shop_cart_${slug}`, JSON.stringify(cart));
  }, [slug, cart]);

  useEffect(() => {
    localStorage.setItem('shop_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Live updates: when the shop owner accepts, ships or cancels an order, or writes to this customer,
  // the server pushes it here over a socket, so it appears straight away.
  useEffect(() => {
    const socket = io();

    // After the first connect and after any reconnect, fetch whatever was missed while offline.
    const catchUp = async () => {
      loadOrders();
      const saved = await getShopHistory(slug, sessionId).catch(() => null);
      if (saved) setMessages((m) => (saved.length > m.length ? [...m, ...saved.slice(m.length)] : m));
    };
    socket.on('connect', () => socket.emit('join', { slug, sessionId }, (r) => r?.ok && catchUp()));

    socket.on('chat:message', (msg) => {
      setMessages((m) => (m.at(-1)?.content === msg.content ? m : [...m, msg]));
      if (viewRef.current !== 'chat') setUnread((n) => n + 1);
    });
    socket.on('order:update', (order) =>
      setOrders((list) => (list.some((o) => o.id === order.id) ? list.map((o) => (o.id === order.id ? order : o)) : [order, ...list]))
    );
    return () => socket.close();
  }, [slug, sessionId, loadOrders]);

  // Cart lines come from the live menu, so removed or sold-out items drop out.
  const lines = useMemo(
    () => (menu?.products || []).filter((p) => p.available && cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] })),
    [menu, cart]
  );
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  function setQty(id, qty) {
    setCart((c) => {
      const next = { ...c };
      if (qty > 0) next[id] = Math.min(qty, 99);
      else delete next[id];
      return next;
    });
  }

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, view]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const { reply, leadSaved, orders: placed, cartUpdates, profile } = await sendShopMessage(slug, sessionId, text, cart, lang);

      // The agent may have changed the cart or learned the customer's details: show them in the Cart tab.
      if (cartUpdates?.length) {
        setCart((c) => {
          const next = { ...c };
          for (const u of cartUpdates) (u.qty > 0 ? (next[u.product_id] = u.qty) : delete next[u.product_id]);
          return next;
        });
      }
      if (profile) saveCustomerDetails(profile);

      setMessages((m) => [...m, { role: 'assistant', content: reply, leadSaved, placed, cartUpdates, profile }]);
      if (placed?.length) loadOrders();
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

  // An order placed from the cart: confirm it in the chat and clear the cart.
  function onPlaced(order) {
    setCart({});
    setMessages((m) => [
      ...m,
      { role: 'assistant', content: t('orderSent', { n: order.shortId, amount: `₹${order.total}` }), placed: [order] },
    ]);
    loadOrders();
    setView('chat');
    setUnread(0);
  }

  if (notFound) return <div className="auth-wrap"><div className="auth-card"><h1>{t('notFound')}</h1><p>{t('notFoundHint')}</p></div></div>;
  if (!shop) return <div className="auth-wrap"><p className="muted">{t('loading')}</p></div>;

  const menuLabel = t(`menu.${menu?.menuLabel || 'Menu'}`);

  return (
    <div className={`shop-page ${embedded ? 'embedded' : ''}`}>
      <header className="shop-head">
        <div>
          <h1>{shop.name}</h1>
          <span>{[shop.timings, shop.address].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="lang-switch" role="group" aria-label="Language">
          {LANGS.map(([code, label]) => (
            <button key={code} className={lang === code ? 'on' : ''} onClick={() => setLang(code)}>{label}</button>
          ))}
        </div>
      </header>
      <nav className="shop-tabs">
        <button className={view === 'chat' ? 'on' : ''} onClick={() => { setView('chat'); setUnread(0); }}>
          {t('chat')}{unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button className={view === 'menu' ? 'on' : ''} onClick={() => setView('menu')}>{menuLabel}</button>
        <button className={view === 'cart' ? 'on' : ''} onClick={() => setView('cart')}>{t('cart')}{count ? ` (${count})` : ''}</button>
        <button className={view === 'orders' ? 'on' : ''} onClick={() => setView('orders')}>{t('orders')}{orders.length ? ` (${orders.length})` : ''}</button>
      </nav>
      {menu?.offers?.length > 0 && (
        <div className="offers-bar">{menu.offers.map((o) => <span key={o}>🎉 {o}</span>)}</div>
      )}

      {view === 'menu' && <Menu t={t} menu={menu} cart={cart} setQty={setQty} count={count} total={total} onOpenCart={() => setView('cart')} />}
      {view === 'cart' && (
        <Cart t={t} lang={lang} slug={slug} sessionId={sessionId} menu={menu} lines={lines} total={total} setQty={setQty}
          onPlaced={onPlaced} onBrowse={() => setView('menu')} />
      )}
      {view === 'orders' && <ShopOrders t={t} slug={slug} sessionId={sessionId} orders={orders} onChanged={loadOrders} />}

      {view === 'chat' && (
        <>
          <div className="messages">
            <div className="msg assistant">{t('greeting', { name: shop.name, menu: menuLabel })}</div>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === 'owner' && <div className="who">{t('owner')}</div>}
                {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
                {m.leadSaved && <div className="lead-ok">{t('leadOk')}</div>}
                {m.cartUpdates?.length > 0 && (
                  <div className="lead-ok">
                    {t('cartUpdated', { items: m.cartUpdates.map((u) => (u.qty > 0 ? `${u.qty} × ${u.name}` : t('removed', { name: u.name }))).join(', ') })}
                    <div><button className="btn small" onClick={() => setView('cart')}>{t('viewCart')}</button></div>
                  </div>
                )}
                {m.profile && <div className="lead-ok">{t('detailsFilled')}</div>}
                {m.placed?.map((o) => (
                  <div key={o.id} className="lead-ok">
                    {t('orderLine', { n: o.shortId, amount: rupees(o.total) })}
                    {o.payUrl && <div><a className="btn small" href={o.payUrl}>{t('pay', { amount: rupees(o.total) })}</a></div>}
                  </div>
                ))}
              </div>
            ))}
            {sending && <div className="typing">{t('typing')}</div>}
            {error && <div className="error">{error}</div>}
            <div ref={bottom} />
          </div>
          <div className="composer">
            <textarea
              rows={1}
              placeholder={t('placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={1000}
            />
            <button className="btn" onClick={send} disabled={sending || !input.trim()}>{t('send')}</button>
          </div>
        </>
      )}
      {!embedded && <footer className="shop-foot">{t('footer')}</footer>}
    </div>
  );
}
