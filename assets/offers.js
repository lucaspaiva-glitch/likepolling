// Like Polling products, shown as cards on the homepage and /services (any element with [data-offers]).
// Edit OFFERS to add, remove or rename a product; PRICE is shared by every report.
// Computers: resting the mouse on a card opens it (like the sponsor card). Phones: a tap opens it.
(function () {
  'use strict';
  const PRICE = '€8';
  const MAIL = 'lucaspaiva@likepolling.com';
  // buy: Gumroad product link. Empty = the button opens an order email instead.
  const OFFERS = [
    { id: 'country', sym: 'Country', name: 'COUNTRY\nREPORT', sub: 'Everything we saved on a country, next to another.', buy: 'https://lucaspoll.gumroad.com/l/udjsyu', sample: '/samples/country-report.pdf',
      stats: [['41', 'countries'], ['30', 'days of history'], ['2', 'side by side']] },
    { id: 'artist', sym: 'Artist', name: 'ARTIST\nREPORT', sub: 'Everything we saved on an artist, next to similar artists.', buy: 'https://lucaspoll.gumroad.com/l/ijixxs', sample: '/samples/artist-report.pdf',
      stats: [['4', 'artists compared'], ['17', 'languages'], ['30', 'days, day by day']] },
    { id: 'company', sym: 'Company', name: 'COMPANY\nREPORT', sub: 'Everything we saved on a company, next to its rivals.', buy: 'https://lucaspoll.gumroad.com/l/linzh', sample: '/samples/company-report.pdf',
      stats: [['4', 'brands compared'], ['17', 'languages'], ['30', 'days, day by day']] },
    { id: 'sponsor', sym: 'Ad spot', top: 'Launch rate', name: 'YOUR BRAND\nHERE', sub: 'A card on Like Polling, seen in 41 countries.', mail: 'Sponsoring Like Polling',
      stats: [['41', 'countries'], ['2×', 'updated a day'], ['4', 'brands at a time']] },
  ];
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const SAMPLES = 'https://iyhaoagslsrwtkcrxylp.supabase.co/storage/v1/object/public/samples';
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const pdf = (id) => `${SAMPLES}/${lang()}/${id}-report.pdf?download=like-polling-${id}-report.pdf`;
  const roots = document.querySelectorAll('[data-offers]');
  if (!roots.length) return;
  const loc = () => (lang() === 'pt' ? 'pt-BR' : lang());
  const cname = (c) => { try { return new Intl.DisplayNames([loc()], { type: 'region' }).of(c) || c; } catch { return c; } };
  // The buyer's choice is kept in this browser only; /report reads it after they paste their key.
  const saved = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const choiceKey = (id) => `lp_report_choice_${id}`;
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
  // Fill-in-the-blank shown above Buy on each report card.
  const blank = (o) => {
    if (o.id === 'country') {
      const [a, b] = saved.get('lp_report_countries').split(',');
      const opts = (sel) => COUNTRIES.map((c) => [c, cname(c)]).sort((x, y) => x[1].localeCompare(y[1]))
        .map(([c, n]) => `<option value="${c}"${c === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
      return `<p>${tr('Show me')} <select name="c1" aria-label="${esc(tr('Country'))}"><option value="">${esc(tr('a country'))}</option>${opts(COUNTRIES.includes(a) ? a : '')}</select> ${tr('next to')} <select name="c2" aria-label="${esc(tr('Compare with'))}"><option value="">${esc(tr('no other country'))}</option>${opts(COUNTRIES.includes(b) ? b : '')}</select>.</p>`;
    }
    let v = '';
    try { v = JSON.parse(saved.get(choiceKey(o.id)) || '{}').subject || ''; } catch { /* ignore */ }
    const ph = o.id === 'artist' ? 'artist name' : 'company or brand';
    return `<p>${tr('A report on')} <input name="subject" value="${esc(v)}" placeholder="${esc(tr(ph))}" maxlength="120" autocomplete="off" spellcheck="false" required>.</p>`;
  };
  // Buy: the blank must be filled; the answer is saved locally and Gumroad opens.
  function wireForm(c) {
    const f = c.querySelector('.svc-form');
    if (!f) return;
    const id = c.id.replace('offer-', '');
    f.addEventListener('submit', (e) => { e.preventDefault(); c.querySelector('.svc-btn').click(); });
    f.addEventListener('input', (e) => e.target.classList.remove('need'));
    c.querySelector('.svc-btn').addEventListener('click', (e) => {
      const first = f.elements[0];
      if (!first.value.trim()) { e.preventDefault(); first.classList.add('need'); first.focus(); return; }
      if (id === 'country') {
        saved.set('lp_report_countries', [f.elements.c1.value, f.elements.c2.value].filter((x, i, a) => x && a.indexOf(x) === i).join(','));
      } else {
        saved.set(choiceKey(id), JSON.stringify({ subject: first.value.trim().slice(0, 120), peers: [] }));
      }
    });
  }
  const card = (o) => {
    const report = !o.mail;
    const actions = report
      ? `<form class="svc-form" novalidate>${blank(o)}</form><a class="svc-btn" href="${esc(buyLink(o))}">${tr(o.buy ? 'Buy' : 'Order')} · ${PRICE}<span class="lp-local" data-eur="8"></span></a><a class="svc-link" href="${esc(pdf(o.id))}">${tr('Download a free sample (PDF) ›')}</a><p class="svc-fine">${tr('Gathered every day since 24 Oct 2026.')}</p>`
      : `<a class="svc-btn" href="${esc(mailto(o.mail, 'Hi! I\'d like to know about sponsoring Like Polling.\n\nBrand:\nCountries we target:\nWebsite:'))}">${tr('Ask about the ad spot')}</a><p class="svc-fine">${tr('Like the Machu Picchu Energy card. Monthly views and clicks included.')}</p>`;
    const nm = tr(o.name);
    return `<section class="svc" id="offer-${o.id}" data-no-i18n>
      <button type="button" class="svc-tab" aria-expanded="false" aria-controls="offer-${o.id}-body">
        <span class="svc-top"><span class="svc-sym">${esc(tr(o.sym))}</span><span>${esc(o.top ? tr(o.top) : PRICE)}${o.top ? '' : '<span class="lp-local" data-eur="8"></span>'}</span></span>
        <span class="svc-name svc-glitch" data-text="${esc(nm)}">${esc(nm)}</span>
        <span class="svc-bar" aria-hidden="true"></span>
        <span class="svc-sub">${esc(tr(o.sub))}</span>
        <span class="svc-more" aria-hidden="true">${tr(report ? 'What you get' : 'How it works')} <i>›</i></span>
      </button>
      <div class="svc-body" id="offer-${o.id}-body">
        <div class="svc-stats">${o.stats.map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(tr(l))}</span></div>`).join('')}</div>
        ${actions}
      </div>
    </section>`;
  };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let cards = [];
  function draw() {
    roots.forEach((r) => { r.classList.add('svc-grid'); r.innerHTML = OFFERS.map(card).join(''); });
    cards = [...document.querySelectorAll('.svc')];
    cards.forEach(wire);
    cards.forEach(wireForm);
  }
  function setOpen(c, on) {
    c.classList.toggle('open', on);
    c.querySelector('.svc-tab').setAttribute('aria-expanded', String(on));
    if (!on) c.pinned = false;
  }
  function wire(c) {
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
  }
  draw();
  document.addEventListener('lp:lang', draw);
  const fromHash = () => {
    const id = { '#report': 'country', '#sponsor': 'sponsor' }[location.hash] || location.hash.slice(1);
    const c = document.getElementById(`offer-${id}`);
    if (c) { setOpen(c, true); c.pinned = true; c.scrollIntoView({ block: 'center' }); }
  };
  addEventListener('hashchange', fromHash);
  fromHash();
})();
