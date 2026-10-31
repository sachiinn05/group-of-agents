import { useEffect, useState } from 'react';
import ShopSetup from './ShopSetup.jsx';
import Leads from './Leads.jsx';
import Products from './Products.jsx';
import Orders from './Orders.jsx';
import { getBusiness } from './api.js';

export default function Dashboard({ onLogout }) {
  const [business, setBusiness] = useState(undefined); // undefined = loading, null = no shop yet
  const [tab, setTab] = useState('shop');

  const load = () =>
    getBusiness()
      .then(setBusiness)
      .catch((e) => e.status === 401 && onLogout());

  useEffect(() => {
    load();
  }, []);

  if (business === undefined) return <div className="auth-wrap"><p className="muted">Loading...</p></div>;

  return (
    <div className="dash">
      <header className="dash-head">
        <strong>{business?.name || 'Set up your shop'}</strong>
        <button className="logout" onClick={onLogout}>Log out</button>
      </header>
      {business && (
        <nav className="tabs">
          <button className={tab === 'shop' ? 'on' : ''} onClick={() => setTab('shop')}>My shop</button>
          <button className={tab === 'products' ? 'on' : ''} onClick={() => setTab('products')}>Products</button>
          <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Orders</button>
          <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leads</button>
        </nav>
      )}
      <main className="dash-body">
        {business && tab === 'products' ? <Products example={business.example} />
          : business && tab === 'orders' ? <Orders />
          : business && tab === 'leads' ? <Leads />
          : <ShopSetup key={business?.id || 'new'} business={business} onChanged={load} />}
      </main>
    </div>
  );
}
