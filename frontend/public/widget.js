/*
 * Shop Agent chat widget. A shop owner pastes one line on their own website:
 *   <script src="https://YOUR-APP/widget.js" data-shop="your-shop-slug" async></script>
 * A round chat button appears in the bottom-right corner and opens the shop's chat page in a panel.
 * Optional: data-color="#e91e63" changes the button colour.
 * The page is served by the app itself, so the app must allow being shown in a frame on other sites.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute('data-shop');
  if (!slug) {
    console.warn('Shop Agent widget: add data-shop="your-shop-slug" to the script tag.');
    return;
  }
  var origin = new URL(script.src, location.href).origin;
  var color = script.getAttribute('data-color') || '#6c8cff';
  var open = false;
  var loaded = false;

  function build() {
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Chat with us');
    button.textContent = '💬';
    button.style.cssText =
      'position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;' +
      'font-size:28px;line-height:60px;padding:0;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:2147483646;background:' + color;

    var panel = document.createElement('iframe');
    panel.title = 'Chat';
    panel.setAttribute('allow', 'clipboard-write');
    panel.style.cssText =
      'position:fixed;right:20px;bottom:92px;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 110px);' +
      'border:0;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35);z-index:2147483646;display:none;background:#0f1115';

    button.addEventListener('click', function () {
      open = !open;
      if (open && !loaded) {
        panel.src = origin + '/shop/' + encodeURIComponent(slug) + '?embed=1'; // load only when first opened
        loaded = true;
      }
      panel.style.display = open ? 'block' : 'none';
      button.textContent = open ? '✕' : '💬';
      button.setAttribute('aria-label', open ? 'Close chat' : 'Chat with us');
    });

    document.body.appendChild(panel);
    document.body.appendChild(button);
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
