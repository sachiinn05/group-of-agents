import { useEffect, useState } from 'react';
import { getTelegram, linkTelegram, testTelegram, disconnectTelegram } from './api.js';

// Instant order alerts on the owner's Telegram.
export default function Alerts() {
  const [status, setStatus] = useState(null);
  const [waiting, setWaiting] = useState(false); // the owner is in Telegram pressing Start
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => getTelegram().then(setStatus).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  // While the owner links in Telegram, check every 3 seconds until it shows as connected.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const s = await getTelegram().catch(() => null);
      if (s?.connected) {
        setStatus(s);
        setWaiting(false);
        setMessage('Telegram connected. You will get new orders there.');
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function connect() {
    setError('');
    setMessage('');
    try {
      const { url } = await linkTelegram();
      window.open(url, '_blank', 'noopener');
      setWaiting(true);
    } catch (e) {
      setError(e.message);
    }
  }

  async function test() {
    setError('');
    try {
      await testTelegram();
      setMessage('Test message sent. Check Telegram.');
    } catch (e) {
      setError(e.message);
    }
  }

  async function disconnect() {
    await disconnectTelegram();
    setMessage('');
    load();
  }

  if (!status) return null;

  return (
    <section className="card">
      <h3>Instant order alerts</h3>
      {!status.configured ? (
        <p className="muted">Alerts are not switched on for this server yet. Until then, check the Customer leads tab.</p>
      ) : status.connected ? (
        <>
          <p className="ok">Connected. New orders and callbacks arrive on your Telegram.</p>
          <div className="link-row">
            <button className="btn small ghost" onClick={test}>Send test message</button>
            <button className="link-btn danger" onClick={disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Get a Telegram message the moment a customer places an order, so you can call them straight away.</p>
          <button className="btn" onClick={connect}>{waiting ? 'Waiting for you in Telegram...' : 'Connect Telegram'}</button>
          {waiting && <p className="muted">Tap <b>Start</b> in the Telegram chat that opened. This page updates by itself.</p>}
        </>
      )}
      {message && <div className="ok">{message}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}
