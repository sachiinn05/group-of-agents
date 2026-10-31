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
export default function Cart({ t, lang, slug, sessionId, menu, lines, total, setQty, onPlaced, onBrowse }) {
  const saved = loadSaved();
  const modes = menu?.modes?.length ? menu.modes : [{ key: 'delivery' }, { key: 'pickup' }];
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
        <p className="muted">{t('empty')}</p>
        <button className="btn" onClick={onBrowse}>{t('browse', { menu: t(`menu.${menu?.menuLabel || 'Menu'}`).toLowerCase() })}</button>
      </div>
    );
  }

  const booking = fulfilment === 'appointment';
  const scheduleHint = ['dinein', 'appointment', 'pickup'].includes(fulfilment) ? t(`ph.${fulfilment}`) : '';

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
        lang,
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
      <h3 className="cart-title">{t('yourCart')}</h3>
      {lines.map((l) => (
        <div key={l.id} className="menu-item">
          <div className="menu-name">
            <strong>{l.name}</strong>
            <span className="muted">{t('each', { unit: l.unit, price: rupees(l.price) })}</span>
          </div>
          <strong>{rupees(l.price * l.qty)}</strong>
          <Stepper qty={l.qty} onChange={(n) => setQty(l.id, n)} />
        </div>
      ))}
      <div className="order-total"><span>{t('total')}</span><strong>{rupees(total)}</strong></div>

      {modes.length > 1 && (
        <div className="seg">
          {modes.map((m) => (
            <button key={m.key} type="button" className={fulfilment === m.key ? 'on' : ''} onClick={() => setFulfilment(m.key)}>{t(`mode.${m.key}`)}</button>
          ))}
        </div>
      )}

      <div className="checkout">
        <input placeholder={t('ph.name')} value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder={t('ph.phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        {fulfilment === 'delivery' && (
          <>
            <textarea rows={2} placeholder={t('ph.address')} value={address} onChange={(e) => setAddress(e.target.value)} required />
            {menu?.deliveryAreas?.length > 0 && <span className="muted small">{t('weDeliver', { areas: menu.deliveryAreas.join(', ') })}</span>}
          </>
        )}
        {scheduleHint && (
          <input placeholder={scheduleHint} value={schedule} onChange={(e) => setSchedule(e.target.value)} maxLength={100} required={fulfilment !== 'pickup'} />
        )}
        <input placeholder={t('ph.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </div>

      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={placing}>{placing ? t('wait') : t(booking ? 'book' : 'place', { amount: rupees(total) })}</button>
      <span className="muted small">{t('confirmNote')}{menu?.upi ? t('payNote') : ''}</span>
    </form>
  );
}
