// Country pulse (/pulse): free, public, plain words. Reads /api/v1/pulse (aggregates only).
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
  const learn = (s) => `<p class="pl-learn"><b>${T('Learn')}</b>${esc(T(s))}</p>`;
  const PLANE = '<svg viewBox="0 0 34 24" aria-hidden="true"><path d="M2 12 L24 9 Q33 9 33 12 Q33 15 24 15 Z" fill="#b0000e"/><path d="M12 10 L18 1 L21 1 L18 10 Z M12 14 L18 23 L21 23 L18 14 Z M3 11 L1 5 L4 5 L7 11 Z" fill="#8e000b"/><circle cx="27" cy="12" r="1.4" fill="#fff"/></svg>';
  let cc = (new URLSearchParams(location.search).get('c') || '').toUpperCase();
  if (!COUNTRIES.includes(cc)) { const r = (navigator.language || '').split('-')[1]; cc = COUNTRIES.includes((r || '').toUpperCase()) ? r.toUpperCase() : 'BR'; }
  let data = null;

  function picker() {
    $('pick').innerHTML = COUNTRIES.map((c) => ({ c, n: cname(c) })).sort((a, b) => a.n.localeCompare(b.n, loc()))
      .map(({ c, n }) => `<button type="button" role="option" data-c="${c}" aria-selected="${c === cc}"><img src="/assets/flags/${c.toLowerCase()}.svg" alt="" onerror="this.remove()">${esc(n)}</button>`).join('');
    const on = $('pick').querySelector('[aria-selected="true"]');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
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
        <div class="pl-bubbles">${s.map((q, i) => `<span class="${i < 3 ? 'hot' : ''}" style="font-size:${(13 + 13 * Math.sqrt((q.traffic || 0) / max)).toFixed(1)}px;animation-delay:${(-i * 0.7).toFixed(1)}s">${esc(q.query)}<small>${esc(T('about {n} searches', { n: num(q.traffic) }))}</small></span>`).join('')}</div>
        ${learn('A search spike shows curiosity, not love. People also search for things they fear or just heard about.')}</section>`);
    }
    const h = d.holidays;
    if (h.length) {
      const days = Math.round((Date.parse(`${h[0].day}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 864e5);
      const when = days <= 0 ? T('today') : days === 1 ? T('tomorrow') : T('in {n} days', { n: days });
      cards.push(`<section class="pl-card pl-hol"><span class="pl-tag">${T('Countdown')}</span><h2>${T('Next holiday')}</h2>
        <div class="pl-count" data-count="${Math.max(0, days)}">${days > 1 ? Math.max(0, days) : esc(when)}<small>${days > 1 ? `${esc(when)} · ` : ''}${dshort(h[0].day)}</small></div>
        <div class="pl-sky"><div class="pl-plane">${PLANE}<i></i><b>${esc(h[0].local_name)}</b></div></div>
        ${h.length > 1 ? `<ul class="pl-next">${h.slice(1).map((x) => `<li><b>${dshort(x.day)}</b>${esc(x.local_name)}</li>`).join('')}</ul>` : ''}
        ${learn('On holidays people shop, travel and go online differently. Plan posts a week or two ahead.')}</section>`);
    }
    if (d.news.articles && d.news.peaceful_pct != null) {
      const p = d.news.peaceful_pct;
      cards.push(`<section class="pl-card"><span class="pl-tag">${T('This week')}</span><h2>${T('News mood')}</h2><p class="note">${esc(T('{n} news articles about {c} this week.', { n: num(d.news.articles), c }))}</p>
        <div class="pl-mood"><div class="pl-ring" style="--to:${p}"><b>${p}%</b></div><p>${esc(T('{n} in 10 news stories about {c} were peaceful: talks, deals, aid.', { n: Math.round(p / 10), c }))}</p></div>
        ${learn('Peaceful doesn\'t mean nothing happened. It means talks, deals and aid outnumbered protests and fights.')}</section>`);
    }
    const w = d.wikipedia;
    if (w.length) {
      const max = w[0].views || 1;
      cards.push(`<section class="pl-card"><span class="pl-tag">Wikipedia</span><h2>${esc(T('What {c} reads on Wikipedia', { c }))}</h2><p class="note">${T('The most-read pages this week.')}</p>
        <ol class="pl-reads">${w.map((x) => `<li><div class="rl"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a><span>${esc(T('{n} views', { n: num(x.views) }))}</span></div><i style="--w:${Math.max(3, (x.views / max) * 100).toFixed(1)}%"></i></li>`).join('')}</ol>
        ${learn('A page that stays in the top 30 for many days shows lasting interest. A one-day jump is usually a moment, not a trend.')}</section>`);
    }
    const g = d.gdp;
    if (g.length > 1) {
      const max = Math.max(...g.map((x) => Math.abs(x.growth_pct))) || 1;
      cards.push(`<section class="pl-card"><span class="pl-tag">${T('Yearly')}</span><h2>${T('The economy')}</h2><p class="note">${T('Growth after inflation, per year. World Bank.')}</p>
        <div class="pl-gdp">${g.map((x) => `<div><b>${x.growth_pct > 0 ? '+' : ''}${x.growth_pct.toLocaleString(loc())}%</b><i class="${x.growth_pct < 0 ? 'neg' : ''}" style="--h:${Math.max(4, (Math.abs(x.growth_pct) / max) * 100).toFixed(0)}%"></i></div>`).join('')}</div>
        <div class="pl-years">${g.map((x) => `<span>${x.year}</span>`).join('')}</div>
        ${learn('GDP is the size of a whole economy, not how rich each person is. For that, look at GDP per person.')}</section>`);
    }
    const L = d.launch;
    if (L) {
      const ms = Date.parse(L.net) - Date.now(), days = Math.floor(ms / 864e5);
      const when = ms < 864e5 ? T('today') : days === 1 ? T('tomorrow') : T('in {n} days', { n: days });
      const t = new Date(L.net).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      cards.push(`<section class="pl-card pl-launch"><span class="pl-tag">${T('Space')}</span><h2>${T(L.here ? 'Next rocket launch' : 'Next launch in the world')}</h2>
        <div class="pl-rk" aria-hidden="true"><svg viewBox="0 0 24 48"><path d="M12 1 C18 8 18 22 16 32 L8 32 C6 22 6 8 12 1 Z" fill="#fff" stroke="#b0000e" stroke-width="1.6"/><circle cx="12" cy="14" r="2.6" fill="#b0000e"/><path d="M8 26 L3 36 L8 33 Z M16 26 L21 36 L16 33 Z" fill="#b0000e"/><path class="fl" d="M9 33 Q12 46 15 33 Z" fill="#ff3b30"/></svg></div>
        <div class="pl-count pl-lc">${days > 1 ? days : esc(when)}<small>${days > 1 ? `${esc(when)} · ` : ''}${esc(t)}</small></div>
        <p class="pl-lname" data-no-i18n><b>${esc(L.name)}</b>${esc([L.provider, L.site].filter(Boolean).join(' · '))}</p>
        ${learn('Launch dates often move. A rocket waits for good weather and a final check, so the countdown can change.')}</section>`);
    }
    const B = d.books || [];
    if (B.length) {
      cards.push(`<section class="pl-card"><span class="pl-tag">${T('Books')}</span><h2>${T('What the world is reading')}</h2><p class="note">${T('Books trending on Open Library this week, worldwide.')}</p>
        <ol class="pl-books" data-no-i18n>${B.map((b) => `<li><a href="${esc(b.link)}" target="_blank" rel="noopener">${b.cover_id ? `<img src="https://covers.openlibrary.org/b/id/${b.cover_id}-S.jpg" alt="" loading="lazy">` : '<i></i>'}<span><b>${esc(b.title)}</b>${b.author ? esc(b.author) : ''}</span></a></li>`).join('')}</ol>
        ${learn('A trending book is one many people opened or saved this week. It shows curiosity, not sales.')}</section>`);
    }
    const ticker = s.length ? `<div class="pl-ticker" aria-hidden="true"><div>${[...s, ...s].map((q) => `<span><b>${esc(c)}</b>${esc(q.query)}</span>`).join('')}</div></div>` : '';
    $('pulse').innerHTML = cards.length
      ? `${ticker}<button type="button" class="pl-share" id="share">${T('Share')} ↗</button><div class="pl-grid">${cards.join('')}</div>`
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
    const sh = $('share');
    if (sh) sh.addEventListener('click', async () => {
      const url = `${location.origin}/pulse?c=${d.country}`;
      try { if (navigator.share) await navigator.share({ title: `${T('Country pulse')} · ${c}`, url }); else { await navigator.clipboard.writeText(url); sh.textContent = T('Link copied'); } } catch {}
    });
    document.title = `${c} · ${T('Country pulse')} · Like Polling`;
  }

  function load() {
    $('pulse').innerHTML = `<p class="muted">${T('Loading…')}</p>`;
    fetch(`/api/v1/pulse?country=${cc}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { data = j; render(); })
      .catch(() => { $('pulse').innerHTML = `<p class="muted">${T('No data for this yet.')}</p>`; });
  }
  document.addEventListener('lp:lang', () => { picker(); if (data) render(); });
  picker();
  load();
})();
