// Anonymous interest counter: one "visit" per page load and one "buy" per Gumroad Buy click.
// Sends only the page or product name; the server adds the visitor's country. No cookies.
// Euro prices also show in the money of the chosen language: <span class="lp-local" data-eur="8"> becomes " ≈ R$49" in
// Portuguese, and a tab price <em class="lp-price" data-eur="8">€8</em> becomes "≈R$49". Checkout stays in euros.
// Rates: European Central Bank (frankfurter.dev); hryvnia from the National Bank of Ukraine. Euro languages see euros only.
(function () {
  const PAGES = { '/': 'home', '/index': 'home', '/pulse': 'pulse', '/services': 'services', '/report': 'report', '/ad': 'ad' };
  const PRODUCTS = { udjsyu: 'country', ijixxs: 'artist', linzh: 'company', laijtn: 'ad' };
  const CURRENCY = { en: 'USD', 'en-GB': 'GBP', pt: 'BRL', uk: 'UAH', ko: 'KRW', ja: 'JPY' };
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
  const rateOf = async (cur) => {
    let rate = store.get(`lp_rate_${cur}`);
    if (rate > 0) return rate;
    if (cur === 'UAH') {
      const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json').then((x) => x.json());
      rate = r && r[0] && r[0].rate;
    } else {
      const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${cur}`).then((x) => x.json());
      rate = r && r.rates && r.rates[cur];
    }
    if (rate > 0) store.set(`lp_rate_${cur}`, rate);
    return rate > 0 ? rate : null;
  };
  let money = null;
  const fill = () => {
    document.querySelectorAll('.lp-local[data-eur]').forEach((el) => {
      const t = money ? ` ≈ ${money(Number(el.dataset.eur))}` : '';
      if (el.textContent !== t) el.textContent = t;
    });
    document.querySelectorAll('.lp-price[data-eur]').forEach((el) => {
      const t = money ? `≈${money(Number(el.dataset.eur))}` : `€${el.dataset.eur}`;
      if (el.textContent !== t) el.textContent = t;
      el.title = money ? `€${el.dataset.eur}` : '';
    });
  };
  async function localMoney() {
    const lang = window.LP_I18N ? window.LP_I18N.lang : 'en';
    const cur = CURRENCY[lang];
    const rate = cur ? await rateOf(cur).catch(() => null) : null;
    if (lang !== (window.LP_I18N ? window.LP_I18N.lang : 'en')) return;
    const fmt = rate && new Intl.NumberFormat(window.LP_I18N ? window.LP_I18N.locale() : 'en', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
    money = fmt ? (eur) => fmt.format(eur * rate) : null;
    fill();
  }
  localMoney();
  document.addEventListener('lp:lang', localMoney);
  new MutationObserver(fill).observe(document.body, { childList: true, subtree: true }); // cards re-render on language change
  const page = PAGES[location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/'];
  if (page) {
    fetch('/api/visit', { method: 'POST', body: JSON.stringify({ kind: 'visit', item: page }), keepalive: true }).catch(() => {});
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="gumroad.com/l/"]');
    const id = a && (a.getAttribute('href').match(/gumroad\.com\/l\/([a-z0-9]+)/i) || [])[1];
    if (id && PRODUCTS[id]) send('buy', PRODUCTS[id]);
  }, true);
})();
