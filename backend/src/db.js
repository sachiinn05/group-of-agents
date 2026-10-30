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

export const connectDb = () => mongoose.connect(process.env.MONGO_URI);
