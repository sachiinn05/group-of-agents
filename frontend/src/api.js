const TOKEN_KEY = 'agents_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, body) {
  const token = getToken();
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
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
export const sendMessage = (id, message) => request(`/agents/${id}/chat`, { message });
