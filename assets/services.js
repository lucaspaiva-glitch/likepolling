// /services: country picker -> Lemon Squeezy checkout (no account), quote and sponsor emails.
// Remembers the ?ref= a visitor arrived with (e.g. ?ref=linkedin) and passes it to the checkout so
// Lemon Squeezy's order list shows which channel sold. Nothing is sent to Like Polling.
(function () {
  'use strict';
  // Lemon Squeezy "Share" link of the report product. Empty until the store is approved: then the
  // button opens an email order instead.
  const CHECKOUT_URL = '';
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
      u.searchParams.set('checkout[custom][countries]', list.join(','));
      if (source) u.searchParams.set('checkout[custom][ref]', source);
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
  $('sponsor-btn').href = mailto('Sponsoring Like Polling', `Hi! I'd like to know about sponsoring Like Polling.\n\nBrand:\nCountries we target:\nWebsite:${source ? `\n\n(found you via ${source})` : ''}`);
})();
