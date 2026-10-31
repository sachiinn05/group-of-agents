import { useState } from 'react';
import { rateOrder } from './api.js';
import { STATUS_LABEL } from './Orders.jsx';

const rupees = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, '')}`;

// Star rating shown once an order is delivered.
function Rate({ slug, sessionId, order, onDone }) {
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
          <button key={n} className={`star ${n <= rating ? 'on' : ''}`} onClick={() => setRating(n)} aria-label={`${n} star`}>★</button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <input placeholder="Any comment? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} />
          <button className="btn small" onClick={submit}>Send rating</button>
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

// The customer's own orders: status, a Pay button, and a rating once delivered.
export default function ShopOrders({ slug, sessionId, orders, onChanged }) {
  if (orders.length === 0) return <div className="orders-panel muted">No orders yet. Tell the assistant what you want to buy.</div>;
  return (
    <div className="orders-panel">
      {orders.map((o) => (
        <div key={o.id} className="order-card">
          <div className="lead-top">
            <strong>#{o.number}</strong>
            <span className={`tag ${o.status}`}>{STATUS_LABEL[o.status]}</span>
            <strong>{rupees(o.total)}</strong>
          </div>
          <div className="muted">{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</div>
          {o.payUrl && <a className="btn small" href={o.payUrl}>Pay {rupees(o.total)} with UPI</a>}
          {o.payUrl && <div className="muted small">Opens your UPI app on your phone.</div>}
          {o.status === 'delivered' && !o.feedback && <Rate slug={slug} sessionId={sessionId} order={o} onDone={onChanged} />}
          {o.feedback && <div className="ok">Thanks! You rated {'★'.repeat(o.feedback.rating)}</div>}
        </div>
      ))}
    </div>
  );
}
