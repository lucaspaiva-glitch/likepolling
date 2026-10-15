// Creator News Wire widget. Standalone: mount with
//   <section id="news-wire" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/news-wire-widget.js" defer></script>
// Reads public.news_wire (filled hourly by scripts/news-wire-routine.js) with the
// publishable key, in the site language from assets/i18n.js (English without it).
// UI text is English; i18n.js translates it. More headlines appear as the visitor
// scrolls (no button). Falls back to English headlines for a language with none yet,
// and hides itself if no data loads.
(function () {
  'use strict';
  const mount = document.getElementById('news-wire');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/news-wire-widget.css';
  document.head.appendChild(css);

  const PAGE = 12;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const cache = {};
  const rankUrl = `${base}/rest/v1/youtube_trending?select=country_code,rank,channel_id,channel_title`;
  let ranking = null;
  let shown = PAGE;
  let token = 0;

  async function load(lang) {
    if (!cache[lang]) {
      const res = await fetch(`${base}/rest/v1/news_wire?select=category,title,source,link,published_at,fetched_at&lang=eq.${encodeURIComponent(lang)}&order=published_at.desc&limit=200`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache[lang] = await res.json();
    }
    return cache[lang];
  }

  function ago(iso, lang) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    const rtf = new Intl.RelativeTimeFormat(lang === 'pt' ? 'pt-BR' : lang, { numeric: 'always', style: lang === 'pt-PT' ? 'short' : 'narrow' });
    if (mins < 60) return rtf.format(-Math.max(1, mins), 'minute');
    if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  }

  mount.className = 'nw';
  mount.setAttribute('aria-label', 'YouTube and creator news');
  mount.innerHTML = `
    <div class="nw-head">
      <h2 class="nw-title">Creator News Wire</h2>
      <span class="nw-sym">YT·WIRE</span>
      <span class="nw-spacer"></span>
      <span class="nw-asof"></span>
    </div>
    <div class="nw-rank" hidden>
      <h3 class="nw-rank-title">Trending in the most countries</h3>
      <ol class="nw-rank-list" data-no-i18n></ol>
      <p class="nw-rank-note">Channels that appear in the most countries' YouTube Trending top 10 right now, out of all the countries we track. Brands and studios are included alongside creators. Ties go to the higher average chart position. Refreshed hourly.</p>
    </div>
    <h3 class="nw-sub">Creator economy</h3>
    <ol class="nw-list" data-no-i18n></ol>
    <div class="nw-sentinel" aria-hidden="true"></div>
    <div class="nw-foot">Latest headlines from Google News in the selected language. Refreshed hourly.</div>`;
  const list = mount.querySelector('.nw-list');
  const sentinel = mount.querySelector('.nw-sentinel');
  const asof = mount.querySelector('.nw-asof');
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  let view = null;

  function rowHtml(r, lang, i) {
    const link = /^https:\/\//.test(r.link) ? esc(r.link) : '#';
    return `
        <li class="nw-item nw-in" style="animation-delay:${Math.min(i, 11) * 35}ms">
          <a href="${link}" target="_blank" rel="noopener">
            <span class="nw-time">${esc(ago(r.published_at, lang))}</span>
            <span class="nw-text">
              <span class="nw-hl">${esc(r.title)}</span>
              <span class="nw-meta"><span class="nw-src">${esc(r.source || 'Google News')}</span></span>
            </span>
          </a>
        </li>`;
  }

  // Reveals the next page when the sentinel nears the viewport; repeats while it stays in view.
  function showMore() {
    if (!view || shown >= view.items.length) return;
    const from = shown;
    shown += PAGE;
    list.insertAdjacentHTML('beforeend', view.items.slice(from, shown).map((r, i) => rowHtml(r, view.lang, i)).join(''));
    requestAnimationFrame(() => { if (sentinel.getBoundingClientRect().top < innerHeight + 400) showMore(); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) showMore(); }, { rootMargin: '0px 0px 400px 0px' }).observe(sentinel);
  } else {
    shown = Infinity;
  }

  async function render() {
    const mine = ++token;
    const lang = siteLang();
    try {
      const creators = (rs) => rs.filter((r) => r.category === 'creators');
      let rows = creators(await load(lang));
      if (!rows.length && lang !== 'en') rows = creators(await load('en'));
      if (mine !== token) return;
      if (!rows.length) throw new Error('no data');
      mount.hidden = false;
      const items = rows;
      view = { items, lang };
      list.innerHTML = items.length ? items.slice(0, shown).map((r, i) => rowHtml(r, lang, i)).join('') : `<li class="nw-empty">${esc(tr('No headlines in this filter yet.'))}</li>`;
      asof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
      requestAnimationFrame(() => { if (sentinel.getBoundingClientRect().top < innerHeight + 400) showMore(); });
    } catch (err) {
      if (mine !== token) return;
      if (err.message !== 'no data') console.error('News wire widget:', err);
      view = null;
      if (!Object.values(cache).some((r) => r.length)) { mount.hidden = true; return; }
      list.innerHTML = `<li class="nw-empty">${esc(tr('News is unavailable right now.'))}</li>`;
    }
  }

  // "Trending in the most countries": channels counted by how many countries'
  // YouTube Trending top 10 (public.youtube_trending) they appear in right now.
  // Ties: better average chart position, then name.
  const rankBox = mount.querySelector('.nw-rank');
  const rankList = mount.querySelector('.nw-rank-list');
  const flagImg = (code, names) => `<img src="/assets/flags/${code.toLowerCase()}.svg" alt="" width="16" height="12" loading="lazy" title="${esc(names ? names.of(code) : code)}">`;

  async function loadRanking() {
    const res = await fetch(rankUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const total = new Set(rows.map((r) => r.country_code)).size;
    const byChannel = new Map();
    for (const r of rows) {
      if (!/^[A-Z]{2}$/.test(r.country_code)) continue;
      const c = byChannel.get(r.channel_id) || { id: r.channel_id, name: r.channel_title, best: new Map() };
      const prev = c.best.get(r.country_code);
      if (prev == null || r.rank < prev) c.best.set(r.country_code, r.rank);
      byChannel.set(r.channel_id, c);
    }
    const list = [...byChannel.values()]
      .map((c) => ({ ...c, n: c.best.size, avg: [...c.best.values()].reduce((a, b) => a + b, 0) / c.best.size, codes: [...c.best.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k) }))
      .filter((c) => c.n >= 2)
      .sort((a, b) => b.n - a.n || a.avg - b.avg || a.name.localeCompare(b.name))
      .slice(0, 10);
    return { total, list };
  }

  function renderRanking() {
    if (!ranking || !ranking.list.length) { rankBox.hidden = true; return; }
    const lang = siteLang();
    let names = null;
    try { names = new Intl.DisplayNames([lang === 'pt' ? 'pt-BR' : lang], { type: 'region' }); } catch (e) { /* codes only */ }
    const MAXF = 6;
    rankList.innerHTML = ranking.list.map((c, i) => `
        <li><a href="https://www.youtube.com/channel/${encodeURIComponent(c.id)}" target="_blank" rel="noopener">
          <span class="nw-rk">${String(i + 1).padStart(2, '0')}</span>
          <span class="nw-rbody">
            <span class="nw-rname">${esc(c.name)}</span>
            <span class="nw-rflags">${c.codes.slice(0, MAXF).map((k) => flagImg(k, names)).join('')}${c.n > MAXF ? `<span class="nw-rmore">+${c.n - MAXF}</span>` : ''}</span>
          </span>
          <span class="nw-rcount"><b>${c.n}</b>/${ranking.total} <span>${esc(tr('countries'))}</span></span>
          <span class="nw-rbar" style="width:${(100 * c.n / ranking.total).toFixed(1)}%"></span>
        </a></li>`).join('');
    rankBox.hidden = false;
  }

  loadRanking().then((r) => { ranking = r; renderRanking(); }).catch((err) => console.error('News wire ranking:', err));
  document.addEventListener('lp:lang', () => { shown = PAGE; render(); renderRanking(); });
  render();
})();
