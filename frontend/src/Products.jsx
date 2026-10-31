import { useEffect, useState } from 'react';
import { getProducts, addProduct, bulkAddProducts, updateProduct, deleteProduct } from './api.js';

const blank = { name: '', unit: '', price: '', stockQty: '' };

// One product line. Edits save when you leave the field.
function Row({ product, onChange, onRemove, onError }) {
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stockQty ?? '');

  async function save(fields) {
    try {
      onChange(await updateProduct(product.id, fields));
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div className={`product-row ${product.inStock ? '' : 'off'}`}>
      <div className="product-name">
        <strong>{product.name}</strong>
        <span className="muted">{product.unit}</span>
      </div>
      <label className="mini">
        ₹
        <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
          onBlur={() => Number(price) !== product.price && save({ price })} />
      </label>
      <label className="mini">
        Stock
        <input type="number" min="0" step="any" placeholder="any" value={stock} onChange={(e) => setStock(e.target.value)}
          onBlur={() => String(stock) !== String(product.stockQty ?? '') && save({ stockQty: stock === '' ? null : stock })} />
      </label>
      <button className={`pill ${product.inStock ? 'on' : ''}`} onClick={() => save({ inStock: !product.inStock })}>
        {product.inStock ? 'In stock' : 'Out of stock'}
      </button>
      <button className="link-btn danger" onClick={onRemove}>Delete</button>
    </div>
  );
}

export default function Products() {
  const [products, setProducts] = useState(null);
  const [form, setForm] = useState(blank);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => getProducts().then(setProducts).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await addProduct({ ...form, stockQty: form.stockQty === '' ? null : form.stockQty });
      setForm(blank);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addBulk() {
    setError('');
    setMessage('');
    try {
      const { added, skipped } = await bulkAddProducts(bulk);
      setMessage(`Added ${added} product${added === 1 ? '' : 's'}.${skipped.length ? ` Skipped ${skipped.length} line(s) without a price: ${skipped.slice(0, 3).join(' / ')}` : ''}`);
      setBulk('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await deleteProduct(id);
    setProducts((all) => all.filter((p) => p.id !== id));
  }

  if (!products) return <p className="muted">{error || 'Loading...'}</p>;

  return (
    <div className="panel-stack">
      <p className="muted">
        Your agent reads prices and stock from here. Customers can order these items, and the total is calculated exactly.
        Leave Stock empty if you do not want to count it.
      </p>

      <form className="card" onSubmit={add}>
        <h3>Add a product</h3>
        <div className="add-row">
          <input placeholder="Name (Basmati Rice)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Unit (1 kg)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <input type="number" min="0" step="any" placeholder="Price ₹" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <input type="number" min="0" step="any" placeholder="Stock" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} />
        </div>
        <div className="link-row">
          <button className="btn small">Add product</button>
          <button type="button" className="link-btn" onClick={() => setShowBulk(!showBulk)}>{showBulk ? 'Hide' : 'Paste many at once'}</button>
        </div>
        {showBulk && (
          <>
            <textarea className="bulk" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)}
              placeholder={'One product per line:\nBasmati Rice | 1 kg | 140\nSugar | 1 kg | 46\nSoap | 25'} />
            <button type="button" className="btn small" onClick={addBulk} disabled={!bulk.trim()}>Add all</button>
          </>
        )}
      </form>

      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h3>Your products ({products.length})</h3>
        {products.length === 0 && <p className="muted">No products yet. Add your first one above.</p>}
        {products.map((p) => (
          <Row key={p.id} product={p} onError={setError}
            onChange={(updated) => setProducts((all) => all.map((x) => (x.id === updated.id ? updated : x)))}
            onRemove={() => remove(p.id)} />
        ))}
      </div>
    </div>
  );
}
