const TOKEN_KEY = 'agents_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// `body` may be a plain object (sent as JSON) or FormData (sent as multipart).
async function request(path, { method, body } = {}) {
  const token = getToken();
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      ...(body && !isForm && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && (isForm ? body : JSON.stringify(body)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- owner ----
export const login = (email, password) => request('/auth/login', { body: { email, password } });
export const signup = (email, password) => request('/auth/signup', { body: { email, password } });

export const getBusiness = () => request('/business');
// shop = { name, info, deliveryAreas, type, typeLabel, modes }
export const createBusiness = (shop) => request('/business', { body: shop });
export const updateBusiness = (shop) => request('/business', { method: 'PUT', body: shop });
export const getBusinessTypes = () => request('/business/types');

export const getProducts = () => request('/business/products');
export const addProduct = (product) => request('/business/products', { body: product });
export const bulkAddProducts = (text) => request('/business/products/bulk', { body: { text } });
export const updateProduct = (id, fields) => request(`/business/products/${id}`, { method: 'PATCH', body: fields });
export const deleteProduct = (id) => request(`/business/products/${id}`, { method: 'DELETE' });

export const getOffers = () => request('/business/offers');
export const addOffer = (text, expiresOn) => request('/business/offers', { body: { text, expiresOn } });
export const deleteOffer = (id) => request(`/business/offers/${id}`, { method: 'DELETE' });

export const getChats = () => request('/business/chats');
export const getChat = (sessionId) => request(`/business/chats/${sessionId}`);
export const replyToChat = (sessionId, text) => request(`/business/chats/${sessionId}/reply`, { body: { text } });
export const getUnanswered = () => request('/business/unanswered');
export const markUnansweredDone = (id) => request(`/business/unanswered/${id}`, { method: 'PATCH', body: {} });

export const getOrders = () => request('/business/orders');
export const setOrderStatus = (id, status) => request(`/business/orders/${id}`, { method: 'PATCH', body: { status } });

export function uploadDocuments(files) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return request('/business/documents', { body: form });
}
export const deleteDocument = (id) => request(`/business/documents/${id}`, { method: 'DELETE' });

export const getTelegram = () => request('/business/telegram');
export const linkTelegram = () => request('/business/telegram/link', { method: 'POST', body: {} });
export const testTelegram = () => request('/business/telegram/test', { method: 'POST', body: {} });
export const disconnectTelegram = () => request('/business/telegram/disconnect', { method: 'POST', body: {} });

export const getLeads = () => request('/business/leads');
export const setLeadStatus = (id, status) => request(`/business/leads/${id}`, { method: 'PATCH', body: { status } });

// ---- customer (no login) ----
export const getShop = (slug) => request(`/public/${slug}`);
export const getShopHistory = (slug, sessionId) => request(`/public/${slug}/history?sessionId=${sessionId}`);
export const getShopMenu = (slug) => request(`/public/${slug}/products`);
export const placeCartOrder = (slug, sessionId, order) =>
  request(`/public/${slug}/orders`, { body: { sessionId, ...order } });
export const getShopOrders = (slug, sessionId) => request(`/public/${slug}/orders?sessionId=${sessionId}`);
export const rateOrder = (slug, sessionId, orderId, rating, comment) =>
  request(`/public/${slug}/orders/${orderId}/feedback`, { body: { sessionId, rating, comment } });
// `cart` ({ productId: qty }) goes along so the agent knows what is already in it.
// `lang` ('en' or 'hi') is the language the customer chose for the page.
export const sendShopMessage = (slug, sessionId, message, cart, lang) =>
  request(`/public/${slug}/chat`, { body: { sessionId, message, cart, lang } });
