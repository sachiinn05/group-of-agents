import { useEffect, useState } from 'react';
import { getOrders, setOrderStatus } from './api.js';

export const STATUS_LABEL = {
  pending: 'New',
  accepted: 'Accepted',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const MODE_LABEL = { delivery: 'Delivery', pickup: 'Pickup from shop', dinein: 'Dine-in', appointment: 'Appointment' };

const rupees = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, '')}`;

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  const load = () => getOrders().then(setOrders).catch((e) => setError(e.message));

  // Refresh every 15 seconds so new orders appear without reloading.
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  async function change(id, status) {
    setError('');
    try {
      const updated = await setOrderStatus(id, status);
      setOrders((all) => all.map((o) => (o.id === id ? updated : o)));
    } catch (e) {
      setError(e.message);
    }
  }

  if (!orders) return <p className="muted">{error || 'Loading...'}</p>;

  return (
    <div className="panel-stack">
      <p className="muted">Orders placed by customers. Accepting an order reduces your counted stock; cancelling puts it back.</p>
      {error && <div className="error">{error}</div>}
      {orders.length === 0 && <div className="card muted">No orders yet. Share your shop link.</div>}
      {orders.map((o) => (
        <div key={o.id} className={`card order ${o.status}`}>
          <div className="lead-top">
            <strong>#{o.number}</strong>
            <span className={`tag ${o.status}`}>{STATUS_LABEL[o.status]}</span>
            <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
          </div>
          <div>
            {o.customerName || 'Customer'} · <a href={`tel:${o.phone}`}>{o.phone}</a>
          </div>
          <div className="muted">
            {o.fulfilment === 'delivery' ? `Deliver to: ${o.address}` : MODE_LABEL[o.fulfilment] || o.fulfilment}
            {o.fulfilment !== 'delivery' && o.schedule ? `: ${o.schedule}` : ''}
          </div>
          <ul className="doc-list">
            {o.items.map((i, k) => (
              <li key={k}>
                <span>{i.qty} × {i.name}{i.unit ? ` (${i.unit})` : ''}</span>
                <span>{rupees(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="order-total"><span>Total</span><strong>{rupees(o.total)}</strong></div>
          {o.note && <div className="muted">Note: {o.note}</div>}
          {o.feedback && <div className="ok">{'★'.repeat(o.feedback.rating)}{'☆'.repeat(5 - o.feedback.rating)} {o.feedback.comment}</div>}
          <div className="status-row">
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <button key={value} className={`pill ${o.status === value ? 'on' : ''}`} onClick={() => change(o.id, value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
