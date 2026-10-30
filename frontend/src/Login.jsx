import { useState } from 'react';
import { login, signup, setToken } from './api.js';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token } = await (isLogin ? login : signup)(email, password);
      setToken(token);
      onAuth();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Groups of Agents</h1>
        <p>{isLogin ? 'Log in to meet your agents.' : 'Create an account to get your agents.'}</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>
          {busy ? 'Please wait...' : isLogin ? 'Log in' : 'Sign up'}
        </button>
        <p>
          {isLogin ? 'New here? ' : 'Already have an account? '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(isLogin ? 'signup' : 'login');
              setError('');
            }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </form>
    </div>
  );
}
