// Like Polling products, shown as cards on the homepage and /services (any element with [data-offers]).
// Edit OFFERS to add, remove or rename a product; PRICE is shared by every report.
// Computers: resting the mouse on a card opens it (like the sponsor card). Phones: a tap opens it.
(function () {
  'use strict';
  const PRICE = '€18';
  const MAIL = 'lucaspaiva@likepolling.com';
  // buy: Gumroad product link. Empty = the button opens an order email instead.
  const OFFERS = [
    { id: 'country', sym: 'Country', name: 'COUNTRY\nREPORT', sub: 'One country, or two side by side.', buy: 'https://lucaspoll.gumroad.com/l/udjsyu', sample: '/samples/country-report.pdf',
      stats: [['41', 'countries'], ['30', 'days of history'], ['2', 'side by side']] },
    { id: 'artist', sym: 'Artist', name: 'ARTIST\nREPORT', sub: 'Any artist, next to similar artists.', buy: '', sample: '/samples/artist-report.pdf',
      stats: [['4', 'artists compared'], ['17', 'languages'], ['30', 'days, day by day']] },
    { id: 'company', sym: 'Company', name: 'COMPANY\nREPORT', sub: 'Any company or brand, next to its rivals.', buy: '', sample: '/samples/company-report.pdf',
      stats: [['4', 'brands compared'], ['17', 'languages'], ['30', 'days, day by day']] },
    { id: 'sponsor', sym: 'Ad spot', top: 'Launch rate', name: 'YOUR BRAND\nHERE', sub: 'A card on Like Polling, seen in 41 countries.', mail: 'Sponsoring Like Polling',
      stats: [['41', 'countries'], ['2×', 'updated a day'], ['1', 'brand at a time']] },
  ];
  const roots = document.querySelectorAll('[data-offers]');
  if (!roots.length) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let source = '';
  try {
    const ref = (new URLSearchParams(location.search).get('ref') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (ref && !localStorage.getItem('lp_ref')) localStorage.setItem('lp_ref', ref);
    source = localStorage.getItem('lp_ref') || '';
  } catch { /* private mode */ }
  const mailto = (subject, body) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + (source ? `\n\n(found you via ${source})` : ''))}`;
  const buyLink = (o) => {
    if (!o.buy) return mailto(`${o.sym} report order`, `Hi! I'd like an Extended ${o.sym} Report (${PRICE}).\n\n${o.sym}:`);
    const u = new URL(o.buy);
    u.searchParams.set('wanted', 'true');
    if (source) u.searchParams.set('utm_source', source);
    return u.toString();
  };
  const card = (o) => {
    const report = !o.mail;
    const actions = report
      ? `<a class="svc-btn" href="${esc(buyLink(o))}">${o.buy ? `Buy · ${PRICE}` : `Order · ${PRICE}`}</a><a class="svc-link" href="${o.sample}" download>Download a free sample (PDF) ›</a><p class="svc-fine">Gathered every day since 24 Oct 2026. You choose after paying.</p>`
      : `<a class="svc-btn" href="${esc(mailto(o.mail, 'Hi! I\'d like to know about sponsoring Like Polling.\n\nBrand:\nCountries we target:\nWebsite:'))}">Ask about the ad spot</a><p class="svc-fine">Like the Machu Picchu Energy card. Monthly views and clicks included.</p>`;
    return `<section class="svc" id="offer-${o.id}">
      <button type="button" class="svc-tab" aria-expanded="false" aria-controls="offer-${o.id}-body">
        <span class="svc-top"><span class="svc-sym">${esc(o.sym)}</span><span>${esc(o.top || `${PRICE}`)}</span></span>
        <span class="svc-name svc-glitch" data-no-i18n data-text="${esc(o.name)}">${esc(o.name)}</span>
        <span class="svc-bar" aria-hidden="true"></span>
        <span class="svc-sub">${esc(o.sub)}</span>
        <span class="svc-more" aria-hidden="true">${report ? 'What you get' : 'How it works'} <i>›</i></span>
      </button>
      <div class="svc-body" id="offer-${o.id}-body">
        <div class="svc-stats">${o.stats.map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div>
        ${actions}
      </div>
    </section>`;
  };
  roots.forEach((r) => { r.classList.add('svc-grid'); r.innerHTML = OFFERS.map(card).join(''); });

  const cards = [...document.querySelectorAll('.svc')];
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  function setOpen(c, on) {
    c.classList.toggle('open', on);
    c.querySelector('.svc-tab').setAttribute('aria-expanded', String(on));
    if (!on) c.pinned = false;
  }
  cards.forEach((c) => {
    let t = 0;
    c.querySelector('.svc-tab').addEventListener('click', () => {
      clearTimeout(t);
      if (fine && c.classList.contains('open') && !c.pinned) { c.pinned = true; return; }
      const on = !c.classList.contains('open');
      if (!fine) cards.forEach((x) => x !== c && setOpen(x, false));
      setOpen(c, on);
      c.pinned = on;
    });
    if (!fine) return;
    c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); t = setTimeout(() => setOpen(c, true), 150); });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(t);
      t = setTimeout(() => { if (!c.pinned) setOpen(c, false); }, 350);
    });
  });
  const fromHash = () => {
    const id = { '#report': 'country', '#sponsor': 'sponsor' }[location.hash] || location.hash.slice(1);
    const c = document.getElementById(`offer-${id}`);
    if (c) { setOpen(c, true); c.pinned = true; c.scrollIntoView({ block: 'center' }); }
  };
  addEventListener('hashchange', fromHash);
  fromHash();
})();
