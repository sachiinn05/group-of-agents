import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const User = model(
  'User',
  new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Set when the user connects Gmail via Google OAuth.
    google: {
      email: String,
      refreshToken: String,
    },
  })
);

export const Agent = model(
  'Agent',
  new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    role: { type: String, default: '' },
    category: { type: String, default: 'General' },
    tools: { type: [String], default: [] }, // names from emailTool.js TOOLS
    systemPrompt: { type: String, required: true },
  })
);

// Files the user uploads in chat. `text` is what the agent reads; `data` is the original
// file, kept so it can be attached to an outgoing email.
export const Attachment = model(
  'Attachment',
  new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, required: true },
    text: { type: String, default: '' },
    data: { type: Buffer, required: true },
  })
);

export const Message = model(
  'Message',
  new Schema(
    {
      agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
      attachments: [{ attachmentId: Schema.Types.ObjectId, filename: String }],
    },
    { timestamps: true }
  )
);

// ---- Business agents: a shop owner sets up a shop, customers chat with its public agent ----

export const Business = model(
  'Business',
  new Schema(
    {
      ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
      type: { type: String, default: 'shop' },
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true },
      info: {
        address: String,
        phone: String,
        timings: String,
        delivery: String,
        payments: String,
        policies: String,
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
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
    },
    { timestamps: true }
  )
);

export const connectDb = () => mongoose.connect(process.env.MONGO_URI);
