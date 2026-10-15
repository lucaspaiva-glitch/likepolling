// Creator News Wire widget. Standalone: mount with
//   <section id="news-wire" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/news-wire-widget.js" defer></script>
// Reads public.news_wire (filled hourly by scripts/news-wire-routine.js) with the
// publishable key, in the site language from assets/i18n.js (English without it),
// and shows the creator-economy headlines as a bento grid of vertical story cards
// (top story + 4) and a swipeable reel for the rest. Each card shows the article's
// own preview image with a slow pan-and-zoom while on screen, or an animated red
// card when the article has none. Falls back to English headlines for a language
// with none yet, and hides itself if no data loads.
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

  const BENTO = 5;
  const REEL_PAGE = 10;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const cache = {};
  const rankUrl = `${base}/rest/v1/youtube_trending?select=country_code,rank,channel_id,channel_title`;
  let ranking = null;
  let token = 0;

  async function load(lang) {
    if (!cache[lang]) {
      const res = await fetch(`${base}/rest/v1/news_wire?select=*&lang=eq.${encodeURIComponent(lang)}&category=eq.creators&order=published_at.desc&limit=200`, { headers });
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

  // Channel names we already chart (Trending + Music Index). "Search channel"
  // only appears when a headline names one of them as a whole word.
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const known = Promise.all(['youtube_trending', 'youtube_music_chart'].map((t) =>
    fetch(`${base}/rest/v1/${t}?select=channel_title`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => [])))
    .then((lists) => {
      const names = new Set();
      for (const r of lists.flat()) {
        const n = String(r.channel_title || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/, '').trim();
        if ([...n].length >= 4 && !/^youtube/i.test(n)) names.add(n);
      }
      return [...names].map((name) => ({ name, re: new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(name)}(?![\\p{L}\\p{N}])`, 'iu') }));
    })
    .catch(() => []);
  let channels = [];
  const channelIn = (title) => channels.reduce((best, c) => (c.name.length > (best ? best.length : 0) && c.re.test(title) ? c.name : best), null);

  const ICON = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  mount.className = 'nw';
  mount.setAttribute('aria-label', 'Creator economy news');
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
    <div class="nw-bento" data-no-i18n></div>
    <div class="nw-reel-wrap" hidden>
      <div class="nw-reel-head">
        <h3 class="nw-rank-title">More stories</h3>
        <span class="nw-spacer"></span>
        <button type="button" class="nw-nav" data-dir="-1" data-no-i18n>‹</button>
        <button type="button" class="nw-nav" data-dir="1" data-no-i18n>›</button>
      </div>
      <div class="nw-reel" data-no-i18n></div>
    </div>
    <div class="nw-foot">Latest creator-economy headlines from Google News in the selected language. Photos are each article's own preview image. Refreshed hourly.</div>`;
  const bento = mount.querySelector('.nw-bento');
  const reelWrap = mount.querySelector('.nw-reel-wrap');
  const reel = mount.querySelector('.nw-reel');
  const asof = mount.querySelector('.nw-asof');
  let view = null;
  let reelShown = 0;

  function cardHtml(r, lang, i, kind) {
    const link = /^https:\/\//.test(r.link) ? esc(r.link) : '#';
    const img = /^https:\/\//.test(r.image_url || '') ? esc(r.image_url) : '';
    const src = String(r.source || 'Google News').trim();
    const initial = esc(([...src][0] || 'N').toUpperCase());
    const ch = channelIn(r.title);
    return `
      <article class="nw-card nw-${kind} nw-in${img ? '' : ' nw-noimg'}" style="animation-delay:${(i % REEL_PAGE) * 45}ms">
        <div class="nw-media" aria-hidden="true">
          ${img ? `<img class="nw-img nw-kb${i % 4}" src="${img}" alt="" loading="${kind === 'reel' ? 'lazy' : 'eager'}" decoding="async" referrerpolicy="no-referrer">` : ''}
          <div class="nw-art"><span>${initial}</span></div>
        </div>
        <div class="nw-shade" aria-hidden="true"></div>
        <div class="nw-top">
          <span class="nw-badge">${esc(tr(kind === 'hero' ? 'Top story' : 'Creator wire'))}</span>
          <span class="nw-age">${esc(ago(r.published_at, lang))}</span>
        </div>
        <div class="nw-low">
          <div class="nw-bottom">
            <div class="nw-pub"><span class="nw-mono" aria-hidden="true">${initial}</span><span class="nw-src">${esc(src)}</span></div>
            <a class="nw-hl" href="${link}" target="_blank" rel="noopener">${esc(r.title)}</a>
            <a class="nw-read" href="${link}" target="_blank" rel="noopener" tabindex="-1">${esc(tr('Read story'))} ↗</a>
          </div>
          <div class="nw-rail">
            <button type="button" class="nw-act nw-pp" aria-pressed="false" aria-label="${esc(tr('Pause motion'))}" title="${esc(tr('Pause motion'))}">${ICON.pause}</button>
            ${ch ? `<span class="nw-actw"><button type="button" class="nw-act nw-find" data-q="${esc(ch)}" aria-label="${esc(`${tr('Search channel')}: ${ch}`)}" title="${esc(`${tr('Search channel')}: ${ch}`)}">${ICON.search}</button><span class="nw-act-l">${esc(ch)}</span></span>` : ''}
            <a class="nw-act" href="${link}" target="_blank" rel="noopener" aria-label="${esc(tr('Open source'))}" title="${esc(tr('Open source'))}">${ICON.open}</a>
          </div>
        </div>
      </article>`;
  }

  // Pan-and-zoom runs only while a card is on screen.
  const motion = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('nw-on', e.isIntersecting)), { threshold: 0.25 })
    : null;
  const watch = (root) => root.querySelectorAll('.nw-card:not([data-w])').forEach((c) => {
    c.dataset.w = '1';
    if (motion) motion.observe(c); else c.classList.add('nw-on');
  });

  function moreReel() {
    if (!view || reelShown >= view.items.length) return;
    const from = reelShown;
    reelShown = Math.min(view.items.length, reelShown + REEL_PAGE);
    reel.insertAdjacentHTML('beforeend', view.items.slice(from, reelShown).map((r, i) => cardHtml(r, view.lang, from + i, 'reel')).join(''));
    watch(reel);
  }
  reel.addEventListener('scroll', () => {
    if (reel.scrollLeft + reel.clientWidth > reel.scrollWidth - 600) moreReel();
  }, { passive: true });
  mount.querySelectorAll('.nw-nav').forEach((b) => b.addEventListener('click', () => {
    reel.scrollBy({ left: Number(b.dataset.dir) * reel.clientWidth * 0.8, behavior: 'smooth' });
  }));

  function setPaused(card, paused) {
    card.classList.toggle('nw-paused', paused);
    const b = card.querySelector('.nw-pp');
    const label = tr(paused ? 'Play motion' : 'Pause motion');
    b.setAttribute('aria-pressed', String(paused));
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = paused ? ICON.play : ICON.pause;
  }

  function searchChannel(name) {
    const input = document.getElementById('input-a');
    if (!input) return;
    const form = document.getElementById('search-form');
    const other = document.getElementById('input-b');
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    input.focus({ preventScroll: true });
    if (form && form.requestSubmit && (!other || !other.offsetParent || other.value.trim())) form.requestSubmit();
  }

  mount.addEventListener('click', (ev) => {
    const card = ev.target.closest('.nw-card');
    if (!card) return;
    const find = ev.target.closest('.nw-find');
    if (find) { searchChannel(find.dataset.q); return; }
    if (ev.target.closest('a')) return;
    setPaused(card, !card.classList.contains('nw-paused'));
  });
  mount.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!img.classList || !img.classList.contains('nw-img')) return;
    img.closest('.nw-card').classList.add('nw-noimg');
    img.remove();
  }, true);

  async function render() {
    const mine = ++token;
    const lang = siteLang();
    try {
      let rows = await load(lang);
      if (!rows.length && lang !== 'en') rows = await load('en');
      channels = await known;
      if (mine !== token) return;
      if (!rows.length) throw new Error('no data');
      mount.hidden = false;
      view = { items: rows, lang };
      bento.innerHTML = rows.slice(0, BENTO).map((r, i) => cardHtml(r, lang, i, i ? 'tile' : 'hero')).join('');
      bento.dataset.n = String(Math.min(rows.length, BENTO));
      reel.innerHTML = '';
      reel.scrollLeft = 0;
      reelShown = BENTO;
      reelWrap.hidden = rows.length <= BENTO;
      mount.querySelectorAll('.nw-nav').forEach((b) => b.setAttribute('aria-label', tr(b.dataset.dir === '1' ? 'Next' : 'Previous')));
      moreReel();
      watch(bento);
      asof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
    } catch (err) {
      if (mine !== token) return;
      if (err.message !== 'no data') console.error('News wire widget:', err);
      view = null;
      if (!Object.values(cache).some((r) => r.length)) { mount.hidden = true; return; }
      bento.innerHTML = `<p class="nw-empty">${esc(tr('News is unavailable right now.'))}</p>`;
      reelWrap.hidden = true;
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
  document.addEventListener('lp:lang', () => { render(); renderRanking(); });
  render();
})();
