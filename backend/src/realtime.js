import { Server } from 'socket.io';
import { Business } from './db.js';

// Live updates to a customer's open shop page (order status, messages from the shop).
// A customer's socket joins one room per chat session, so it only hears about its own orders.
// Like the REST routes, the unguessable session id is what proves it is that customer's session.

const SESSION_RE = /^[\w-]{8,64}$/;
const MAX_ROOMS_PER_SOCKET = 5;
const room = (businessId, sessionId) => `customer:${businessId}:${sessionId}`;

let io;

export function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: true } });
  io.on('connection', (socket) => {
    socket.on('join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const { slug, sessionId } = payload || {};
      if (typeof slug !== 'string' || !SESSION_RE.test(String(sessionId))) return reply({ error: 'invalid join' });
      if (socket.rooms.size > MAX_ROOMS_PER_SOCKET) return reply({ error: 'too many rooms' });
      const business = await Business.findOne({ slug }, '_id');
      if (!business) return reply({ error: 'shop not found' });
      socket.join(room(business._id, sessionId));
      reply({ ok: true });
    });
  });
}

// Sends an event to every open page of one customer session. Does nothing if nobody is listening.
export function emitToCustomer(businessId, sessionId, event, payload) {
  io?.to(room(businessId, sessionId)).emit(event, payload);
}
