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
  const modes = menu?.modes?.length ? menu.modes : [{ key: 'delivery', label: 'Delivery' }, { key: 'pickup', label: 'Pickup' }];
  const [fulfilment, setFulfilment] = useState(modes[0].key);
  const [name, setName] = useState(saved.name || '');
  const [phone, setPhone] = useState(saved.phone || '');
  const [address, setAddress] = useState(saved.address || '');
  const [schedule, setSchedule] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  if (lines.length === 0) {
    return (
      <div className="menu-panel">
        <p className="muted">Your cart is empty.</p>
        <button className="btn" onClick={onBrowse}>Browse {(menu?.menuLabel || 'menu').toLowerCase()}</button>
      </div>
    );
  }

  const booking = fulfilment === 'appointment';
  const scheduleHint = { dinein: 'Table number or arrival time', appointment: 'Preferred date and time (e.g. Saturday 4 pm)', pickup: 'Pickup time (optional)' }[fulfilment];

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
        schedule,
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

      {modes.length > 1 && (
        <div className="seg">
          {modes.map((m) => (
            <button key={m.key} type="button" className={fulfilment === m.key ? 'on' : ''} onClick={() => setFulfilment(m.key)}>{m.label}</button>
          ))}
        </div>
      )}

      <div className="checkout">
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        {fulfilment === 'delivery' && (
          <>
            <textarea rows={2} placeholder="Full delivery address" value={address} onChange={(e) => setAddress(e.target.value)} required />
            {menu?.deliveryAreas?.length > 0 && <span className="muted small">We deliver to: {menu.deliveryAreas.join(', ')}</span>}
          </>
        )}
        {scheduleHint && (
          <input placeholder={scheduleHint} value={schedule} onChange={(e) => setSchedule(e.target.value)} maxLength={100} required={fulfilment !== 'pickup'} />
        )}
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>

      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={placing}>
        {placing ? 'Please wait...' : `${booking ? 'Book appointment' : 'Place order'} · ${rupees(total)}`}
      </button>
      <span className="muted small">The shop confirms the final amount.{menu?.upi ? ' You can pay by UPI after ordering.' : ''}</span>
    </form>
  );
}
