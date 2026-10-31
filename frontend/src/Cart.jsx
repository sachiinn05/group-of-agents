import { useState } from 'react';
import { placeCartOrder } from './api.js';
import { Stepper, rupees } from './Menu.jsx';

const SAVED_KEY = 'shop_customer_details';
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || {};
  } catch {
    return {};
  }
};

// The cart and checkout form. The shop recalculates the total, so this one is for display.
export default function Cart({ slug, sessionId, menu, lines, total, setQty, onPlaced, onBrowse }) {
  const saved = loadSaved();
  const [fulfilment, setFulfilment] = useState('delivery');
  const [name, setName] = useState(saved.name || '');
  const [phone, setPhone] = useState(saved.phone || '');
  const [address, setAddress] = useState(saved.address || '');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  if (lines.length === 0) {
    return (
      <div className="menu-panel">
        <p className="muted">Your cart is empty.</p>
        <button className="btn" onClick={onBrowse}>Browse menu</button>
      </div>
    );
  }

  async function place(e) {
    e.preventDefault();
    setError('');
    setPlacing(true);
    try {
      const { order } = await placeCartOrder(slug, sessionId, {
        items: lines.map((l) => ({ product_id: l.id, qty: l.qty })),
        fulfilment,
        name,
        phone,
        address,
        note,
      });
      localStorage.setItem(SAVED_KEY, JSON.stringify({ name, phone, address }));
      onPlaced(order);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <form className="menu-panel" onSubmit={place}>
      <h3 className="cart-title">Your cart</h3>
      {lines.map((l) => (
        <div key={l.id} className="menu-item">
          <div className="menu-name">
            <strong>{l.name}</strong>
            <span className="muted">{l.unit} · {rupees(l.price)} each</span>
          </div>
          <strong>{rupees(l.price * l.qty)}</strong>
          <Stepper qty={l.qty} onChange={(n) => setQty(l.id, n)} />
        </div>
      ))}
      <div className="order-total"><span>Total</span><strong>{rupees(total)}</strong></div>

      <div className="seg">
        <button type="button" className={fulfilment === 'delivery' ? 'on' : ''} onClick={() => setFulfilment('delivery')}>Delivery</button>
        <button type="button" className={fulfilment === 'pickup' ? 'on' : ''} onClick={() => setFulfilment('pickup')}>Pickup</button>
      </div>

      <div className="checkout">
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        {fulfilment === 'delivery' && (
          <>
            <textarea rows={2} placeholder="Full delivery address" value={address} onChange={(e) => setAddress(e.target.value)} required />
            {menu?.deliveryAreas?.length > 0 && <span className="muted small">We deliver to: {menu.deliveryAreas.join(', ')}</span>}
          </>
        )}
        <input placeholder="Note for the shop (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>

      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={placing}>{placing ? 'Placing order...' : `Place order · ${rupees(total)}`}</button>
      <span className="muted small">The shop confirms the final amount.{menu?.upi ? ' You can pay by UPI after ordering.' : ''}</span>
    </form>
  );
}
