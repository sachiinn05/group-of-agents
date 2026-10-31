import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import authRoutes from './auth.js';
import businessRoutes from './business.js';
import publicChatRoutes from './publicChat.js';
import productRoutes from './products.js';
import orderRoutes from './orders.js';
import offerRoutes from './offers.js';
import chatRoutes from './chats.js';
import emailRoutes from './emailRoutes.js';
import googleRoutes from './google.js';
import { startEmailScheduler } from './emailEngine.js';
import { startTelegramPolling } from './telegram.js';
import { initRealtime } from './realtime.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes); // owner signup and login
app.use('/business/products', productRoutes);
app.use('/business/orders', orderRoutes);
app.use('/business/offers', offerRoutes);
app.use('/business', chatRoutes); // owner: chats, replies, unanswered questions (each route has its own auth)
app.use('/business', businessRoutes); // owner: shop, documents, leads
app.use('/public', publicChatRoutes); // customers: chat with a shop's agent (no login)
app.use('/email', emailRoutes); // Email Agent: contacts, situations, log, chat
app.use('/google', googleRoutes); // connect Gmail for the Email Agent

const port = process.env.PORT || 5000;
await connectDb();
console.log('MongoDB connected');

const server = createServer(app);
initRealtime(server); // Socket.IO shares the same port
server.listen(port, () => console.log(`API running on http://localhost:${port}`));
startTelegramPolling();
startEmailScheduler(); // the Email Agent checks its situations every minute
