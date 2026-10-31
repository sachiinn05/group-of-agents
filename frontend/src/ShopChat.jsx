import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { getShop, getShopHistory, getShopMenu, getShopOrders, sendShopMessage } from './api.js';
import ShopOrders from './ShopOrders.jsx';
import Menu, { rupees } from './Menu.jsx';
import Cart from './Cart.jsx';

// The page a shop's customers see at /shop/<slug>. No login.
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

const isActive = (o) => ['pending', 'accepted', 'out_for_delivery'].includes(o.status);

export default function ShopChat({ slug }) {
  const [sessionId] = useState(() => sessionFor(slug));
  const [shop, setShop] = useState(null);
  const [menu, setMenu] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState('chat'); // chat | menu | cart | orders
  const [cart, setCart] = useState(() => loadCart(slug)); // { productId: qty }
  const [messages, setMessages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);

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

  // While an order is open (or the orders tab is showing) keep its status fresh, and pull in
  // messages the shop owner caused (accepted, out for delivery...) so they show in the chat too.
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const hasActive = orders.some(isActive);
  useEffect(() => {
    if (!hasActive && view !== 'orders') return;
    const timer = setInterval(async () => {
      loadOrders();
      if (sendingRef.current) return;
      const saved = await getShopHistory(slug, sessionId).catch(() => null);
      if (saved) setMessages((m) => (saved.length > m.length ? [...m, ...saved.slice(m.length)] : m));
    }, 8000);
    return () => clearInterval(timer);
  }, [hasActive, view, loadOrders, slug, sessionId]);

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
      const { reply, leadSaved, orders: placed, cartUpdates, profile } = await sendShopMessage(slug, sessionId, text, cart);

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
      { role: 'assistant', content: `Your order #${order.shortId} for ${rupees(order.total)} was sent to the shop. They will confirm it soon.`, placed: [order] },
    ]);
    loadOrders();
    setView('chat');
  }

  if (notFound) return <div className="auth-wrap"><div className="auth-card"><h1>Shop not found</h1><p>Check the link and try again.</p></div></div>;
  if (!shop) return <div className="auth-wrap"><p className="muted">Loading...</p></div>;

  return (
    <div className="shop-page">
      <header className="shop-head">
        <div>
          <h1>{shop.name}</h1>
          <span>{[shop.timings, shop.address].filter(Boolean).join(' · ')}</span>
        </div>
      </header>
      <nav className="shop-tabs">
        <button className={view === 'chat' ? 'on' : ''} onClick={() => setView('chat')}>Chat</button>
        <button className={view === 'menu' ? 'on' : ''} onClick={() => setView('menu')}>Menu</button>
        <button className={view === 'cart' ? 'on' : ''} onClick={() => setView('cart')}>Cart{count ? ` (${count})` : ''}</button>
        <button className={view === 'orders' ? 'on' : ''} onClick={() => setView('orders')}>Orders{orders.length ? ` (${orders.length})` : ''}</button>
      </nav>

      {view === 'menu' && <Menu menu={menu} cart={cart} setQty={setQty} count={count} total={total} onOpenCart={() => setView('cart')} />}
      {view === 'cart' && (
        <Cart slug={slug} sessionId={sessionId} menu={menu} lines={lines} total={total} setQty={setQty}
          onPlaced={onPlaced} onBrowse={() => setView('menu')} />
      )}
      {view === 'orders' && <ShopOrders slug={slug} sessionId={sessionId} orders={orders} onChanged={loadOrders} />}

      {view === 'chat' && (
        <>
          <div className="messages">
            <div className="msg assistant">
              Hi! Welcome to {shop.name}. Ask me anything, or tap <b>Menu</b> to browse items and add them to your cart.
            </div>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
                {m.leadSaved && <div className="lead-ok">✓ Sent to the shop. They will contact you.</div>}
                {m.cartUpdates?.length > 0 && (
                  <div className="lead-ok">
                    🛒 Cart updated: {m.cartUpdates.map((u) => (u.qty > 0 ? `${u.qty} × ${u.name}` : `removed ${u.name}`)).join(', ')}
                    <div><button className="btn small" onClick={() => setView('cart')}>View cart</button></div>
                  </div>
                )}
                {m.profile && <div className="lead-ok">✓ Your details are filled in on the Cart tab.</div>}
                {m.placed?.map((o) => (
                  <div key={o.id} className="lead-ok">
                    ✓ Order #{o.shortId}: {rupees(o.total)}
                    {o.payUrl && <div><a className="btn small" href={o.payUrl}>Pay {rupees(o.total)} with UPI</a></div>}
                  </div>
                ))}
              </div>
            ))}
            {sending && <div className="typing">typing...</div>}
            {error && <div className="error">{error}</div>}
            <div ref={bottom} />
          </div>
          <div className="composer">
            <textarea
              rows={1}
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={1000}
            />
            <button className="btn" onClick={send} disabled={sending || !input.trim()}>Send</button>
          </div>
        </>
      )}
      <footer className="shop-foot">Answers come from the shop's own information.</footer>
    </div>
  );
}
