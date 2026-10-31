import { useState } from 'react';

export const rupees = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, '')}`;

// + / - control for one product in the cart
export function Stepper({ qty, onChange }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(qty - 1)} aria-label="-">−</button>
      <span>{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="+">+</button>
    </div>
  );
}

// The business's list of items (menu, products, medicines, services): browse, search, add to the cart.
export default function Menu({ t, menu, cart, setQty, count, total, onOpenCart }) {
  const [search, setSearch] = useState('');

  if (!menu) return <div className="menu-panel muted">{t('loading')}</div>;
  const label = t(`menu.${menu.menuLabel}`);
  if (menu.products.length === 0) return <div className="menu-panel muted">{t('nothingYet')}</div>;

  const q = search.trim().toLowerCase();
  const shown = menu.products.filter((p) => !q || `${p.name} ${p.unit} ${p.category} ${p.note}`.toLowerCase().includes(q));

  // Group by category, keeping the order the categories first appear in. Items with none go last.
  const names = [...new Set(shown.map((p) => p.category).filter(Boolean))];
  const groups = names.map((c) => [c, shown.filter((p) => p.category === c)]);
  const loose = shown.filter((p) => !p.category);
  if (loose.length) groups.push([groups.length ? t('other') : '', loose]);

  return (
    <>
      <div className="menu-panel">
        <input className="menu-search" placeholder={t('searchIn', { menu: label.toLowerCase() })} value={search} onChange={(e) => setSearch(e.target.value)} />
        {shown.length === 0 && <p className="muted">{t('noMatch', { q: search })}</p>}
        {groups.map(([category, items]) => (
          <div key={category || 'all'} className="menu-group">
            {category && <h4 className="cat-head">{category}</h4>}
            {items.map((p) => (
              <div key={p.id} className={`menu-item ${p.available ? '' : 'off'}`}>
                <div className="menu-name">
                  <strong>{p.name}</strong>
                  <span className="muted">{[p.unit, p.note].filter(Boolean).join(' · ')}</span>
                </div>
                <strong>{rupees(p.price)}</strong>
                {!p.available ? (
                  <span className="muted small">{t('notAvailable')}</span>
                ) : cart[p.id] ? (
                  <Stepper qty={cart[p.id]} onChange={(n) => setQty(p.id, n)} />
                ) : (
                  <button className="btn small" onClick={() => setQty(p.id, 1)}>{t('add')}</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {count > 0 && (
        <button className="cart-bar" onClick={onOpenCart}>
          <span>{t('itemsCount', { n: count })}</span>
          <strong>{t('cartBar', { amount: rupees(total) })}</strong>
        </button>
      )}
    </>
  );
}
