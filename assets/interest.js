// Anonymous interest counter: one "visit" per page load and one "buy" per Gumroad Buy click.
// Sends only the page or product name; the server adds the visitor's country. No cookies.
// The answer (the visitor's country) also shows euro prices in local money: any <span class="lp-local" data-eur="8">
// becomes " ≈ R$49", using free European Central Bank rates (frankfurter.dev). Euro countries see nothing extra.
(function () {
  const PAGES = { '/': 'home', '/index': 'home', '/pulse': 'pulse', '/services': 'services', '/report': 'report', '/ad': 'ad' };
  const PRODUCTS = { udjsyu: 'country', ijixxs: 'artist', linzh: 'company', laijtn: 'ad' };
  const CURRENCY = { US: 'USD', EC: 'USD', BR: 'BRL', GB: 'GBP', JP: 'JPY', KR: 'KRW', MX: 'MXN', IN: 'INR', ID: 'IDR', MY: 'MYR', PH: 'PHP',
    TH: 'THB', TR: 'TRY', ZA: 'ZAR', PL: 'PLN', AU: 'AUD', CA: 'CAD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', CZ: 'CZK', HU: 'HUF',
    RO: 'RON', IL: 'ILS', SG: 'SGD', HK: 'HKD', NZ: 'NZD', CN: 'CNY', IS: 'ISK' };
  const send = (kind, item) => {
    const body = JSON.stringify({ kind, item });
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/visit', body))) fetch('/api/visit', { method: 'POST', body, keepalive: true }).catch(() => {});
    } catch { /* counting is best effort */ }
  };
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  async function localMoney(country) {
    const cur = CURRENCY[country];
    if (!cur) return;
    let rate = store.get(`lp_rate_${cur}`);
    if (!rate) {
      const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${cur}`).then((x) => x.json());
      rate = r && r.rates && r.rates[cur];
      if (!(rate > 0)) return;
      store.set(`lp_rate_${cur}`, rate);
    }
    let lang = 'en';
    try { lang = localStorage.getItem('lp-lang') || 'en'; } catch { /* ignore */ }
    const fmt = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang, { style: 'currency', currency: cur, maximumFractionDigits: 0 });
    const fill = () => document.querySelectorAll('.lp-local[data-eur]').forEach((el) => {
      const t = ` ≈ ${fmt.format(Number(el.dataset.eur) * rate)}`;
      if (el.textContent !== t) el.textContent = t;
    });
    fill();
    new MutationObserver(fill).observe(document.body, { childList: true, subtree: true }); // cards re-render on language change
  }
  const page = PAGES[location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'];
  if (page) {
    fetch('/api/visit', { method: 'POST', body: JSON.stringify({ kind: 'visit', item: page }), keepalive: true })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j && j.country && localMoney(j.country)).catch(() => {});
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="gumroad.com/l/"]');
    const id = a && (a.getAttribute('href').match(/gumroad\.com\/l\/([a-z0-9]+)/i) || [])[1];
    if (id && PRODUCTS[id]) send('buy', PRODUCTS[id]);
  }, true);
})();
