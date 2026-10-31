import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Business } from './db.js';

// Live updates over sockets, in two directions:
// - a customer's open shop page hears about its own order and chat (a room per chat session)
// - the shop owner's dashboard hears that something changed (a room per shop)
// Customers prove it is their session with the unguessable session id, like the REST routes.
// Owners prove who they are with their login token.

const SESSION_RE = /^[\w-]{8,64}$/;
const MAX_ROOMS_PER_SOCKET = 5;
const customerRoom = (businessId, sessionId) => `customer:${businessId}:${sessionId}`;
const ownerRoom = (businessId) => `owner:${businessId}`;

let io;

export function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: true } });

  io.on('connection', async (socket) => {
    // Owner dashboard: connects with { auth: { token } }.
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const { id } = jwt.verify(token, process.env.JWT_SECRET);
        const business = await Business.findOne({ ownerId: id }, '_id');
        if (business) socket.join(ownerRoom(business._id));
      } catch {
        // a bad or expired token just means no live updates; the dashboard still works
      }
    }

    // Customer shop page: asks to join its own session.
    socket.on('join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const { slug, sessionId } = payload || {};
      if (typeof slug !== 'string' || !SESSION_RE.test(String(sessionId))) return reply({ error: 'invalid join' });
      if (socket.rooms.size > MAX_ROOMS_PER_SOCKET) return reply({ error: 'too many rooms' });
      const business = await Business.findOne({ slug }, '_id');
      if (!business) return reply({ error: 'shop not found' });
      socket.join(customerRoom(business._id, sessionId));
      reply({ ok: true });
    });
  });
}

// Sends an event to every open page of one customer session. Does nothing if nobody is listening.
export function emitToCustomer(businessId, sessionId, event, payload) {
  io?.to(customerRoom(businessId, sessionId)).emit(event, payload);
}

// Tells the owner's open dashboards that something changed (orders, leads, chats...). They refetch.
export function emitToOwner(businessId, event) {
  io?.to(ownerRoom(businessId)).emit(event);
}
