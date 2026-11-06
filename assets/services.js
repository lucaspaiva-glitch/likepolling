// /services: country picker -> Lemon Squeezy checkout (no account), quote and sponsor emails.
// Remembers the ?ref= a visitor arrived with (e.g. ?ref=linkedin) and passes it to the checkout so
// Lemon Squeezy's order list shows which channel sold. Nothing is sent to Like Polling.
(function () {
  'use strict';
  // Lemon Squeezy "Share" link of the report product. Empty = the button opens an email order instead.
  const LEMON_URL = 'https://likepolling.lemonsqueezy.com/checkout/buy/482d48a0-1fcf-461b-a8d5-050e6cafb544';
  // Gumroad product link; when set, the Buy button uses Gumroad instead (it pays out to Brazil via PayPal).
  const GUMROAD_URL = '';
  const CHECKOUT_URL = GUMROAD_URL || LEMON_URL;
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const MAIL = 'lucaspaiva@likepolling.com';
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const sorted = COUNTRIES.map((c) => [c, names.of(c)]).sort((a, b) => a[1].localeCompare(b[1]));
  const $ = (id) => document.getElementById(id);
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };

  const ref = (new URLSearchParams(location.search).get('ref') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (ref && !store('lp_ref')) store('lp_ref', ref);
  const source = store('lp_ref') || '';

  const c1 = $('c1');
  const c2 = $('c2');
  c1.innerHTML = sorted.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  c2.innerHTML = '<option value="">No comparison</option>' + c1.innerHTML;
  c1.value = 'BR';
  c2.value = 'PT';

  const mailto = (subject, body) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const chosen = () => [c1.value, c2.value].filter((c, i, a) => c && a.indexOf(c) === i);

  function update() {
    const list = chosen();
    const label = list.map((c) => names.of(c)).join(' vs ');
    if (CHECKOUT_URL) {
      const u = new URL(CHECKOUT_URL);
      if (GUMROAD_URL) {
        u.searchParams.set('wanted', 'true');
        if (source) u.searchParams.set('utm_source', source);
      } else {
        u.searchParams.set('checkout[custom][countries]', list.join(','));
        if (source) u.searchParams.set('checkout[custom][ref]', source);
      }
      $('buy').href = u.toString();
      $('buy').textContent = `Buy report: ${label}`;
    } else {
      $('buy').href = mailto(`Country Inspiration Report: ${label}`, `Hi! I'd like the Country Inspiration Report for ${label}.${source ? `\n\n(found you via ${source})` : ''}`);
      $('buy').textContent = `Order by email: ${label}`;
    }
  }
  c1.addEventListener('change', update);
  c2.addEventListener('change', update);
  $('buy').addEventListener('click', () => store('lp_report_countries', chosen().join(',')));
  update();

  const quote = () => { $('quote').href = mailto('Custom gathering / monitoring', `Hi! Here's what I need:\n\n${$('need').value.trim()}\n\nCompany:\nCountries:\nDeadline:${source ? `\n\n(found you via ${source})` : ''}`); };
  $('need').addEventListener('input', quote);
  quote();
  // Live preview of the free sample, so the page always shows today's numbers.
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  fetch('/api/report?country=BR&compare=PT').then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => {
    const [br, pt] = d.countries;
    $('pv-kpis').innerHTML = [[br, 'Brazil'], [pt, 'Portugal']].map(([c, n]) => `<div><b>${num(c.news_focus.articles)}</b><span>news articles about ${n}</span></div>`).join('');
    const nd = br.news_daily || [];
    if (nd.length > 1) {
      const max = Math.max(...nd.map((x) => x.articles)), W = 300, H = 90;
      const pts = nd.map((x, i) => `${((i * (W - 8)) / (nd.length - 1) + 4).toFixed(1)},${(H - 6 - (x.articles / max) * (H - 16)).toFixed(1)}`).join(' ');
      const pk = nd.findIndex((x) => x.articles === max), [px, py] = pts.split(' ')[pk].split(',');
      $('pv-chart').innerHTML = `<polygon points="4,${H - 6} ${pts} ${W - 4},${H - 6}" fill="#fbeaec"/><polyline points="${pts}" fill="none" stroke="#b0000e" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${px}" cy="${py}" r="4" fill="#fff" stroke="#b0000e" stroke-width="2.5"/>`;
      const day = new Date(`${nd[pk].day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      $('pv-take').innerHTML = `Brazil's busiest news day was <b>${day}</b>, with ${num(max)} articles. ${num(d.shared.articles_together)} articles mentioned both countries.`;
    }
    const top = br.wikipedia.slice(0, 3), m = (top[0] && top[0].views) || 1;
    $('pv-rank').innerHTML = top.map((w) => `<li><div class="l"><span>${esc(w.title)}</span><b>${num(w.views)}</b></div><i style="--w:${((w.views / m) * 100).toFixed(0)}%"></i></li>`).join('');
  }).catch(() => { $('pv-take').textContent = 'Open the free sample to see a full report.'; });

  $('sponsor-btn').href = mailto('Sponsoring Like Polling', `Hi! I'd like to know about sponsoring Like Polling.\n\nBrand:\nCountries we target:\nWebsite:${source ? `\n\n(found you via ${source})` : ''}`);
})();
