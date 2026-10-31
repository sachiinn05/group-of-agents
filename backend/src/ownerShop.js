import { Business } from './db.js';

// For owner routes that need the owner's shop: puts it on req.business, or answers 404.
export async function loadShop(req, res, next) {
  req.business = await Business.findOne({ ownerId: req.userId });
  if (!req.business) return res.status(404).json({ error: 'no shop yet' });
  next();
}
