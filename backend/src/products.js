import { Router } from 'express';
import mongoose from 'mongoose';
import { Product } from './db.js';
import { requireAuth } from './auth.js';
import { loadShop } from './ownerShop.js';

const router = Router();
router.use(requireAuth, loadShop);

const MAX_PRODUCTS = 1000;

const toPrice = (v) => {
  const n = Number(String(v ?? '').replace(/[₹,\s]|rs\.?/gi, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

// Validates product fields from a request. With `partial`, only the fields that were sent are checked.
function cleanProduct(body, partial = false) {
  const fields = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'name required' };
    fields.name = name.slice(0, 120);
  }
  if (body.unit !== undefined) fields.unit = String(body.unit || '').trim().slice(0, 40);
  if (!partial || body.price !== undefined) {
    const price = toPrice(body.price);
    if (price === null) return { error: 'price must be a number' };
    fields.price = price;
  }
  if (body.inStock !== undefined) fields.inStock = !!body.inStock;
  if (body.stockQty !== undefined) {
    if (body.stockQty === null || body.stockQty === '') fields.stockQty = null;
    else {
      const q = Number(body.stockQty);
      if (!Number.isFinite(q) || q < 0) return { error: 'stock must be 0 or more' };
      fields.stockQty = q;
    }
  }
  return { fields };
}

const view = (p) => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, inStock: p.inStock, stockQty: p.stockQty });

router.get('/', async (req, res) => {
  const products = await Product.find({ businessId: req.business._id }).sort({ name: 1 });
  res.json(products.map(view));
});

router.post('/', async (req, res) => {
  const { fields, error } = cleanProduct(req.body);
  if (error) return res.status(400).json({ error });
  if ((await Product.countDocuments({ businessId: req.business._id })) >= MAX_PRODUCTS) {
    return res.status(400).json({ error: `Limit of ${MAX_PRODUCTS} products reached` });
  }
  const product = await Product.create({ businessId: req.business._id, ...fields });
  res.status(201).json(view(product));
});

// Paste many lines at once: "Basmati Rice | 1 kg | 140" (unit is optional: "Sugar | 46")
router.post('/bulk', async (req, res) => {
  const lines = String(req.body.text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 300);
  const docs = [];
  const skipped = [];
  for (const line of lines) {
    const parts = (line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : line.split(',')).map((s) => s.trim());
    const price = toPrice(parts.at(-1));
    if (parts.length < 2 || price === null || !parts[0]) {
      skipped.push(line);
      continue;
    }
    docs.push({ businessId: req.business._id, name: parts[0].slice(0, 120), unit: parts.length > 2 ? parts[1].slice(0, 40) : '', price });
  }
  if (docs.length) await Product.insertMany(docs);
  res.status(201).json({ added: docs.length, skipped });
});

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { fields, error } = cleanProduct(req.body, true);
  if (error) return res.status(400).json({ error });
  const product = await Product.findOneAndUpdate({ _id: req.params.id, businessId: req.business._id }, fields, { new: true });
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json(view(product));
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await Product.deleteOne({ _id: req.params.id, businessId: req.business._id });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

export default router;
