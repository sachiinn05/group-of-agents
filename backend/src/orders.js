import { Router } from 'express';
import mongoose from 'mongoose';
import { Order, Product, PublicMessage, ORDER_STATUSES } from './db.js';
import { requireAuth } from './auth.js';
import { loadShop } from './ownerShop.js';
import { shortId } from './shopTools.js';

const router = Router();
router.use(requireAuth, loadShop);

const view = (o) => ({
  id: o.id,
  number: shortId(o),
  customerName: o.customerName,
  phone: o.phone,
  fulfilment: o.fulfilment,
  address: o.address,
  note: o.note,
  items: o.items.map((i) => ({ name: i.name, unit: i.unit, price: i.price, qty: i.qty })),
  total: o.total,
  status: o.status,
  feedback: o.feedback?.rating ? { rating: o.feedback.rating, comment: o.feedback.comment } : null,
  createdAt: o.createdAt,
});

// What the customer is told in their chat when the owner changes an order's status.
const STATUS_MESSAGES = {
  accepted: (n) => `✅ Good news! Your order #${n} was accepted by the shop.`,
  out_for_delivery: (n) => `🚚 Your order #${n} is out for delivery.`,
  delivered: (n) => `📦 Your order #${n} was delivered. Please rate it in the Orders tab.`,
  cancelled: (n) => `❌ Sorry, your order #${n} was cancelled by the shop. Please contact the shop for details.`,
};

router.get('/', async (req, res) => {
  const orders = await Order.find({ businessId: req.business._id }).sort({ _id: -1 }).limit(100);
  res.json(orders.map(view));
});

// Moves tracked stock when an order is accepted, and puts it back if the order is cancelled later.
async function adjustStock(order, direction) {
  for (const item of order.items) {
    const product = await Product.findOne({ _id: item.productId, businessId: order.businessId });
    if (!product || product.stockQty === null) continue;
    product.stockQty = Math.max(0, product.stockQty + direction * item.qty);
    await product.save();
  }
}

router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'not found' });
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
  const order = await Order.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!order) return res.status(404).json({ error: 'not found' });

  const takesStock = status !== 'pending' && status !== 'cancelled';
  if (takesStock && !order.stockDeducted) {
    await adjustStock(order, -1);
    order.stockDeducted = true;
  } else if (!takesStock && order.stockDeducted) {
    await adjustStock(order, +1);
    order.stockDeducted = false;
  }
  const changed = order.status !== status;
  order.status = status;
  await order.save();

  // Tell the customer in their chat, so they see it without opening the Orders tab.
  const text = changed && STATUS_MESSAGES[status]?.(shortId(order));
  if (text) await PublicMessage.create({ businessId: order.businessId, sessionId: order.sessionId, role: 'assistant', content: text });
  res.json(view(order));
});

export default router;
