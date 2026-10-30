const TOKEN_KEY = 'agents_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// `body` may be a plain object (sent as JSON) or FormData (sent as multipart).
async function request(path, body) {
  const token = getToken();
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
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

export const login = (email, password) => request('/auth/login', { email, password });
export const signup = (email, password) => request('/auth/signup', { email, password });
export const getAgents = () => request('/agents');
export const getMessages = (id) => request(`/agents/${id}/messages`);

export function sendMessage(id, message, files = []) {
  if (files.length === 0) return request(`/agents/${id}/chat`, { message });
  const form = new FormData();
  form.append('message', message);
  files.forEach((f) => form.append('files', f));
  return request(`/agents/${id}/chat`, form);
}

export const getGmailStatus = () => request('/google/status');
export const getGmailUrl = () => request('/google/url');
export const disconnectGmail = () => request('/google/disconnect', {});
