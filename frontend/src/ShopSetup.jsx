import { useEffect, useRef, useState } from 'react';
import Alerts from './Alerts.jsx';
import { createBusiness, updateBusiness, uploadDocuments, deleteDocument, getBusinessTypes } from './api.js';

const FIELDS = [
  ['address', 'Address', 'Shop 12, Rajendra Nagar, Patna'],
  ['phone', 'Shop phone', '98xxxxxxxx'],
  ['timings', 'Timings', '8 am to 9 pm, closed on Sunday'],
  ['delivery', 'Delivery', 'Free home delivery within 3 km on orders above Rs 300'],
  ['payments', 'Payment methods', 'Cash, UPI'],
  ['policies', 'Policies (returns, etc.)', 'No returns on opened food items'],
  ['upiId', 'UPI ID (customers get a Pay button)', 'sharmastore@okicici'],
];

export default function ShopSetup({ business, onChanged }) {
  const [name, setName] = useState(business?.name || '');
  const [info, setInfo] = useState(business?.info || {});
  const [areas, setAreas] = useState((business?.deliveryAreas || []).join(', '));
  const [type, setType] = useState(business?.type || 'general');
  const [typeLabel, setTypeLabel] = useState(business?.typeLabel || '');
  const [modes, setModes] = useState(business?.modes || ['delivery', 'pickup']);
  const [catalog, setCatalog] = useState(null); // { types: [...], modes: { delivery: 'Delivery', ... } }
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const picker = useRef(null);

  const link = business ? `${window.location.origin}/shop/${business.slug}` : '';

  useEffect(() => {
    getBusinessTypes().then(setCatalog).catch(() => {});
  }, []);

  // Picking another kind of business switches to the ways of receiving orders that usually fit it.
  function pickType(key) {
    setType(key);
    const t = catalog?.types.find((x) => x.key === key);
    if (t) setModes(t.modes);
  }

  function toggleMode(key) {
    setModes((list) => (list.includes(key) ? list.filter((m) => m !== key) : [...list, key]));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const shop = { name, info, deliveryAreas: areas, type, typeLabel, modes };
      await (business ? updateBusiness(shop) : createBusiness(shop));
      setMessage(business ? 'Saved.' : 'Your agent is ready. Now add your items in the Products tab or upload a price list below.');
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length === 0) return;
    setError('');
    setMessage('');
    setUploading(true);
    try {
      await uploadDocuments(files);
      setMessage(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}. Your agent now knows this.`);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    await deleteDocument(id);
    await onChanged();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setMessage('Link copied.');
  }

  return (
    <div className="panel-stack">
      {business && (
        <section className="card">
          <h3>Your shop link</h3>
          <p className="muted">Share this with customers: WhatsApp status, Instagram bio, a QR code at the counter.</p>
          <div className="link-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button className="btn small" onClick={copyLink}>Copy</button>
            <a className="btn small ghost" href={link} target="_blank" rel="noreferrer">Open</a>
          </div>
        </section>
      )}

      {business && <Alerts />}

      <form className="card" onSubmit={save}>
        <h3>{business ? 'Shop details' : 'Tell us about your shop'}</h3>
        <label>
          Business name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sharma General Store" required />
        </label>
        <label>
          What kind of business is it?
          <select value={type} onChange={(e) => pickType(e.target.value)}>
            {(catalog?.types || [{ key: type, label: type }]).map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>
        {type === 'other' && (
          <label>
            Describe it (customers and the assistant will use this)
            <input value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} placeholder="Pet shop" maxLength={40} required />
          </label>
        )}
        <div className="modes">
          <span className="muted small">How can customers receive their order?</span>
          <div className="mode-row">
            {Object.entries(catalog?.modes || {}).map(([key, label]) => (
              <label key={key} className={`check ${modes.includes(key) ? 'on' : ''}`}>
                <input type="checkbox" checked={modes.includes(key)} onChange={() => toggleMode(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        {FIELDS.filter(([key]) => key !== 'delivery' || modes.includes('delivery')).map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <input
              value={info[key] || ''}
              onChange={(e) => setInfo({ ...info, [key]: e.target.value })}
              placeholder={placeholder}
            />
          </label>
        ))}
        {modes.includes('delivery') && (
          <label>
            Areas you deliver to (comma separated; leave empty to deliver anywhere)
            <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Rajendra Nagar, Boring Road, 800016" />
          </label>
        )}
        <button className="btn" disabled={saving}>{saving ? 'Saving...' : business ? 'Save' : 'Create my shop agent'}</button>
      </form>

      {business && (
        <section className="card">
          <h3>Documents your agent learns from</h3>
          <p className="muted">Price list, product catalogue, FAQ. PDF, Word or text, up to 5 MB each. The agent answers only from these and your shop details.</p>
          <input ref={picker} type="file" accept=".pdf,.docx,.txt,.csv,.md,.json" multiple hidden onChange={upload} />
          <button className="btn" onClick={() => picker.current.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : '+ Upload documents'}
          </button>
          <ul className="doc-list">
            {business.documents.map((d) => (
              <li key={d.id}>
                <span>📄 {d.filename}</span>
                <button className="link-btn danger" onClick={() => remove(d.id)}>Remove</button>
              </li>
            ))}
            {business.documents.length === 0 && <li className="muted">No documents yet. Without them the agent can only share your shop details.</li>}
          </ul>
        </section>
      )}

      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
