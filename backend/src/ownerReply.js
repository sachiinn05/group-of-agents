import { PublicMessage } from './db.js';
import { emitToCustomer, emitToOwner } from './realtime.js';

// The shop owner writes to a customer (from Telegram or the dashboard).
// It is saved in that customer's chat and pushed to their open page at once.
export async function ownerReply(businessId, sessionId, text) {
  await PublicMessage.create({ businessId, sessionId, role: 'owner', content: text });
  emitToCustomer(businessId, sessionId, 'chat:message', { role: 'owner', content: text });
  emitToOwner(businessId, 'chats:changed');
}
