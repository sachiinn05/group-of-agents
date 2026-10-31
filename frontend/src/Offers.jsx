import { useEffect, useState } from 'react';
import { getOffers, addOffer, deleteOffer } from './api.js';

const today = () => new Date().toISOString().slice(0, 10);

// Offers and announcements: the shop page shows them and the assistant mentions them until they expire.
export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [text, setText] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState('');

  const load = () => getOffers().then(setOffers).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await addOffer(text, expiresOn || undefined);
      setText('');
      setExpiresOn('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await deleteOffer(id);
    load();
  }

  return (
    <section className="card">
      <h3>Offers and announcements</h3>
      <p className="muted">For example "10% off on rice today" or "Closed on Monday for Diwali". Customers see them on your shop page, and the assistant mentions them.</p>
      <form className="offer-form" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the offer or announcement" maxLength={200} required />
        <label className="mini">
          Until
          <input type="date" min={today()} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </label>
        <button className="btn small">Add</button>
      </form>
      {error && <div className="error">{error}</div>}
      <ul className="doc-list">
        {offers.map((o) => (
          <li key={o.id} className={o.expired ? 'expired' : ''}>
            <span>
              {o.text}
              <span className="muted small"> · {o.expired ? 'expired' : o.expiresAt ? `until ${new Date(o.expiresAt).toLocaleDateString()}` : 'until you remove it'}</span>
            </span>
            <button className="link-btn danger" onClick={() => remove(o.id)}>Remove</button>
          </li>
        ))}
        {offers.length === 0 && <li className="muted">No offers yet.</li>}
      </ul>
    </section>
  );
}
