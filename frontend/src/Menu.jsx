import { useState } from 'react';

export const rupees = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, '')}`;

// + / - control for one product in the cart
export function Stepper({ qty, onChange }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(qty - 1)} aria-label="Remove one">−</button>
      <span>{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="Add one">+</button>
    </div>
  );
}

// The shop's menu: browse, search, and add items to the cart.
export default function Menu({ menu, cart, setQty, count, total, onOpenCart }) {
  const [search, setSearch] = useState('');

  if (!menu) return <div className="menu-panel muted">Loading menu...</div>;
  if (menu.products.length === 0) {
    return <div className="menu-panel muted">The shop has not added products yet. Ask the assistant in the chat.</div>;
  }

  const q = search.trim().toLowerCase();
  const shown = menu.products.filter((p) => !q || `${p.name} ${p.unit}`.toLowerCase().includes(q));

  return (
    <>
      <div className="menu-panel">
        <input className="menu-search" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {shown.length === 0 && <p className="muted">Nothing matches "{search}".</p>}
        {shown.map((p) => (
          <div key={p.id} className={`menu-item ${p.available ? '' : 'off'}`}>
            <div className="menu-name">
              <strong>{p.name}</strong>
              <span className="muted">{p.unit}</span>
            </div>
            <strong>{rupees(p.price)}</strong>
            {!p.available ? (
              <span className="muted small">Out of stock</span>
            ) : cart[p.id] ? (
              <Stepper qty={cart[p.id]} onChange={(n) => setQty(p.id, n)} />
            ) : (
              <button className="btn small" onClick={() => setQty(p.id, 1)}>Add</button>
            )}
          </div>
        ))}
      </div>
      {count > 0 && (
        <button className="cart-bar" onClick={onOpenCart}>
          <span>🛒 {count} item{count > 1 ? 's' : ''}</span>
          <strong>View cart · {rupees(total)}</strong>
        </button>
      )}
    </>
  );
}
