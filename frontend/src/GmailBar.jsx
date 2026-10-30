import { useEffect, useState } from 'react';
import { getGmailStatus, getGmailUrl, disconnectGmail } from './api.js';

const NOTICES = {
  connected: 'Gmail connected.',
  'error:access_denied': 'Gmail connection was cancelled.',
  'error:invalid_state': 'Gmail connection failed (expired link). Try again.',
  'error:no_refresh_token': 'Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and try again.',
};

export default function GmailBar({ notice }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getGmailStatus().then(setStatus).catch((e) => setError(e.message));
  }, [notice]);

  async function connect() {
    setError('');
    try {
      const { url } = await getGmailUrl();
      window.location.href = url; // Google asks for consent, then sends us back here
    } catch (e) {
      setError(e.message);
    }
  }

  async function disconnect() {
    await disconnectGmail();
    setStatus((s) => ({ ...s, connected: false, email: null }));
  }

  if (!status) return null;

  return (
    <div className="gmail-bar">
      {notice && (
        <span className={notice === 'connected' ? 'ok' : 'error'}>
          {NOTICES[notice] || `Gmail: ${notice.replace('error:', '')}`}
        </span>
      )}
      {status.connected ? (
        <>
          <span className="ok">Gmail connected: {status.email}</span>
          <button className="link-btn" onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <>
          <span className="muted">Gmail not connected, so I can't send emails yet.</span>
          <button className="btn small" onClick={connect}>Connect Gmail</button>
        </>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
