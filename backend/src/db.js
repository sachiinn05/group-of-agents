import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const User = model(
  'User',
  new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  })
);

export const Agent = model(
  'Agent',
  new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    role: { type: String, default: '' },
    systemPrompt: { type: String, required: true },
  })
);

export const Message = model(
  'Message',
  new Schema(
    {
      agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
      role: { type: String, enum: ['user', 'assistant'], required: true },
      content: { type: String, required: true },
    },
    { timestamps: true }
  )
);

export const connectDb = () => mongoose.connect(process.env.MONGO_URI);
