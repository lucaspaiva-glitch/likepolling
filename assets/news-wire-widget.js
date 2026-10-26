// Creator News Wire widget. Standalone: mount with
//   <section id="news-wire" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/news-wire-widget.js" defer></script>
// Reads public.news_wire (filled hourly by scripts/news-wire-routine.js) with the
// publishable key, in the site language from assets/i18n.js (English without it),
// and shows the creator-economy headlines as an endless vertical feed of full-size
// story cards that snaps to one story at a time, like Shorts. Each card shows the article's
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
  if (!document.querySelector('link[href="/assets/news-wire-widget.css"]')) document.head.appendChild(css);

  const FEED_PAGE = 8;
  // British English reads the English Shorts, Creator News and headline translations.
  const dataLang = (l) => (l === 'en-GB' ? 'en' : l);
  const LANGS = ['en', 'en-GB', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
  const FLAG = { en: 'us', 'en-GB': 'gb', pt: 'br', 'pt-PT': 'pt', es: 'es', de: 'de', ru: 'ru', uk: 'ua', ko: 'kr', ja: 'jp' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const cache = {};
  const rankUrl = `${base}/rest/v1/youtube_trending?select=country_code,rank,channel_id,channel_title`;
  let ranking = null;
  let token = 0;

  const shortsCache = {};
  function loadShorts(lang) {
    if (!shortsCache[lang]) {
      shortsCache[lang] = fetch(`${base}/rest/v1/news_shorts?select=*&lang=eq.${encodeURIComponent(dataLang(lang))}&order=rank.asc&limit=30`, { headers })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return shortsCache[lang];
  }
  // Country whose Shorts are shown (each country is searched in its own language).
  // Defaults to the site language's country; a dropdown choice is kept until the site language changes.
  const SHORT_CC = { en: 'US', 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'MX', de: 'DE', ru: 'RU', uk: 'UA', ko: 'KR', ja: 'JP' };
  const PICK = 'lp-shorts-lang';
  let shortsPick = null;
  try { const v = localStorage.getItem(PICK); if (LANGS.includes(v)) shortsPick = v; } catch (e) { /* no storage */ }
  const shortsCounts = fetch(`${base}/rest/v1/news_shorts?select=lang`, { headers })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => rows.reduce((m, r) => { m[r.lang] = (m[r.lang] || 0) + 1; return m; }, {}))
    .catch(() => ({}));

  // World News Wire: Google News top stories per Trending Index country (public.news_world).
  const WORLD_CC = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE', 'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const WPICK = 'lp-world-cc';
  let worldPick = null;
  try { const v = localStorage.getItem(WPICK); if (WORLD_CC.includes(v)) worldPick = v; } catch (e) { /* no storage */ }
  const worldCache = {};
  function loadWorld(cc) {
    if (!worldCache[cc]) {
      worldCache[cc] = fetch(`${base}/rest/v1/news_world?select=*&country_code=eq.${encodeURIComponent(cc)}&image_url=like.https%3A%2F%2F*&order=rank.asc&limit=12`, { headers })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    return worldCache[cc];
  }
  const worldCounts = fetch(`${base}/rest/v1/news_world?select=country_code&rank=eq.1`, { headers })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => rows.reduce((m, r) => { m[r.country_code] = (m[r.country_code] || 0) + 1; return m; }, {}))
    .catch(() => ({}));

  async function load(lang) {
    if (!cache[lang]) {
      const res = await fetch(`${base}/rest/v1/news_wire?select=*&lang=eq.${encodeURIComponent(dataLang(lang))}&category=eq.creators&order=published_at.desc&limit=200`, { headers });
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
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    big: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  mount.className = 'nw';
  mount.setAttribute('aria-label', 'Creator News: headlines about YouTube and creators');
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
    <div class="nw-feed-wrap" hidden>
      <div class="nw-feed" data-no-i18n tabindex="0"><div class="nw-sentinel" aria-hidden="true"></div></div>
      <div class="nw-nav" data-no-i18n>
        <button type="button" class="nw-prev">${ICON.up}</button>
        <button type="button" class="nw-next">${ICON.down}</button>
      </div>
    </div>
    <div class="nw-foot">Latest creator-economy headlines from Google News, in the selected language first, then other languages. Photos are each article's own preview image. Refreshed hourly.</div>`;
  const empty = document.createElement('p');
  empty.className = 'nw-empty';
  mount.querySelector('.nw-sub').after(empty);
  empty.hidden = true;
  const feedWrap = mount.querySelector('.nw-feed-wrap');
  const feed = mount.querySelector('.nw-feed');
  const sentinel = mount.querySelector('.nw-sentinel');
  const asof = mount.querySelector('.nw-asof');
  const prevBtn = mount.querySelector('.nw-prev');
  const nextBtn = mount.querySelector('.nw-next');
  // Creator economy opens the page, above the search; Popular Shorts sit
  // above "Trending in the most countries", near the end of the page.
  // index.html reserves this frame (#news-front) so the page never shows the search first.
  const front = document.getElementById('news-front') || document.createElement('section');
  front.className = 'nw nw-front';
  front.setAttribute('aria-label', 'World News: top news headlines in each country');
  front.append(mount.querySelector('.nw-head'), mount.querySelector('.nw-sub'), empty, feedWrap, mount.querySelector('.nw-foot'));
  if (!front.isConnected) {
    const anchor = document.querySelector('.hero') || document.getElementById('results');
    if (anchor) anchor.before(front); else mount.before(front);
  }
  // Labels switch between World News Wire and the Creator News Wire fallback.
  const fLabel = {};
  for (const k of ['title', 'sym', 'sub', 'foot']) {
    const el = front.querySelector(`.nw-${k}`);
    el.setAttribute('data-no-i18n', '');
    fLabel[k] = { el, creators: el.textContent };
  }
  fLabel.title.el.textContent = tr('World News Wire');
  fLabel.sym.el.textContent = 'WORLD·WIRE';
  fLabel.sub.el.textContent = tr('Top stories');
  fLabel.foot.el.textContent = '';
  front.querySelector('.nw-asof').insertAdjacentHTML('beforebegin', '<span class="nw-wpick" hidden><img class="nw-pick-flag" src="" alt="" width="20" height="15"><select class="nw-select" data-no-i18n></select></span>');
  const wPick = front.querySelector('.nw-wpick');
  const wSel = wPick.querySelector('select');
  const wFlag = wPick.querySelector('img');
  wSel.addEventListener('change', () => {
    worldPick = wSel.value;
    try { localStorage.setItem(WPICK, worldPick); } catch (e) { /* no storage */ }
    render();
  });
  // Touch screens scroll the Shorts with the page instead of inside a box (iPhone Safari
  // could get stuck on the first Short when the box and YouTube's player competed for the swipe).
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  feedWrap.insertAdjacentHTML('afterbegin', '<div class="nw-lead" data-no-i18n></div>');
  const lead = feedWrap.querySelector('.nw-lead');
  const credits = document.createElement('section');
  credits.className = 'nw nw-credits';
  credits.hidden = true;
  credits.setAttribute('aria-label', 'Popular Shorts by country');
  mount.before(credits);
  // Popular Shorts get their own feed above the creator-economy articles.
  const S_TITLE = 'Popular Shorts by country';
  const S_FOOT = "Videos are the most viewed Shorts of the last 2 days in the language of the country chosen above, found by YouTube search and ranked by views. Clicking one opens the whole ranking as a YouTube playlist. Refreshed every 12 hours.";
  const S_NONE = 'No Popular Shorts for this country right now.';
  mount.querySelector('.nw-rank').insertAdjacentHTML('afterend', `
    <div class="nw-shorts" hidden>
      <h3 class="nw-sub" data-no-i18n>${S_TITLE}</h3>
      <div class="nw-pick">
        <span class="nw-pick-l" data-no-i18n>Country</span>
        <img class="nw-pick-flag" src="" alt="" width="20" height="15">
        <select class="nw-select" data-no-i18n></select>
        <span class="nw-ghint" data-no-i18n></span>
      </div>
      <p class="nw-empty" data-no-i18n hidden></p>
      <div class="nw-feed-wrap">
        <div class="nw-feed" data-no-i18n tabindex="0"></div>
        <div class="nw-nav" data-no-i18n>
          <button type="button" class="nw-prev">${ICON.up}</button>
          <button type="button" class="nw-next">${ICON.down}</button>
        </div>
      </div>
      <div class="nw-foot" data-no-i18n>${S_FOOT}</div>
    </div>`);
  const sBox = mount.querySelector('.nw-shorts');
  const sFeed = sBox.querySelector('.nw-feed');
  const sPrev = sBox.querySelector('.nw-prev');
  const sNext = sBox.querySelector('.nw-next');
  const pickBar = mount.querySelector('.nw-pick');
  const pickSel = mount.querySelector('.nw-select');
  const pickFlag = mount.querySelector('.nw-pick-flag');
  credits.append(sBox);
  pickSel.addEventListener('change', () => {
    shortsPick = pickSel.value;
    try { localStorage.setItem(PICK, shortsPick); } catch (e) { /* no storage */ }
    renderShorts();
  });
  // Countries without Shorts right now stay listed but can't be chosen.
  function renderPicker(ui, counts, cur) {
    let names = null;
    try { names = new Intl.DisplayNames([ui === 'pt' ? 'pt-BR' : ui], { type: 'region' }); } catch (e) { /* codes only */ }
    const opts = LANGS.map((l) => ({ l, name: names ? names.of(SHORT_CC[l]) : SHORT_CC[l] }))
      .sort((a, b) => a.name.localeCompare(b.name, ui));
    pickSel.innerHTML = opts.map((o) => `<option value="${esc(o.l)}"${counts[o.l] || o.l === cur ? '' : ' disabled'}>${esc(o.name)}</option>`).join('');
    pickSel.value = cur;
    pickSel.setAttribute('aria-label', tr('Country'));
    pickFlag.src = `/assets/flags/${SHORT_CC[cur].toLowerCase()}.svg`;
    pickBar.hidden = !Object.values(counts).some(Boolean);
  }
  let view = null;

  const langName = (l, ui) => {
    try { return new Intl.DisplayNames([ui], { type: 'language' }).of(l === 'pt' ? 'pt-BR' : l); } catch { return l; }
  };
  // World News summary: plays over the photo a few words at a time, like video subtitles.
  const capHtml = (sum) => (sum ? `<p class="nw-cap" aria-hidden="true" data-cap="${esc(sum)}"><span></span></p>` : '');
  const capChunks = (text, max) => {
    // Even chunk lengths, so the last one isn't a lone word.
    max = Math.ceil(text.length / Math.ceil(text.length / max)) + 4;
    let words;
    try { words = [...new Intl.Segmenter(siteLang(), { granularity: 'word' }).segment(text)].map((x) => x.segment); } catch { words = text.split(/(\s+)/); }
    const out = [];
    let cur = '';
    for (const w of words) {
      if (cur.trim() && w.trim() && (cur + w).trim().length > max) { out.push(cur.trim()); cur = ''; }
      cur += w;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const CAP_STEP = 1500;
  const capTick = () => {
    document.querySelectorAll('.nw-cap').forEach((cap) => {
      const card = cap.closest('.nw-card');
      const span = cap.firstElementChild;
      if (calm.matches) { span.textContent = cap.dataset.cap; cap.classList.add('nw-cap-all'); return; }
      if (!card || !card.classList.contains('nw-on') || card.classList.contains('nw-paused')) return;
      if (!cap.nwChunks) { cap.nwChunks = capChunks(cap.dataset.cap, cap.closest('.nw-lead') ? 44 : 26); cap.nwAt = -1; }
      // One blank beat after the last chunk, then the summary starts again.
      cap.nwAt = (cap.nwAt + 1) % (cap.nwChunks.length + 1);
      const chunk = cap.nwChunks[cap.nwAt] || '';
      cap.classList.toggle('nw-cap-gap', !chunk);
      if (!chunk) return;
      span.textContent = chunk;
      span.classList.remove('nw-cap-in');
      void span.offsetWidth;
      span.classList.add('nw-cap-in');
    });
  };
  function cardHtml(r, lang, i, kind, note) {
    const foreign = r.lang && r.lang !== lang;
    const link = /^https:\/\//.test(r.link) ? esc(r.link) : '#';
    const img = /^https:\/\//.test(r.image_url || '') ? esc(r.image_url) : '';
    const src = String(r.source || 'Google News').trim();
    const initial = esc(([...src][0] || 'N').toUpperCase());
    const ch = channelIn(r.title);
    return `
      <article class="nw-card nw-short nw-${kind} nw-in${img ? '' : ' nw-noimg'}"${foreign ? ` lang="${esc(r.lang)}"` : ''} style="animation-delay:${(i % FEED_PAGE) * 45}ms">
        <div class="nw-media" aria-hidden="true">
          ${img ? `<img class="nw-img nw-kb${i % 4}" src="${img}" alt="" loading="${kind === 'more' ? 'lazy' : 'eager'}" decoding="async" referrerpolicy="no-referrer">` : ''}
          <div class="nw-art"><span>${initial}</span></div>
        </div>
        <div class="nw-shade" aria-hidden="true"></div>
        <div class="nw-top">
          <span class="nw-badge">${esc(tr(kind === 'hero' ? 'Top story' : 'Creator wire'))}</span>
          ${note ? `<span class="nw-badge nw-badge-alt">${esc(note)}</span>` : ''}
          <span class="nw-age">${esc(ago(r.published_at, lang))}</span>
          ${foreign && FLAG[r.lang] ? `<img class="nw-flag" src="/assets/flags/${FLAG[r.lang]}.svg" alt="${esc(langName(r.lang, lang))}" title="${esc(langName(r.lang, lang))}" width="18" height="13">` : ''}
        </div>
        <div class="nw-low">
          <div class="nw-bottom">
            ${capHtml(r.summary)}
            <div class="nw-pub"><span class="nw-mono" aria-hidden="true">${initial}</span><span class="nw-src">${esc(src)}</span></div>
            <a class="nw-hl" href="${link}" target="_blank" rel="noopener"${r.title_orig ? ` title="${esc(r.title_orig)}"` : ''}>${esc(r.title)}</a>${r.summary ? `<span class="nw-sr">${esc(r.summary)}</span>` : ''}
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

  // Front-page headline row: the article's own photo, animated like a GIF, beside the headline.
  function rowHtml(r, lang, i, note) {
    const foreign = r.lang && r.lang !== lang;
    const link = /^https:\/\//.test(r.link) ? esc(r.link) : '#';
    const img = /^https:\/\//.test(r.image_url || '') ? esc(r.image_url) : '';
    const src = String(r.source || 'Google News').trim();
    const initial = esc(([...src][0] || 'N').toUpperCase());
    return `
      <article class="nw-card nw-row nw-in${img ? '' : ' nw-noimg'}"${foreign ? ` lang="${esc(r.lang)}"` : ''} style="animation-delay:${(i % FEED_PAGE) * 45}ms">
        <a class="nw-row-media" href="${link}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
          ${img ? `<img class="nw-img nw-kb${i % 4}" src="${img}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
          <div class="nw-art"><span>${initial}</span></div>
          ${capHtml(r.summary)}
        </a>
        <div class="nw-row-body">
          <div class="nw-row-meta">
            ${note ? `<span class="nw-row-note">${esc(note)}</span>` : ''}
            <span class="nw-src">${esc(src)}</span>
            <span class="nw-row-age">${esc(ago(r.published_at, lang))}</span>
            ${foreign && FLAG[r.lang] ? `<img class="nw-flag" src="/assets/flags/${FLAG[r.lang]}.svg" alt="${esc(langName(r.lang, lang))}" title="${esc(langName(r.lang, lang))}" width="18" height="13">` : ''}
          </div>
          <a class="nw-hl" href="${link}" target="_blank" rel="noopener"${r.title_orig ? ` title="${esc(r.title_orig)}"` : ''}>${esc(r.title)}</a>${r.summary ? `<span class="nw-sr">${esc(r.summary)}</span>` : ''}
        </div>
      </article>`;
  }

  // A real YouTube Short: YouTube's own player, uncovered. It starts muted with
  // captions when the card fills the screen (thumbnail + play button until then, or
  // until tapped when the visitor prefers reduced motion); a tap turns the sound on
  // and hands the player its own controls. Leaving the card removes the player.
  const compact = (n, lang) => { try { return new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : lang, { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(n); } };
  function shortHtml(v, lang) {
    const id = /^[A-Za-z0-9_-]{11}$/.test(v.video_id) ? v.video_id : '';
    const url = `https://www.youtube.com/shorts/${id}`;
    const ch = String(v.channel_title || 'YouTube').trim();
    const initial = esc(([...ch][0] || 'Y').toUpperCase());
    const play = tr('Play video');
    return `
      <article class="nw-card nw-short nw-yt nw-in" data-vid="${id}" data-lang="${esc(lang)}" data-title="${esc(v.title)}">
        <div class="nw-media" aria-hidden="true">
          <img class="nw-img nw-still" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          <div class="nw-art"><span>${initial}</span></div>
        </div>
        <div class="nw-shade" aria-hidden="true"></div>
        <div class="nw-top">
          <span class="nw-badge">${esc(tr('Popular Short'))}</span>
          ${v.published_at ? `<span class="nw-age">${esc(ago(v.published_at, lang))}</span>` : ''}
          ${v.view_count != null ? `<span class="nw-age">${esc(compact(v.view_count, lang))} ${esc(tr('views'))}</span>` : ''}
          ${SHORT_CC[v.lang] ? `<img class="nw-flag" src="/assets/flags/${SHORT_CC[v.lang].toLowerCase()}.svg" alt="" width="18" height="13">` : ''}
        </div>
        <button type="button" class="nw-play" aria-label="${esc(`${play}: ${v.title}`)}" title="${esc(play)}">${ICON.big}</button>
        <div class="nw-low">
          <div class="nw-bottom">
            <div class="nw-pub"><span class="nw-mono" aria-hidden="true">${initial}</span><span class="nw-src">${esc(ch)}</span></div>
            <a class="nw-hl" href="${url}" target="_blank" rel="noopener">${esc(v.title)}</a>
          </div>
          <div class="nw-rail">
            <a class="nw-act" href="${url}" target="_blank" rel="noopener" aria-label="${esc(tr('Open on YouTube'))}" title="${esc(tr('Open on YouTube'))}">${ICON.open}</a>
          </div>
        </div>
      </article>`;
  }
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  setInterval(capTick, CAP_STEP);
  const YT_ORIGIN = 'https://www.youtube-nocookie.com';
  const ytCmd = (f, func) => { if (f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), YT_ORIGIN); };
  function playShort(card, muted) {
    const id = card.dataset.vid;
    if (!id) return;
    const cur = card.querySelector('.nw-player');
    if (cur) {
      if (card.nwParked) { clearTimeout(card.nwKill); card.nwParked = false; ytCmd(cur, 'playVideo'); }
      if (!muted && card.classList.contains('nw-preview')) {
        ytCmd(cur, 'unMute');
        ytCmd(cur, 'playVideo');
        card.classList.remove('nw-preview');
      }
      return;
    }
    const hl = card.dataset.lang || siteLang();
    const f = document.createElement('iframe');
    f.className = 'nw-player';
    f.src = `${YT_ORIGIN}/embed/${id}?${new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', playsinline: '1', rel: '0', loop: '1', playlist: id, cc_load_policy: '1', cc_lang_pref: hl, hl, enablejsapi: '1', origin: location.origin })}`;
    f.title = card.dataset.title || 'YouTube';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.addEventListener('load', () => { f.classList.add('nw-ready'); card.classList.add('nw-live'); }, { once: true });
    card.appendChild(f);
    card.classList.add('nw-playing');
    card.classList.toggle('nw-preview', !!muted);
  }
  // Leaving a Short pauses its player and frees it a few seconds later, so scrolling
  // straight back resumes it without reloading.
  function parkShort(card) {
    clearTimeout(card.nwAuto);
    const f = card.querySelector('.nw-player');
    if (!f || card.nwParked) return;
    document.querySelectorAll('.nw-yt').forEach((o) => { if (o !== card && o.nwParked) stopShort(o); });
    ytCmd(f, 'pauseVideo');
    card.nwParked = true;
    card.nwKill = setTimeout(() => stopShort(card), 8000);
  }

  function stopShort(card) {
    clearTimeout(card.nwAuto);
    clearTimeout(card.nwKill);
    card.nwParked = false;
    const f = card.querySelector('.nw-player');
    if (f) f.remove();
    card.classList.remove('nw-playing', 'nw-preview', 'nw-live');
  }

  // Pan-and-zoom runs only while a card is on screen.
  const motion = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
      const c = e.target;
      c.classList.toggle('nw-on', e.isIntersecting);
      if (!c.classList.contains('nw-yt')) return;
      if (!e.isIntersecting) { parkShort(c); return; }
      clearTimeout(c.nwAuto);
      if (!calm.matches) c.nwAuto = setTimeout(() => { if (c.classList.contains('nw-on')) playShort(c, true); }, 250);
    }), { threshold: 0.6 })
    : null;
  const watch = (root) => root.querySelectorAll('.nw-card:not([data-w])').forEach((c) => {
    c.dataset.w = '1';
    if (motion) motion.observe(c); else c.classList.add('nw-on');
  });

  // Endless vertical feed: the selected language first, then every other
  // language's stories (flagged; the first one says so), each story once,
  // then a "caught up" card. Cards load a few screens ahead of the reader.
  let feedState = null;
  const nearEnd = () => sentinel.offsetTop - feed.scrollTop < feed.clientHeight * 3;
  async function moreFeed() {
    const st = feedState;
    if (!st || st.busy || st.done) return;
    st.busy = true;
    try {
      while (st.shown >= st.items.length && st.queue.length) {
        const l = st.queue.shift();
        const extra = (await load(l).catch(() => [])).filter((r) => !st.seen.has(r.link));
        if (st !== feedState) return;
        if (!extra.length) continue;
        extra.forEach((r) => st.seen.add(r.link));
        if (st.others == null) st.others = st.items.length;
        st.items.push(...extra);
      }
      if (st.shown >= st.items.length) {
        st.done = true;
        sentinel.insertAdjacentHTML('beforebegin', `<p class="nw-feed-end">${esc(tr("You're all caught up"))}</p>`);
        return;
      }
      const from = st.shown;
      st.shown = Math.min(st.items.length, st.shown + st.page);
      sentinel.insertAdjacentHTML('beforebegin', st.items.slice(from, st.shown).map((r, i) => {
        const n = from + i;
        const note = n === st.others ? tr('From other languages') : '';
        if (n) return rowHtml(r, st.lang, n, note);
        lead.innerHTML = cardHtml(r, st.lang, 0, 'hero', note);
        return '';
      }).join(''));
      watch(feed);
      watch(lead);
    } finally {
      st.busy = false;
    }
    requestAnimationFrame(() => {
      if (st === feedState && nearEnd()) moreFeed();
    });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { if (entries[0].isIntersecting) moreFeed(); }, { root: feed, rootMargin: '0px 0px 300% 0px' }).observe(sentinel);
  }
  // Shared by both feeds: arrows, keyboard-free wheel stepping and end detection.
  function feedNav(feed, prevBtn, nextBtn, isDone, onScroll) {
    // Moves to the neighbouring card's own position, so the gap size never adds up.
    const step = (dir) => {
      const cards = [...feed.children].filter((c) => c.matches('.nw-card, .nw-feed-end'));
      if (!cards.length) return;
      const pos = (c) => c.offsetTop - cards[0].offsetTop;
      let i = 0;
      cards.forEach((c, k) => { if (Math.abs(pos(c) - feed.scrollTop) < Math.abs(pos(cards[i]) - feed.scrollTop)) i = k; });
      const t = cards[Math.max(0, Math.min(cards.length - 1, i + dir))];
      feed.scrollTo({ top: pos(t), behavior: 'smooth' });
    };
    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));
    const syncNav = () => {
      prevBtn.disabled = feed.scrollTop < 8;
      nextBtn.disabled = isDone() && feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 40;
    };
    feed.addEventListener('scroll', () => { syncNav(); if (onScroll) onScroll(); }, { passive: true });
    // Mouse wheel / trackpad: the page scrolls until the feed fills the screen,
    // then one gesture moves exactly one story; at either end the page scrolls on.
    let wheelLock = 0;
    feed.addEventListener('wheel', (ev) => {
      if (ev.ctrlKey || Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
      const dir = Math.sign(ev.deltaY);
      const top = feed.getBoundingClientRect().top;
      const dock = 34 + (innerWidth <= 560 ? 12 : 16);
      const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : 1);
      if ((dir > 0 && top > dock + 4) || (dir < 0 && top < dock - 4)) {
        ev.preventDefault();
        window.scrollBy(0, dir > 0 ? Math.min(dy, top - dock) : Math.max(dy, top - dock));
        return;
      }
      if ((dir < 0 && prevBtn.disabled) || (dir > 0 && nextBtn.disabled)) return;
      ev.preventDefault();
      const now = performance.now();
      const busy = now < wheelLock;
      wheelLock = Math.max(wheelLock, now + 250);
      if (busy) return;
      wheelLock = now + 600;
      step(dir);
    }, { passive: false });
    feed.nwStep = step;
    return syncNav;
  }
  feed.addEventListener('scroll', () => { if (nearEnd()) moreFeed(); }, { passive: true });
  const syncNav = () => {};

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

  const onClick = (ev) => {
    const card = ev.target.closest('.nw-card');
    if (!card) return;
    if (card.classList.contains('nw-yt')) {
      if (!ev.target.closest('a')) playShort(card, false);
      return;
    }
    const find = ev.target.closest('.nw-find');
    if (find) { searchChannel(find.dataset.q); return; }
    if (ev.target.closest('a') || card.classList.contains('nw-row')) return;
    setPaused(card, !card.classList.contains('nw-paused'));
  };
  const onImgError = (ev) => {
    const img = ev.target;
    if (!img.classList || !img.classList.contains('nw-img')) return;
    const card = img.closest('.nw-card');
    // World News shows only stories with a photo: a headline whose photo the browser can't load is dropped.
    if (!wPick.hidden && card.classList.contains('nw-row') && front.contains(card)) {
      card.remove();
      const st = feedState;
      if (st && st.spare.length) {
        (feed.querySelector('.nw-feed-end') || sentinel).insertAdjacentHTML('beforebegin', rowHtml(st.spare.shift(), st.lang, st.shown, ''));
        watch(feed);
      }
      return;
    }
    card.classList.add('nw-noimg');
    img.remove();
  };
  [mount, front, credits].forEach((el) => {
    el.addEventListener('click', onClick);
    el.addEventListener('error', onImgError, true);
  });

  const W_NONE = 'No top stories for this country right now.';
  const W_TR = 'Headlines are translated into the site language by AI (Gemini); hover over a headline to see the original.';
  const W_SUM = "Summaries over the photos are written by AI (Gemini) from each publisher's own article description.";
  const W_FOOT = "The chosen country's 10 top stories from Google News, ranked 1–10 in Google News' order, in the country's language. Only stories with the article's own photo are shown; when a country has fewer than 10, its most recent stories from other Google News sections fill the remaining places. Algeria, Ecuador and Iraq have no Google News edition, so they show Google News search results for the country's name. Refreshed every 3 hours.";
  const W_SHOWN = 10;
  function setFrontLabels(world, cc, ui, counts) {
    let names = null;
    try { names = new Intl.DisplayNames([ui === 'pt' ? 'pt-BR' : ui], { type: 'region' }); } catch (e) { /* codes only */ }
    const name = (c) => (names ? names.of(c) : c);
    fLabel.title.el.textContent = world ? tr('World News Wire') : tr(fLabel.title.creators);
    fLabel.sym.el.textContent = world ? 'WORLD·WIRE' : fLabel.sym.creators;
    fLabel.sub.el.textContent = world ? `${tr('Top 10')} · ${name(cc)}` : tr(fLabel.sub.creators);
    fLabel.foot.el.textContent = world ? `${tr(W_FOOT)} ${tr(W_TR)} ${tr(W_SUM)}` : tr(fLabel.foot.creators);
    wPick.hidden = !world;
    front.classList.toggle('nw-ranked', world);
    if (!world) return;
    wSel.innerHTML = WORLD_CC.map((c) => ({ c, n: name(c) })).sort((a, b) => a.n.localeCompare(b.n, ui))
      .map((o) => `<option value="${o.c}"${counts[o.c] || o.c === cc ? '' : ' disabled'}>${esc(o.n)}</option>`).join('');
    wSel.value = cc;
    wSel.setAttribute('aria-label', tr('Country'));
    wFlag.src = `/assets/flags/${cc.toLowerCase()}.svg`;
  }

  async function render() {
    const mine = ++token;
    const lang = siteLang();
    try {
      const counts = await worldCounts;
      const world = Object.values(counts).some(Boolean);
      let cc = worldPick || ({ en: 'US', 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'MX', de: 'DE', ru: 'RU', uk: 'UA', ko: 'KR', ja: 'JP' })[lang] || 'US';
      const inLang = (rs) => rs.map((r) => {
        const t = r.title_tr || {};
        const summary = (t.sum && (t.sum[dataLang(lang)] || t.sum.en)) || '';
        const out = summary ? { ...r, summary } : r;
        return t[dataLang(lang)] && t[dataLang(lang)] !== r.title ? { ...out, title: t[dataLang(lang)], title_orig: r.title } : out;
      });
      let rows;
      if (world) {
        rows = inLang(await loadWorld(cc));
        // The language's home country may have no stories yet; open on one that does instead of an empty panel.
        if (!rows.length && !worldPick) {
          const alt = counts.US ? 'US' : Object.keys(counts).find((k) => counts[k]);
          if (alt && alt !== cc) { cc = alt; rows = inLang(await loadWorld(cc)); }
        }
      } else {
        rows = await load(lang);
        if (!rows.length && lang !== 'en') rows = await load('en');
      }
      channels = world ? [] : await known;
      if (mine !== token) return;
      setFrontLabels(world, cc, lang, counts);
      if (world && !rows.length) {
        front.hidden = false;
        feedWrap.hidden = true;
        lead.innerHTML = '';
        feed.querySelectorAll(':scope > :not(.nw-sentinel)').forEach((n) => n.remove());
        empty.textContent = tr(W_NONE);
        empty.hidden = false;
        return;
      }
      if (!rows.length) throw new Error('no data');
      mount.hidden = false;
      front.hidden = false;
      view = { items: rows, lang };
      empty.hidden = true;
      feedWrap.hidden = false;
      feed.querySelectorAll(':scope > :not(.nw-sentinel)').forEach((n) => n.remove());
      lead.innerHTML = '';
      feed.scrollTop = 0;
      feed.setAttribute('aria-label', tr('Creator economy'));
      prevBtn.setAttribute('aria-label', tr('Previous story'));
      prevBtn.title = tr('Previous story');
      nextBtn.setAttribute('aria-label', tr('Next story'));
      nextBtn.title = tr('Next story');
      const own = rows[0].lang || lang;
      feedState = {
        lang,
        items: world ? rows.slice(0, W_SHOWN) : rows.slice(),
        spare: world ? rows.slice(W_SHOWN) : [],
        page: world ? W_SHOWN : FEED_PAGE,
        shown: 0,
        seen: new Set(rows.map((r) => r.link)),
        queue: world ? [] : ['en', ...LANGS].filter((l, i, a) => l !== own && a.indexOf(l) === i),
        others: null,
        shorts: [],
        si: 0,
        busy: false,
        done: false
      };
      feedWrap.hidden = false;
      moreFeed().then(syncNav);
      asof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
    } catch (err) {
      if (mine !== token) return;
      if (err.message !== 'no data') console.error('News wire widget:', err);
      view = null;
      feedState = null;
      if (!Object.values(cache).some((r) => r.length) && !Object.values(worldCache).length) { mount.hidden = true; front.hidden = true; return; }
      empty.textContent = tr('News is unavailable right now.');
      empty.hidden = false;
      feedWrap.hidden = true;
    }
  }

  // Popular Shorts grid: every Short of the country as a small tile. Hovering (or a first
  // tap on touch screens) plays one muted inside its tile; clicking opens it big with sound.
  // Only one YouTube player exists at a time.
  let sToken = 0;
  function tileHtml(v, ui) {
    const id = /^[A-Za-z0-9_-]{11}$/.test(v.video_id) ? v.video_id : '';
    const ch = String(v.channel_title || 'YouTube').trim();
    return `
      <article class="nw-tile" tabindex="0" role="button" data-vid="${id}" data-title="${esc(v.title)}" aria-label="${esc(`${tr('Play video')}: ${v.title}`)}">
        <div class="nw-tile-media">
          <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          ${v.view_count != null ? `<span class="nw-tile-views">${esc(compact(v.view_count, ui))} ${esc(tr('views'))}</span>` : ''}
          <span class="nw-tile-play" aria-hidden="true">${ICON.big}</span>
        </div>
        <div class="nw-tile-body">
          <p class="nw-tile-title">${esc(v.title)}</p>
          <p class="nw-tile-ch">${esc(ch)}${v.published_at ? ` · ${esc(ago(v.published_at, ui))}` : ''}</p>
        </div>
      </article>`;
  }
  const embed = (id, muted) => `${YT_ORIGIN}/embed/${id}?${new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', controls: muted ? '0' : '1', playsinline: '1', rel: '0', loop: '1', playlist: id, cc_load_policy: '1', cc_lang_pref: siteLang(), hl: siteLang(), enablejsapi: '1', origin: location.origin })}`;
  let pv = null;
  let pvTimer = 0, pvUnwatch = null;
  function stopPreview() {
    clearTimeout(pvTimer);
    if (pvUnwatch) { pvUnwatch(); pvUnwatch = null; }
    if (!pv) return;
    const f = pv.querySelector('.nw-tpv');
    if (f) f.remove();
    pv.classList.remove('nw-pv', 'nw-pvlive');
    pv = null;
  }
  function startPreview(t) {
    if (pv === t || !t.dataset.vid) return;
    stopPreview();
    pv = t;
    t.classList.add('nw-pv');
    const f = document.createElement('iframe');
    f.className = 'nw-tpv';
    f.src = embed(t.dataset.vid, true);
    f.title = t.dataset.title || 'YouTube';
    f.tabIndex = -1;
    f.allow = 'autoplay; encrypted-media';
    const live = () => { f.classList.add('nw-ready'); t.classList.add('nw-pvlive'); };
    if (window.lpWhenPlaying) pvUnwatch = lpWhenPlaying(f, live); else f.addEventListener('load', live, { once: true });
    t.querySelector('.nw-tile-media').appendChild(f);
  }
  sFeed.addEventListener('mouseover', (ev) => {
    if (touch) return;
    const t = ev.target.closest('.nw-tile');
    clearTimeout(pvTimer);
    if (!t) { stopPreview(); return; }
    if (t !== pv) pvTimer = setTimeout(() => startPreview(t), 220);
  });
  sFeed.addEventListener('mouseleave', stopPreview);
  sFeed.addEventListener('click', (ev) => {
    const t = ev.target.closest('.nw-tile');
    if (!t) return;
    if (touch && pv !== t) { startPreview(t); return; }
    openShort(t);
  });
  sFeed.addEventListener('keydown', (ev) => {
    const t = ev.target.closest('.nw-tile');
    if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openShort(t); }
  });

  const modal = document.createElement('div');
  modal.className = 'nw-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('data-no-i18n', '');
  modal.innerHTML = `<div class="nw-modal-box"><div class="nw-modal-frame"></div>
    <button type="button" class="nw-modal-x"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
    <button type="button" class="nw-modal-prev">${ICON.up}</button><button type="button" class="nw-modal-next">${ICON.down}</button></div>`;
  document.body.appendChild(modal);
  const mFrame = modal.querySelector('.nw-modal-frame');
  const mClose = modal.querySelector('.nw-modal-x');
  let mTile = null;
  function openShort(t) {
    if (!t.dataset.vid) return;
    stopPreview();
    mTile = t;
    mFrame.innerHTML = `<iframe src="${embed(t.dataset.vid, false)}" title="${esc(t.dataset.title || 'YouTube')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    modal.setAttribute('aria-label', t.dataset.title || 'YouTube');
    [['.nw-modal-x', 'Close'], ['.nw-modal-prev', 'Previous video'], ['.nw-modal-next', 'Next video']].forEach(([sel, l]) => {
      const b = modal.querySelector(sel); b.setAttribute('aria-label', tr(l)); b.title = tr(l);
    });
    if (modal.hidden) {
      modal.hidden = false;
      document.documentElement.classList.add('nw-lock');
      mClose.focus({ preventScroll: true });
    }
  }
  function closeShort() {
    if (modal.hidden) return;
    modal.hidden = true;
    mFrame.innerHTML = '';
    document.documentElement.classList.remove('nw-lock');
    if (mTile) mTile.focus({ preventScroll: true });
    mTile = null;
  }
  function stepShort(d) {
    const tiles = [...sFeed.querySelectorAll('.nw-tile')];
    const n = tiles[(tiles.indexOf(mTile) + d + tiles.length) % tiles.length];
    if (n) openShort(n);
  }
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal || ev.target.closest('.nw-modal-x')) closeShort();
    else if (ev.target.closest('.nw-modal-prev')) stepShort(-1);
    else if (ev.target.closest('.nw-modal-next')) stepShort(1);
  });
  document.addEventListener('keydown', (ev) => {
    if (modal.hidden) return;
    if (ev.key === 'Escape') closeShort();
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') stepShort(1);
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') stepShort(-1);
    else return;
    ev.preventDefault();
  });

  async function renderShorts() {
    const mine = ++sToken;
    const ui = siteLang();
    const sl = shortsPick || ui;
    const [rows, counts] = await Promise.all([loadShorts(sl), shortsCounts]);
    if (mine !== sToken) return;
    stopPreview();
    closeShort();
    const vids = rows.filter((v, i, a) => a.findIndex((x) => x.video_id === v.video_id) === i);
    // Ranked by views; any click opens the whole ranking as a YouTube quick playlist (watch_videos:
    // no login, no API units), starting at the clicked Short.
    const ranked = vids.filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.video_id)).sort((x, y) => (Number(y.view_count) || 0) - (Number(x.view_count) || 0));
    const ids = ranked.map((v) => v.video_id);
    const plist = (i) => `https://www.youtube.com/watch_videos?video_ids=${ids.slice(i).concat(ids.slice(0, i)).join(',')}`;
    const peak = Math.max(1, ...ranked.map((v) => Number(v.view_count) || 0));
    const rk = (i) => String(i + 1).padStart(2, '0');
    const ch = (v) => esc(String(v.channel_title || 'YouTube').trim());
    sFeed.classList.remove('nw-grid');
    sFeed.classList.add('ysh');
    sFeed.innerHTML = `<div class="ysh-cards">${ranked.slice(0, 5).map((v, i) => `<a class="ysh-card" href="${plist(i)}" target="_blank" rel="noopener">
        <span class="ysh-cth"><img src="https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><b class="ysh-crk">${rk(i)}</b>${v.view_count != null ? `<i class="ysh-cvw">${esc(compact(v.view_count, ui))}</i>` : ''}${window.lpVph && lpVph(v.view_count, v.published_at, v.fetched_at) != null ? `<i class="lp-vph">${esc(compact(lpVph(v.view_count, v.published_at, v.fetched_at), ui))}/h</i>` : ''}</span>
        <span class="ysh-ctt" title="${esc(v.title)}">${esc(v.title)}</span><span class="ysh-cch">${ch(v)}</span></a>`).join('')}</div>${ranked.length > 5 ? `<ol class="ysh-list" style="--r2:${Math.ceil((ranked.length - 5) / 2)};--r3:${Math.ceil((ranked.length - 5) / 3)}">${ranked.slice(5).map((v, j) => `<li><a href="${plist(j + 5)}" target="_blank" rel="noopener">
        <span class="ysh-rk">${rk(j + 5)}</span><span class="lp-rth lp-rth-s" style="--k:${(1 - j * 0.018).toFixed(3)}"><img src="https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"></span>
        <span class="ysh-tx"><span class="ysh-vt" title="${esc(v.title)}">${esc(v.title)}</span><span class="ysh-ch">${ch(v)}</span></span>
        <span class="ysh-vol"><span class="ysh-num">${v.view_count != null ? esc(compact(v.view_count, ui)) : '—'}</span>${window.lpVph && lpVph(v.view_count, v.published_at, v.fetched_at) != null ? `<span class="lp-vph-t">${esc(compact(lpVph(v.view_count, v.published_at, v.fetched_at), ui))}/h</span>` : ''}<span class="ysh-bar" style="width:${Math.max(4, Math.round((Number(v.view_count) || 0) / peak * 100))}%"></span></span></a></li>`).join('')}</ol>` : ''}`;
    sBox.querySelector('.nw-feed-wrap').hidden = !vids.length;
    const none = sBox.querySelector('.nw-empty');
    none.textContent = tr(S_NONE);
    none.hidden = !!vids.length;
    sFeed.scrollTop = 0;
    renderPicker(ui, counts, sl);
    sBox.querySelector('.nw-sub').textContent = tr(S_TITLE);
    sBox.querySelector('.nw-pick-l').textContent = tr('Country');
    sBox.querySelector('.nw-foot').textContent = tr(S_FOOT);
    sBox.querySelector('.nw-ghint').textContent = tr('Opens the whole ranking as a YouTube playlist');
    sFeed.setAttribute('aria-label', tr(S_TITLE));
    sPrev.setAttribute('aria-label', tr('Previous story'));
    sPrev.title = tr('Previous story');
    sNext.setAttribute('aria-label', tr('Next story'));
    sNext.title = tr('Next story');
    sBox.hidden = !Object.values(counts).some(Boolean);
    credits.hidden = sBox.hidden;
  }

  // "Trending in the most countries": channels counted by how many countries'
  // YouTube Trending top 10 (public.youtube_trending) they appear in right now.
  // Ties: better average chart position, then name.
  const rankBox = mount.querySelector('.nw-rank');
  const rankList = mount.querySelector('.nw-rank-list');
  // Shown in the truck's "Trending in the most countries" compartment (index.html) rather than on the page.
  const rankHome = document.getElementById('tr-pop-body');
  if (rankHome) rankHome.append(rankBox);
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
  // A new site language brings back that language's country for Shorts.
  document.addEventListener('lp:lang', () => {
    worldPick = null;
    try { localStorage.removeItem(WPICK); } catch (e) { /* no storage */ }
    shortsPick = null;
    try { localStorage.removeItem(PICK); } catch (e) { /* no storage */ }
    render();
    renderShorts();
    renderRanking();
  });
  render();
  renderShorts();
})();
