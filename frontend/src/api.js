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
export const createBusiness = (name, info, deliveryAreas) => request('/business', { body: { name, info, deliveryAreas } });
export const updateBusiness = (name, info, deliveryAreas) =>
  request('/business', { method: 'PUT', body: { name, info, deliveryAreas } });

export const getProducts = () => request('/business/products');
export const addProduct = (product) => request('/business/products', { body: product });
export const bulkAddProducts = (text) => request('/business/products/bulk', { body: { text } });
export const updateProduct = (id, fields) => request(`/business/products/${id}`, { method: 'PATCH', body: fields });
export const deleteProduct = (id) => request(`/business/products/${id}`, { method: 'DELETE' });

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
export const sendShopMessage = (slug, sessionId, message, cart) =>
  request(`/public/${slug}/chat`, { body: { sessionId, message, cart } });
