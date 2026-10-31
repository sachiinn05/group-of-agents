import { Router } from 'express';
import mongoose from 'mongoose';
import { Offer } from './db.js';
import { requireAuth } from './auth.js';
import { loadShop } from './ownerShop.js';

// Offers and announcements ("10% off on rice today", "Closed Monday for Diwali").
// Customers see them on the shop page and the agent mentions them, until they expire.

export const activeOffers = (businessId) =>
  Offer.find({ businessId, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
    .sort({ _id: -1 })
    .limit(10);

const router = Router();
router.use(requireAuth, loadShop);

const view = (o) => ({ id: o.id, text: o.text, expiresAt: o.expiresAt || null, expired: !!o.expiresAt && o.expiresAt <= new Date() });

router.get('/', async (req, res) => {
  const offers = await Offer.find({ businessId: req.business._id }).sort({ _id: -1 }).limit(50);
  res.json(offers.map(view));
});

// { text, expiresOn: "2026-11-05" (optional, valid until the end of that day) }
router.post('/', async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!text) return res.status(400).json({ error: 'write the offer first' });

  let expiresAt = null;
  if (req.body.expiresOn) {
    const day = String(req.body.expiresOn);
    expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T23:59:59`) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) return res.status(400).json({ error: 'invalid date' });
    if (expiresAt <= new Date()) return res.status(400).json({ error: 'that date has already passed' });
  }
  const offer = await Offer.create({ businessId: req.business._id, text, expiresAt });
  res.status(201).json(view(offer));
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  const { deletedCount } = await Offer.deleteOne({ _id: req.params.id, businessId: req.business._id });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

export default router;
