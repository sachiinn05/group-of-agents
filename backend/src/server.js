import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import authRoutes from './auth.js';
import agentRoutes from './agents.js';
import googleRoutes from './google.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/agents', agentRoutes);
app.use('/google', googleRoutes);

const port = process.env.PORT || 5000;
await connectDb();
console.log('MongoDB connected');
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
