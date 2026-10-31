import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import authRoutes from './auth.js';
import businessRoutes from './business.js';
import publicChatRoutes from './publicChat.js';
import productRoutes from './products.js';
import orderRoutes from './orders.js';
import { startTelegramPolling } from './telegram.js';
import { initRealtime } from './realtime.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes); // owner signup and login
app.use('/business/products', productRoutes);
app.use('/business/orders', orderRoutes);
app.use('/business', businessRoutes); // owner: shop, documents, leads
app.use('/public', publicChatRoutes); // customers: chat with a shop's agent (no login)

const port = process.env.PORT || 5000;
await connectDb();
console.log('MongoDB connected');

const server = createServer(app);
initRealtime(server); // Socket.IO shares the same port
server.listen(port, () => console.log(`API running on http://localhost:${port}`));
startTelegramPolling();
