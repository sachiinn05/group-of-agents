import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const User = model(
  'User',
  new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Set when the user connects Gmail (Email Agent). The refresh token lets us send on their behalf.
    google: {
      email: String,
      refreshToken: String,
    },
    // Gmail connected with an App Password (no Google Cloud needed). One password lets the agent send over SMTP
    // and read the inbox over IMAP. Stored encrypted (see secrets.js).
    mailbox: {
      email: String,
      passwordEnc: String,
    },
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

// ---------------------------------------------------------------------------------------------
// Email Agent: sends emails by itself when a "situation" (rule) becomes true for a contact.
// ---------------------------------------------------------------------------------------------

export const EmailSettings = model(
  'EmailSettings',
  new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // dryrun = write the emails and log them, but do not send. live = really send. Starts as dryrun for safety.
    mode: { type: String, enum: ['dryrun', 'live'], default: 'dryrun' },
    paused: { type: Boolean, default: false }, // the big stop button
    dailyLimit: { type: Number, default: 30, min: 1, max: 400 }, // real emails per rolling 24 hours
    senderName: { type: String, default: '' },
    signature: { type: String, default: '' }, // added under every email the agent writes
    // How the agent writes like the user
    about: { type: String, default: '' }, // who the user is, so emails are specific: "Fresher software developer..."
    tone: { type: String, enum: ['friendly', 'formal', 'short'], default: 'friendly' },
    styleSample: { type: String, default: '' }, // the user's own emails, to copy the voice (not the sentences)
    // Reading the inbox. off = ignore it. draft = understand replies and prepare answers for the user to approve.
    // auto = also send the safe ones (thanks, simple questions) by itself.
    inboxMode: { type: String, enum: ['off', 'draft', 'auto'], default: 'draft' },
    lastUid: { type: Number, default: null }, // the newest inbox message already looked at
  })
);

// A person the agent may email. `status` drives the situations ("applied", "interview", "customer"...).
export const Contact = model(
  'Contact',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      name: { type: String, default: '' },
      email: { type: String, required: true }, // lower case
      company: { type: String, default: '' },
      notes: { type: String, default: '' }, // anything the agent should know when writing to them
      status: { type: String, default: 'new' }, // lower case
      statusAt: { type: Date, default: Date.now }, // when the status last changed
      optedOut: { type: Boolean, default: false }, // never email this person automatically
      lastRepliedAt: Date, // the last time they wrote back (found in the inbox)
    },
    { timestamps: true }
  ).index({ userId: 1, email: 1 }, { unique: true })
);

// A situation and what to do about it.
//   contact_added    -> when a contact is added
//   status_changed   -> the moment a contact's status becomes `status`
//   status_for_days  -> `days` days after a contact's status became `status`, if it is still that
export const TRIGGERS = ['contact_added', 'status_changed', 'status_for_days'];
export const Rule = model(
  'Rule',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      name: { type: String, required: true },
      enabled: { type: Boolean, default: true },
      trigger: {
        type: { type: String, enum: TRIGGERS, required: true },
        status: { type: String, default: '' },
        days: { type: Number, default: 0 },
      },
      instructions: { type: String, required: true }, // what the email should say, in plain words
    },
    { timestamps: true }
  )
);

// Every email the agent wrote, sent or not. The unique key below is what stops the same situation
// from emailing the same person twice, even if two checks overlap.
export const EmailLog = model(
  'EmailLog',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      ruleId: { type: Schema.Types.ObjectId, ref: 'Rule' },
      contactId: { type: Schema.Types.ObjectId, ref: 'Contact' },
      source: { type: String, enum: ['rule', 'chat', 'inbox'], default: 'rule' },
      reason: String, // why the agent wrote this email, in one line
      messageId: String, // the email's Message-ID, so a reply to it can be recognised
      to: { type: String, required: true },
      subject: { type: String, default: '' },
      body: { type: String, default: '' },
      outcome: { type: String, enum: ['sending', 'sent', 'dry_run', 'failed', 'skipped'], required: true },
      error: String,
      dedupeKey: String,
    },
    { timestamps: true }
  ).index({ ruleId: 1, contactId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { ruleId: { $type: 'objectId' } } })
);

// An email that arrived in the user's inbox, and what the agent made of it.
export const InboxMessage = model(
  'InboxMessage',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      uid: { type: Number, required: true }, // the inbox's own number for the message
      messageId: String,
      references: [String], // earlier Message-IDs in the conversation, needed to reply in the same thread
      fromEmail: { type: String, required: true },
      fromName: String,
      subject: String,
      text: String,
      date: Date,
      contactId: { type: Schema.Types.ObjectId, ref: 'Contact' },
      category: String, // interested, rejected, question, scheduling, out_of_office, unsubscribe, thanks, other, ignored
      // replied = the agent answered. needs_you = a draft waits for approval. noted = understood, nothing to send.
      // ignored = automated mail or not from a known contact. dismissed / sent = the owner dealt with the draft.
      outcome: { type: String, enum: ['replied', 'needs_you', 'noted', 'ignored', 'dismissed', 'sent', 'failed'], required: true },
      reason: String, // why the agent did what it did
      draft: { subject: String, body: String },
    },
    { timestamps: true }
  ).index({ userId: 1, uid: 1 }, { unique: true })
);

// What the agent is doing, shown live to the user. Forgotten after a week.
export const AgentEvent = model(
  'AgentEvent',
  new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, default: 'info' }, // info, write, send, read, decide, warn, error
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
  })
);

// The owner's conversation with the Email Agent.
export const EmailChatMessage = model(
  'EmailChatMessage',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
    },
    { timestamps: true }
  )
);

export const connectDb = () => mongoose.connect(process.env.MONGO_URI);
