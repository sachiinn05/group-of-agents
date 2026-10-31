import { useState } from 'react';
import { rateOrder } from './api.js';
import { rupees } from './Menu.jsx';

// Star rating shown once an order is delivered.
function Rate({ t, slug, sessionId, order, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      await rateOrder(slug, sessionId, order.id, rating, comment);
      onDone();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="rate">
      <div>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={`star ${n <= rating ? 'on' : ''}`} onClick={() => setRating(n)} aria-label={`${n}`}>★</button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <input placeholder={t('ratePh')} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
          <button className="btn small" onClick={submit}>{t('sendRating')}</button>
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

// The customer's own orders: status, a Pay button, and a rating once delivered.
export default function ShopOrders({ t, slug, sessionId, orders, onChanged }) {
  if (orders.length === 0) return <div className="orders-panel muted">{t('noOrders')}</div>;
  return (
    <div className="orders-panel">
      {orders.map((o) => (
        <div key={o.id} className="order-card">
          <div className="lead-top">
            <strong>#{o.number}</strong>
            <span className={`tag ${o.status}`}>{t(`status.${o.status}`)}</span>
            <strong>{rupees(o.total)}</strong>
          </div>
          <div className="muted">{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</div>
          {o.fulfilment !== 'delivery' && o.schedule && <div className="muted">{t(`sched.${o.fulfilment}`)}: {o.schedule}</div>}
          {o.payUrl && <a className="btn small" href={o.payUrl}>{t('pay', { amount: rupees(o.total) })}</a>}
          {o.payUrl && <div className="muted small">{t('opensUpi')}</div>}
          {o.status === 'delivered' && !o.feedback && <Rate t={t} slug={slug} sessionId={sessionId} order={o} onDone={onChanged} />}
          {o.feedback && <div className="ok">{t('thanks', { stars: '★'.repeat(o.feedback.rating) })}</div>}
        </div>
      ))}
    </div>
  );
}
