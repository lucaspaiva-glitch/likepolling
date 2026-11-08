// Free pulses (/pulse): Country (/api/v1/pulse) and Artist / Company (/api/v1/entity). Plain words, aggregates only.
(function () {
  'use strict';
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const $ = (id) => document.getElementById(id);
  const I = () => window.LP_I18N;
  const T = (s, v = {}) => (I() ? I().t(s) : s).replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : v[k]));
  const loc = () => (I() ? I().locale() : 'en');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString(loc());
  const cname = (c) => { try { return new Intl.DisplayNames([loc()], { type: 'region' }).of(c) || c; } catch { return c; } };
  const dshort = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const PLANE = '<svg viewBox="0 0 34 24" aria-hidden="true"><path d="M2 12 L24 9 Q33 9 33 12 Q33 15 24 15 Z" fill="#b0000e"/><path d="M12 10 L18 1 L21 1 L18 10 Z M12 14 L18 23 L21 23 L18 14 Z M3 11 L1 5 L4 5 L7 11 Z" fill="#8e000b"/><circle cx="27" cy="12" r="1.4" fill="#fff"/></svg>';
  const qs = new URLSearchParams(location.search);
  const SAMPLE = { artist: 'Anitta (singer)', company: 'Nike, Inc.' };
  let mode = qs.get('artist') != null ? 'artist' : qs.get('company') != null ? 'company' : 'country';
  let who = { artist: qs.get('artist') || SAMPLE.artist, company: qs.get('company') || SAMPLE.company };
  let cc = (qs.get('c') || '').toUpperCase();
  if (!COUNTRIES.includes(cc)) { const r = (navigator.language || '').split('-')[1]; cc = COUNTRIES.includes((r || '').toUpperCase()) ? r.toUpperCase() : 'BR'; }
  let data = null;

  function picker() {
    $('pick').innerHTML = COUNTRIES.map((c) => ({ c, n: cname(c) })).sort((a, b) => a.n.localeCompare(b.n, loc()))
      .map(({ c, n }) => `<button type="button" role="option" data-c="${c}" aria-selected="${c === cc}"><img src="/assets/flags/${c.toLowerCase()}.svg" alt="" onerror="this.remove()">${esc(n)}</button>`).join('');
    const on = $('pick').querySelector('[aria-selected="true"]');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  const HEAD = {
    country: ['Country pulse', 'What a country searches, reads, celebrates and feels. Free, updated every day.', 'Everything we have saved on this country, in one Extended report. €8.'],
    artist: ['Artist pulse', 'Who is looking up an artist this week, and where. Free, updated every day.', 'Everything we have saved on this artist, in one Extended report. €8.'],
    company: ['Company pulse', 'Who is looking up a company or brand this week, and where. Free, updated every day.', 'Everything we have saved on this company, in one Extended report. €8.'],
  };
  function setMode(m, push) {
    mode = m;
    $('pl-h').textContent = HEAD[m][0]; $('pl-lead').textContent = HEAD[m][1]; $('cta-t').textContent = HEAD[m][2];
    $('cta-b').href = `/services#${m}`;
    $('modes').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === m)));
    $('pick').hidden = m !== 'country'; $('find').hidden = m === 'country';
    if (m !== 'country') { $('q').value = who[m]; $('q').placeholder = T(m === 'artist' ? 'Type an artist' : 'Type a company or brand'); }
    if (push) history.replaceState(null, '', m === 'country' ? `?c=${cc}` : `?${m}=${encodeURIComponent(who[m])}`);
  }
  $('modes').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b && b.dataset.m !== mode) { setMode(b.dataset.m, true); load(); } });
  let sugT = 0;
  $('q').addEventListener('input', () => {
    clearTimeout(sugT);
    const v = $('q').value.trim();
    if (v.length < 2) return;
    sugT = setTimeout(() => fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&format=json&namespace=0&limit=8&origin=*&search=${encodeURIComponent(v)}`)
      .then((r) => r.json()).then((j) => { $('q-sug').innerHTML = (j[1] || []).map((t) => `<option value="${esc(t)}">`).join(''); }).catch(() => {}), 250);
  });
  $('find').addEventListener('submit', (e) => { e.preventDefault(); const v = $('q').value.trim(); if (!v) return; who[mode] = v; setMode(mode, true); load(); });
  $('pick').setAttribute('data-no-i18n', '');
  $('pulse').setAttribute('data-no-i18n', '');
  $('pick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b || b.dataset.c === cc) return;
    cc = b.dataset.c;
    history.replaceState(null, '', `?c=${cc}`);
    picker();
    load();
  });

  function render() {
    const d = data, c = cname(d.country);
    const cards = [];
    const s = d.searches.top;
    if (s.length) {
      const max = s[0].traffic || 1;
      cards.push(`<section class="pl-card wide"><span class="pl-tag">${T('This week')}</span><h2>${esc(T('What {c} is searching', { c }))}</h2>
        <p class="note">${esc(T('Searches that suddenly grew on Google this week. Bigger bubble, more searches.'))}</p>
        <div class="pl-bubbles">${s.map((q, i) => `<span class="${i < 3 ? 'hot' : ''}" style="font-size:${(13 + 13 * Math.sqrt((q.traffic || 0) / max)).toFixed(1)}px;animation-delay:${(-i * 0.7).toFixed(1)}s">${esc(q.query)}<small>${esc(T('about {n} searches', { n: num(q.traffic) }))}</small></span>`).join('')}</div></section>`);
    }
    const h = d.holidays;
    if (h.length) {
      const days = Math.round((Date.parse(`${h[0].day}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 864e5);
      const when = days <= 0 ? T('today') : days === 1 ? T('tomorrow') : T('in {n} days', { n: days });
      cards.push(`<section class="pl-card pl-hol"><span class="pl-tag">${T('Countdown')}</span><h2>${T('Next holiday')}</h2>
        <div class="pl-count" data-count="${Math.max(0, days)}">${days > 1 ? Math.max(0, days) : esc(when)}<small>${days > 1 ? `${esc(when)} · ` : ''}${dshort(h[0].day)}</small></div>
        <div class="pl-sky"><div class="pl-plane">${PLANE}<i></i><b>${esc(h[0].local_name)}</b></div></div>
        ${h.length > 1 ? `<ul class="pl-next">${h.slice(1).map((x) => `<li><b>${dshort(x.day)}</b>${esc(x.local_name)}</li>`).join('')}</ul>` : ''}</section>`);
    }
    if (d.news.articles && d.news.peaceful_pct != null) {
      const p = d.news.peaceful_pct;
      cards.push(`<section class="pl-card"><span class="pl-tag">${T('This week')}</span><h2>${T('News mood')}</h2><p class="note">${esc(T('{n} news articles about {c} this week.', { n: num(d.news.articles), c }))}</p>
        <div class="pl-mood"><div class="pl-ring" style="--to:${p}"><b>${p}%</b></div><p>${esc(T('{n} in 10 news stories about {c} were peaceful: talks, deals, aid.', { n: Math.round(p / 10), c }))}</p></div></section>`);
    }
    const w = d.wikipedia;
    if (w.length) {
      const max = w[0].views || 1;
      cards.push(`<section class="pl-card"><span class="pl-tag">Wikipedia</span><h2>${esc(T('What {c} reads on Wikipedia', { c }))}</h2><p class="note">${T('The most-read pages this week.')}</p>
        <ol class="pl-reads">${w.map((x) => `<li><div class="rl"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a><span>${esc(T('{n} views', { n: num(x.views) }))}</span></div><i style="--w:${Math.max(3, (x.views / max) * 100).toFixed(1)}%"></i></li>`).join('')}</ol></section>`);
    }
    const g = d.gdp;
    if (g.length > 1) {
      const max = Math.max(...g.map((x) => Math.abs(x.growth_pct))) || 1;
      cards.push(`<section class="pl-card"><span class="pl-tag">${T('Yearly')}</span><h2>${T('The economy')}</h2><p class="note">${T('Growth after inflation, per year. World Bank.')}</p>
        <div class="pl-gdp">${g.map((x) => `<div><b>${x.growth_pct > 0 ? '+' : ''}${x.growth_pct.toLocaleString(loc())}%</b><i class="${x.growth_pct < 0 ? 'neg' : ''}" style="--h:${Math.max(4, (Math.abs(x.growth_pct) / max) * 100).toFixed(0)}%"></i></div>`).join('')}</div>
        <div class="pl-years">${g.map((x) => `<span>${x.year}</span>`).join('')}</div></section>`);
    }
    const L = d.launch;
    if (L) {
      const ms = Date.parse(L.net) - Date.now(), days = Math.floor(ms / 864e5);
      const when = ms < 864e5 ? T('today') : days === 1 ? T('tomorrow') : T('in {n} days', { n: days });
      const t = new Date(L.net).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      cards.push(`<section class="pl-card pl-launch"><span class="pl-tag">${T('Space')}</span><h2>${T(L.here ? 'Next rocket launch' : 'Next launch in the world')}</h2>
        <div class="pl-rk" aria-hidden="true"><svg viewBox="0 0 24 48"><path d="M12 1 C18 8 18 22 16 32 L8 32 C6 22 6 8 12 1 Z" fill="#fff" stroke="#b0000e" stroke-width="1.6"/><circle cx="12" cy="14" r="2.6" fill="#b0000e"/><path d="M8 26 L3 36 L8 33 Z M16 26 L21 36 L16 33 Z" fill="#b0000e"/><path class="fl" d="M9 33 Q12 46 15 33 Z" fill="#ff3b30"/></svg></div>
        <div class="pl-count pl-lc">${days > 1 ? days : esc(when)}<small>${days > 1 ? `${esc(when)} · ` : ''}${esc(t)}</small></div>
        <p class="pl-lname" data-no-i18n><b>${esc(L.name)}</b>${esc([L.provider, L.site].filter(Boolean).join(' · '))}</p></section>`);
    }
    const B = d.books || [];
    if (B.length) {
      cards.push(`<section class="pl-card"><span class="pl-tag">${T('Books')}</span><h2>${T('What the world is reading')}</h2><p class="note">${T('Books trending on Open Library this week, worldwide.')}</p>
        <ol class="pl-books" data-no-i18n>${B.map((b) => `<li><a href="${esc(b.link)}" target="_blank" rel="noopener">${b.cover_id ? `<img src="https://covers.openlibrary.org/b/id/${b.cover_id}-S.jpg" alt="" loading="lazy">` : '<i></i>'}<span><b>${esc(b.title)}</b>${b.author ? esc(b.author) : ''}</span></a></li>`).join('')}</ol></section>`);
    }
    const ticker = s.length ? `<div class="pl-ticker" aria-hidden="true"><div>${[...s, ...s].map((q) => `<span><b>${esc(c)}</b>${esc(q.query)}</span>`).join('')}</div></div>` : '';
    $('pulse').innerHTML = cards.length
      ? `${ticker}${tools()}<div class="pl-grid">${cards.join('')}</div>`
      : `<p class="muted">${T('No data for this yet.')}</p>`;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 }) : null;
    document.querySelectorAll('.pl-card').forEach((el, i) => { if (io) { el.style.transitionDelay = `${(i % 2) * 0.08}s`; io.observe(el); } else el.classList.add('in'); });
    const cnt = document.querySelector('.pl-count[data-count]');
    const n = cnt ? Number(cnt.dataset.count) : 0;
    if (cnt && n > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const small = cnt.querySelector('small').outerHTML, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 900); cnt.innerHTML = Math.round(n * k) + small; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    wireTools(`${T('Country pulse')} · ${c}`);
    document.title = `${c} · ${T('Country pulse')} · Like Polling`;
  }

  const tools = () => `<div class="pl-tools"><button type="button" class="pl-share" id="share">${T('Share')} ↗</button><button type="button" class="pl-share" id="pdf">${T('Save as PDF')}</button></div>`;
  function wireTools(title) {
    const sh = $('share');
    sh.addEventListener('click', async () => {
      try { if (navigator.share) await navigator.share({ title, url: location.href }); else { await navigator.clipboard.writeText(location.href); sh.textContent = T('Link copied'); } } catch {}
    });
    $('pdf').addEventListener('click', () => { document.querySelectorAll('.pl-card').forEach((el) => el.classList.add('in')); window.print(); });
  }
  const fl = (c) => `<img src="/assets/flags/${c.toLowerCase()}.svg" alt="" onerror="this.remove()">`;
  function renderEntity(d) {
    const s = d.subject, v = d.views, cards = [];
    cards.push(`<section class="pl-card wide pl-ent">${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : ''}<div><h2 data-no-i18n>${esc(s.title)}</h2>
      <p class="note" data-no-i18n>${esc(s.description)}</p><p class="pl-ent-k"><b>${num(s.languages)}</b> ${esc(T('Wikipedia languages'))} · <a href="${esc(s.link)}" target="_blank" rel="noopener">Wikipedia ↗</a></p></div></section>`);
    const days = v.days || [], max = Math.max(1, ...days.map((x) => x.views));
    const ch = v.change_pct;
    cards.push(`<section class="pl-card"><span class="pl-tag">${T('This week')}</span><h2>${T('Wikipedia views')}</h2>
      <div class="pl-count">${num(v.week)}${ch != null ? `<small class="${ch < 0 ? 'down' : 'up'}">${ch > 0 ? '+' : ''}${ch}% ${esc(T('vs last week'))}</small>` : ''}</div>
      <div class="pl-gdp pl-wk">${days.map((x) => `<div><i style="--h:${Math.max(4, (x.views / max) * 100).toFixed(0)}%"></i></div>`).join('')}</div>
      <div class="pl-years">${days.map((x) => `<span>${new Date(`${x.day}T00:00:00Z`).toLocaleDateString(loc(), { weekday: 'narrow', timeZone: 'UTC' })}</span>`).join('')}</div></section>`);
    const C = d.countries || [];
    cards.push(`<section class="pl-card"><span class="pl-tag">${T('This week')}</span><h2>${T('Where it\'s popular')}</h2>
      ${C.length ? `<ul class="pl-where">${C.map((x) => `<li>${fl(x.country)}<b>${esc(cname(x.country))}</b><span>${[x.read_days ? esc(T('top reads {n}d', { n: x.read_days })) : '', x.search_days ? esc(T('searched {n}d', { n: x.search_days })) : ''].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>`
        : `<p class="note">${esc(T('Not in any country\'s top reads or searches this week.'))}</p>`}</section>`);
    const Q = d.searches || [];
    if (Q.length) {
      const m = Q[0].traffic || 1;
      cards.push(`<section class="pl-card wide"><span class="pl-tag">${T('This week')}</span><h2>${T('What people searched')}</h2>
        <div class="pl-bubbles">${Q.map((q, i) => `<span class="${i < 2 ? 'hot' : ''}" style="font-size:${(13 + 11 * Math.sqrt((q.traffic || 0) / m)).toFixed(1)}px">${esc(q.query)}<small>${esc(T('about {n} searches', { n: num(q.traffic) }))}</small></span>`).join('')}</div></section>`);
    }
    $('pulse').innerHTML = `${tools()}<div class="pl-grid">${cards.join('')}</div>`;
    document.querySelectorAll('.pl-card').forEach((el) => el.classList.add('in'));
    wireTools(`${T(HEAD[mode][0])} · ${s.title}`);
    document.title = `${s.title} · ${T(HEAD[mode][0])} · Like Polling`;
  }

  function load() {
    if (mode !== 'country') {
      $('pulse').innerHTML = `<p class="muted">${T('Loading…')}</p>`;
      const m = mode;
      return fetch(`/api/v1/entity?type=${m}&title=${encodeURIComponent(who[m])}`).then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(j.error))))
        .then((j) => { if (mode === m) { data = j; renderEntity(j); } })
        .catch((err) => { if (mode === m) $('pulse').innerHTML = `<p class="muted">${esc(typeof err === 'string' ? err : T('No data for this yet.'))}</p>`; });
    }
    $('pulse').innerHTML = `<p class="muted">${T('Loading…')}</p>`;
    fetch(`/api/v1/pulse?country=${cc}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { if (mode === 'country') { data = j; render(); } })
      .catch(() => { $('pulse').innerHTML = `<p class="muted">${T('No data for this yet.')}</p>`; });
  }
  document.addEventListener('lp:lang', () => { picker(); setMode(mode); if (data) (data.subject ? renderEntity(data) : render()); });
  picker();
  setMode(mode);
  load();
})();
