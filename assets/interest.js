// Anonymous interest counter: one "visit" per page load and one "buy" per Gumroad Buy click.
// Sends only the page or product name; the server adds the visitor's country. No cookies.
(function () {
  const PAGES = { '/': 'home', '/index': 'home', '/pulse': 'pulse', '/services': 'services', '/report': 'report', '/ad': 'ad' };
  const PRODUCTS = { udjsyu: 'country', ijixxs: 'artist', linzh: 'company', laijtn: 'ad' };
  const send = (kind, item) => {
    const body = JSON.stringify({ kind, item });
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/visit', body))) {
        fetch('/api/visit', { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    } catch { /* counting is best effort */ }
  };
  const page = PAGES[location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'];
  if (page) send('visit', page);
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="gumroad.com/l/"]');
    const id = a && (a.getAttribute('href').match(/gumroad\.com\/l\/([a-z0-9]+)/i) || [])[1];
    if (id && PRODUCTS[id]) send('buy', PRODUCTS[id]);
  }, true);
})();
