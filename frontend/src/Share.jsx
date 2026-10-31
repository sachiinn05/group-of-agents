import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A QR code for the counter, a printable poster, and the one-line chat widget for the shop's own website.
export default function Share({ business, link }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    QRCode.toDataURL(link, { width: 480, margin: 2 }).then(setQr).catch(() => setQr(''));
  }, [link]);

  const snippet = `<script src="${window.location.origin}/widget.js" data-shop="${business.slug}" async></script>`;

  async function copy(text, what) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  }

  // Opens a clean page with just the poster, and prints it.
  function printPoster() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><title>${escapeHtml(business.name)}</title>
      <body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
        <h1 style="font-size:44px;margin:0 0 8px">${escapeHtml(business.name)}</h1>
        <p style="font-size:24px;margin:0 0 24px">Scan to chat, see our menu and order</p>
        <img src="${qr}" style="width:420px;height:420px" alt="QR code">
        <p style="font-size:16px;color:#555;margin-top:24px">${escapeHtml(link)}</p>
      </body>`);
    w.document.close();
    w.onload = () => w.print();
  }

  return (
    <div className="share">
      {qr && (
        <div className="qr-box">
          <img src={qr} alt="QR code for your shop link" width="170" height="170" />
          <div className="qr-actions">
            <p className="muted small">Print it and put it at the counter, on the menu or on your bill.</p>
            <a className="btn small" href={qr} download={`${business.slug}-qr.png`}>Download QR</a>
            <button className="btn small ghost" onClick={printPoster}>Print poster</button>
          </div>
        </div>
      )}
      <div>
        <strong>Chat widget for your own website</strong>
        <p className="muted small">Paste this line before the closing &lt;/body&gt; tag of your website. A chat button appears in the corner.</p>
        <div className="link-row">
          <input readOnly value={snippet} onFocus={(e) => e.target.select()} />
          <button className="btn small" onClick={() => copy(snippet, 'widget')}>{copied === 'widget' ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    </div>
  );
}
