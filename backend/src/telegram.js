import { Business } from './db.js';

// Instant alerts to the shop owner on Telegram. Needs TELEGRAM_BOT_TOKEN (create a bot with @BotFather).
// Without it the app still works; owners just check the leads list.

const token = () => process.env.TELEGRAM_BOT_TOKEN;
export const telegramConfigured = () => !!token();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

let botUsername;
export async function getBotUsername() {
  if (!botUsername) botUsername = (await api('getMe')).username;
  return botUsername;
}

export const sendTelegram = (chatId, text) => api('sendMessage', { chat_id: chatId, text });

// Handles one message sent to the bot: /start <code> links a chat to a shop, /stop turns alerts off.
export async function handleUpdate(update) {
  const text = update.message?.text;
  if (!text) return;
  const chatId = String(update.message.chat.id);
  const [command, code] = text.trim().split(/\s+/);

  if (command === '/start' && code) {
    const business = await Business.findOne({ 'telegram.linkCode': code });
    if (!business) {
      return sendTelegram(chatId, 'This link has expired. Open your dashboard and click Connect Telegram again.');
    }
    await Business.updateOne({ _id: business._id }, { telegram: { chatId } });
    return sendTelegram(chatId, `Connected! You will get new orders and callback requests for ${business.name} here.`);
  }
  if (command === '/stop') {
    await Business.updateOne({ 'telegram.chatId': chatId }, { $unset: { telegram: 1 } });
    return sendTelegram(chatId, 'Alerts are off. Reconnect any time from your dashboard.');
  }
  if (command === '/start') {
    return sendTelegram(chatId, 'Open your Shop Agent dashboard and click Connect Telegram to link this chat.');
  }
}

// Long-polls Telegram for messages to the bot. Polling needs no public URL, so it works locally.
export function startTelegramPolling() {
  if (!telegramConfigured()) return;
  (async () => {
    let offset = 0;
    for (;;) {
      try {
        const updates = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
        for (const update of updates) {
          offset = update.update_id + 1;
          await handleUpdate(update).catch((e) => console.error('telegram update failed:', e.message));
        }
      } catch (e) {
        console.error('telegram polling:', e.message);
        await sleep(5000);
      }
    }
  })();
}

const rupees = (n) => `₹${Number(n).toFixed(2).replace(/\.00$/, '')}`;

// Tells the owner about a new order, with the items and the server-calculated total.
export async function notifyOrder(business, order) {
  const chatId = business.telegram?.chatId;
  if (!chatId || !telegramConfigured()) return;
  const lines = [
    `🛍 New order #${String(order._id).slice(-6).toUpperCase()} - ${business.name}`,
    `${order.customerName || 'Customer'} · ${order.phone}`,
    order.fulfilment === 'pickup' ? 'Pickup from shop' : `Deliver to: ${order.address}`,
    ...order.items.map((i) => `- ${i.qty} x ${i.name}${i.unit ? ` (${i.unit})` : ''} = ${rupees(i.price * i.qty)}`),
    `Total: ${rupees(order.total)}`,
    order.note ? `Note: ${order.note}` : '',
  ].filter(Boolean);
  try {
    await sendTelegram(chatId, lines.join('\n'));
  } catch (e) {
    console.error('telegram order alert failed:', e.message);
  }
}

// Tells the owner about a customer. Never throws: a failed alert must not break the customer's chat.
export async function notifyLead(business, lead, { updated = false } = {}) {
  const chatId = business.telegram?.chatId;
  if (!chatId || !telegramConfigured()) return;
  const lines = [
    `${updated ? '✏️ Updated order' : '🛒 New order / callback'} - ${business.name}`,
    `${lead.name || 'Customer'} · ${lead.phone}`,
    lead.note || '',
  ].filter(Boolean);
  try {
    await sendTelegram(chatId, lines.join('\n'));
  } catch (e) {
    console.error('telegram alert failed:', e.message);
  }
}
