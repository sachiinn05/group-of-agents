import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const User = model(
  'User',
  new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  })
);

// A shop owner sets up a shop, and customers chat with the shop's public agent.

export const Business = model(
  'Business',
  new Schema(
    {
      ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
      type: { type: String, default: 'general' }, // a key of SHOP_TYPES in profiles.js
      typeLabel: String, // what the owner calls it when type is "other", like "Pet shop"
      modes: { type: [String], default: [] }, // delivery, pickup, dinein, appointment; empty = the type's defaults
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true },
      info: {
        address: String,
        phone: String,
        timings: String,
        delivery: String,
        payments: String,
        policies: String,
        upiId: String, // for payment links, like shopname@okhdfcbank
      },
      // Areas or pincodes the shop delivers to. Empty means no restriction.
      deliveryAreas: { type: [String], default: [] },
      // Where new-lead alerts go. linkCode is a one-time secret used while connecting.
      telegram: {
        chatId: String,
        linkCode: { type: String, index: true },
      },
    },
    { timestamps: true }
  )
);

// Documents the owner uploads (price list, catalogue, FAQ). The agent answers from these.
export const Document = model(
  'Document',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      filename: { type: String, required: true },
      text: { type: String, required: true },
    },
    { timestamps: true }
  )
);

// A customer who asked for an order or a callback.
export const Lead = model(
  'Lead',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      name: String,
      phone: { type: String, required: true },
      note: String,
      status: { type: String, enum: ['new', 'contacted', 'done'], default: 'new' },
      sessionId: String,
    },
    { timestamps: true }
  )
);

// Customer chat history, keyed by a session id the browser keeps.
export const PublicMessage = model(
  'PublicMessage',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      sessionId: { type: String, required: true, index: true },
      role: { type: String, enum: ['user', 'assistant', 'owner'], required: true }, // owner = the shop owner replied
      content: { type: String, required: true },
    },
    { timestamps: true }
  )
);

// A running offer or announcement ("10% off on rice today"). The agent and the customer page share it until it expires.
export const Offer = model(
  'Offer',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      text: { type: String, required: true },
      expiresAt: Date, // empty = until the owner removes it
    },
    { timestamps: true }
  )
);

// Something customers asked that the agent could not answer. Counted, so the owner sees what to add.
export const Unanswered = model(
  'Unanswered',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      key: { type: String, required: true }, // the question in lower case, to count repeats
      question: { type: String, required: true },
      count: { type: Number, default: 1 },
      lastAskedAt: { type: Date, default: Date.now },
      handled: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);

// Remembers which customer a Telegram alert was about, so the owner can answer by replying to it.
export const TelegramThread = model(
  'TelegramThread',
  new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    chatId: { type: String, required: true },
    messageId: { type: Number, required: true },
    sessionId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }, // forgotten after 30 days
  })
);

// What the shop sells. The agent looks prices and stock up here, so it never guesses.
export const Product = model(
  'Product',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      name: { type: String, required: true },
      unit: { type: String, default: '' }, // what one unit is, like "1 kg" or "pack of 6"
      category: { type: String, default: '' }, // groups the menu: Starters, Men, Hair...
      note: { type: String, default: '' }, // shown to customers and the agent: Veg, size M, prescription needed
      price: { type: Number, required: true, min: 0 }, // price of one unit
      inStock: { type: Boolean, default: true },
      stockQty: { type: Number, default: null, min: 0 }, // null = not tracked
    },
    { timestamps: true }
  )
);

export const ORDER_STATUSES = ['pending', 'accepted', 'out_for_delivery', 'delivered', 'cancelled'];

// A customer order. Totals are computed by the server from product prices, never by the AI.
export const Order = model(
  'Order',
  new Schema(
    {
      businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
      sessionId: { type: String, required: true, index: true },
      customerName: String,
      phone: { type: String, required: true },
      fulfilment: { type: String, enum: ['delivery', 'pickup', 'dinein', 'appointment'], default: 'delivery' },
      address: String,
      schedule: String, // table or arrival time (dine-in), pickup time, or the booking date and time
      lang: { type: String, enum: ['en', 'hi'], default: 'en' }, // language the customer chose, for messages we send them
      note: String,
      items: [
        {
          productId: Schema.Types.ObjectId,
          name: String,
          unit: String,
          price: Number,
          qty: Number,
        },
      ],
      total: { type: Number, required: true },
      status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
      stockDeducted: { type: Boolean, default: false },
      feedback: { rating: Number, comment: String },
    },
    { timestamps: true }
  )
);

export const connectDb = () => mongoose.connect(process.env.MONGO_URI);
