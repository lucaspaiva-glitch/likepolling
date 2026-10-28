// "Who am I in the age of AI?": real headlines about people using AI for good (medicine, work,
// creativity, everyday life) from each country, in the site language. Filled twice a day by
// scripts/news-ai-routine.js (Google News + a Gemini check and translation).
//   <section id="ai-age" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
// Reads public.news_ai with the publishable key. Hides itself if there is no data.
(function () {
  'use strict';
  const mount = document.getElementById('ai-age');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const SHOWN = 10;
  const KINDS = { medicine: 'Medicine', work: 'Jobs', creativity: 'Creativity', life: 'Daily life' };
  const LANG_CC = { en: 'US', 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'ES', de: 'DE', ru: 'RU', uk: 'UA', ko: 'KR', ja: 'JP' };
  const ICON = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const dataLang = (l) => (l === 'en-GB' ? 'en' : l);
  async function get(path) {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Same ranked cards as World News Wire (news-wire-widget.css): 01 is the big photo card,
  // 02–10 photo cards that shrink step by step. Its summary player also plays these captions.
  mount.classList.add('aia');
  mount.innerHTML = `
    <div class="nw-head aia-head"><h2 class="nw-title">Who am I in the age of AI?</h2><button type="button" class="aia-info" aria-expanded="false" aria-controls="aia-about">About</button><span class="nw-sym" data-no-i18n>AI·WIRE</span><span class="nw-spacer"></span>
      <span class="nw-wpick"><img class="nw-pick-flag" src="" alt="" width="20" height="15"><select class="nw-select aia-select" data-no-i18n aria-label="Country"></select></span><span class="nw-asof aia-asof"></span>
      <div class="aia-about" id="aia-about" role="dialog" aria-label="About" hidden>
        <p>People using AI for good: medicine, jobs, creativity and daily life.</p>
        <p>Title from Ella Hafermalz on BBC's AI Decoded.</p>
        <a href="https://www.youtube.com/watch?v=6zAgTga9kZw&amp;t=860s" target="_blank" rel="noopener">Watch on YouTube (14:23)</a>
      </div>
    </div>
    <div class="nw-sub aia-sub"><span class="aia-top" data-no-i18n></span><div class="aia-kinds" role="group" aria-label="Topic"></div></div>
    <p class="nw-empty" hidden></p>
    <div class="nw-front nw-ranked aia-wire"><div class="nw-feed-wrap"><div class="nw-lead" data-no-i18n></div><div class="nw-feed" data-no-i18n></div></div></div>`;
  const select = mount.querySelector('.aia-select');
  const flag = mount.querySelector('.nw-pick-flag');
  const kindsBox = mount.querySelector('.aia-kinds');
  const topLabel = mount.querySelector('.aia-top');
  const empty = mount.querySelector('.nw-empty');
  const wrap = mount.querySelector('.nw-feed-wrap');
  const lead = mount.querySelector('.nw-lead');
  const feed = mount.querySelector('.nw-feed');
  const asof = mount.querySelector('.aia-asof');
  const info = mount.querySelector('.aia-info');
  const about = mount.querySelector('.aia-about');
  const toggle = (open) => {
    about.hidden = !open;
    info.setAttribute('aria-expanded', String(open));
  };
  info.addEventListener('click', (e) => { e.stopPropagation(); toggle(about.hidden); });
  document.addEventListener('click', (e) => { if (!about.hidden && !about.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !about.hidden) { toggle(false); info.focus(); } });
  const cache = {};
  let kind = 'all';
  let token = 0;
  let spare = [];
  let codes = [];

  // Pan-and-zoom (and the summary over the photo) run only while a card is on screen.
  const motion = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('nw-on', e.isIntersecting)), { threshold: 0.6 })
    : null;
  const watch = () => mount.querySelectorAll('.nw-card:not([data-w])').forEach((c) => {
    c.dataset.w = '1';
    if (motion) motion.observe(c); else c.classList.add('nw-on');
  });

  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return '';
    const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
    const rtf = new Intl.RelativeTimeFormat(siteLang(), { numeric: 'always', style: siteLang().startsWith('en') ? 'narrow' : 'short' });
    if (mins < 60) return rtf.format(-mins, 'minute');
    if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  }

  function parts(r) {
    const t = r.title_tr || {};
    const l = dataLang(siteLang());
    const title = t[l] || r.title;
    const src = String(r.source || 'Google News').trim();
    return {
      title,
      orig: title !== r.title ? ` title="${esc(r.title)}"` : '',
      sum: (t.sum && t.sum[l]) || '',
      kind: KINDS[t.ai] ? tr(KINDS[t.ai]) : '',
      link: /^https:\/\//.test(r.link) ? esc(r.link) : '#',
      img: /^https:\/\//.test(r.image_url || '') ? esc(r.image_url) : '',
      src: esc(src),
      initial: esc(([...src][0] || 'N').toUpperCase()),
    };
  }
  const capHtml = (text) => `<p class="nw-cap" aria-hidden="true" data-cap="${esc(text)}"><span></span></p>`;

  function leadHtml(r) {
    const p = parts(r);
    return `
      <article class="nw-card nw-short nw-hero nw-in${p.img ? '' : ' nw-noimg'}">
        <div class="nw-media" aria-hidden="true">
          ${p.img ? `<img class="nw-img nw-kb0" src="${p.img}" alt="" decoding="async" referrerpolicy="no-referrer">` : ''}
          <div class="nw-art"><span>${p.initial}</span></div>
        </div>
        <div class="nw-shade" aria-hidden="true"></div>
        <div class="nw-top">
          <span class="nw-badge">${esc(tr('Top story'))}</span>
          ${p.kind ? `<span class="nw-badge nw-badge-alt">${esc(p.kind)}</span>` : ''}
          <span class="nw-age">${esc(ago(r.published_at))}</span>
        </div>
        <div class="nw-low">
          <div class="nw-bottom">
            ${capHtml(p.sum || p.title)}
            <div class="nw-pub"><span class="nw-mono" aria-hidden="true">${p.initial}</span><span class="nw-src">${p.src}</span></div>
            <a class="nw-hl" href="${p.link}" target="_blank" rel="noopener"${p.orig}>${esc(p.title)}</a>${p.sum ? `<span class="nw-sr">${esc(p.sum)}</span>` : ''}
            <a class="nw-read" href="${p.link}" target="_blank" rel="noopener" tabindex="-1">${esc(tr('Read story'))} ↗</a>
          </div>
          <div class="nw-rail">
            <button type="button" class="nw-act nw-pp" aria-pressed="false" aria-label="${esc(tr('Pause motion'))}" title="${esc(tr('Pause motion'))}">${ICON.pause}</button>
            <a class="nw-act" href="${p.link}" target="_blank" rel="noopener" aria-label="${esc(tr('Open source'))}" title="${esc(tr('Open source'))}">${ICON.open}</a>
          </div>
        </div>
      </article>`;
  }

  function rowHtml(r, i) {
    const p = parts(r);
    return `
      <article class="nw-card nw-row nw-in${p.img ? '' : ' nw-noimg'}" style="animation-delay:${i * 45}ms">
        <a class="nw-row-media" href="${p.link}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
          ${p.img ? `<img class="nw-img nw-kb${i % 4}" src="${p.img}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
          <div class="nw-art"><span>${p.initial}</span></div>
          ${capHtml(p.sum || p.title)}
        </a>
        <div class="nw-row-body">
          <div class="nw-row-meta">
            ${p.kind ? `<span class="nw-row-note">${esc(p.kind)}</span>` : ''}
            <span class="nw-src">${p.src}</span>
            <span class="nw-row-age">${esc(ago(r.published_at))}</span>
          </div>
          <a class="nw-hl" href="${p.link}" target="_blank" rel="noopener"${p.orig}>${esc(p.title)}</a>${p.sum ? `<span class="nw-sr">${esc(p.sum)}</span>` : ''}
        </div>
      </article>`;
  }

  const regionName = (c) => {
    try { return new Intl.DisplayNames([siteLang() === 'pt' ? 'pt-BR' : siteLang()], { type: 'region' }).of(c); } catch (e) { return c; }
  };

  function fillPicker() {
    const cur = select.value;
    select.innerHTML = codes.map((c) => ({ c, n: regionName(c) })).sort((a, b) => a.n.localeCompare(b.n, siteLang()))
      .map((o) => `<option value="${esc(o.c)}">${esc(o.n)}</option>`).join('');
    if (cur) select.value = cur;
    select.setAttribute('aria-label', tr('Country'));
  }

  function draw(rows) {
    const cc = select.value;
    flag.src = `/assets/flags/${cc.toLowerCase()}.svg`;
    const present = Object.keys(KINDS).filter((k) => rows.some((r) => r.title_tr.ai === k));
    if (kind !== 'all' && !present.includes(kind)) kind = 'all';
    kindsBox.innerHTML = present.length > 1 ? ['all', ...present].map((k) => `<button type="button" class="aia-chip" aria-pressed="${k === kind}" data-kind="${k}">${esc(k === 'all' ? 'All' : KINDS[k])}</button>`).join('') : '';
    const list = rows.filter((r) => kind === 'all' || r.title_tr.ai === kind);
    spare = list.slice(SHOWN);
    const top = list.slice(0, SHOWN);
    topLabel.textContent = top.length >= SHOWN ? `${tr('Top 10')} · ${regionName(cc)}` : regionName(cc);
    feed.scrollTop = 0;
    if (!top.length) {
      lead.innerHTML = '';
      feed.innerHTML = '';
      wrap.hidden = true;
      empty.textContent = tr('No stories for this country right now.');
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    lead.innerHTML = leadHtml(top[0]);
    feed.innerHTML = top.slice(1).map((r, i) => rowHtml(r, i + 1)).join('');
    watch();
  }

  kindsBox.addEventListener('click', (e) => {
    const b = e.target.closest('.aia-chip');
    if (!b) return;
    kind = b.dataset.kind;
    if (cache[select.value]) draw(cache[select.value]);
  });

  function setPaused(card, paused) {
    card.classList.toggle('nw-paused', paused);
    const b = card.querySelector('.nw-pp');
    const label = tr(paused ? 'Play motion' : 'Pause motion');
    b.setAttribute('aria-pressed', String(paused));
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = paused ? ICON.play : ICON.pause;
  }
  mount.addEventListener('click', (e) => {
    const card = e.target.closest('.nw-card');
    if (!card || e.target.closest('a') || card.classList.contains('nw-row')) return;
    setPaused(card, !card.classList.contains('nw-paused'));
  });
  // Like World News, a story whose photo doesn't load is dropped and the next one moves up.
  mount.addEventListener('error', (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains('nw-img')) return;
    const card = img.closest('.nw-card');
    if (card.classList.contains('nw-row')) {
      card.remove();
      if (spare.length) { feed.insertAdjacentHTML('beforeend', rowHtml(spare.shift(), feed.children.length + 1)); watch(); }
      return;
    }
    card.classList.add('nw-noimg');
    img.remove();
  }, true);

  async function show(cc) {
    const mine = ++token;
    if (!cache[cc]) { lead.innerHTML = ''; feed.innerHTML = ''; wrap.hidden = false; empty.hidden = true; }
    try {
      cache[cc] = cache[cc] || await get(`news_ai?select=link,title,title_tr,source,published_at,image_url,fetched_at&country_code=eq.${encodeURIComponent(cc)}&image_url=like.https%3A%2F%2F*&title_tr->>ai=in.(${Object.keys(KINDS).join(',')})&order=rank.asc&limit=40`);
      if (mine !== token) return;
      const rows = cache[cc];
      draw(rows);
      asof.textContent = rows[0] ? `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC` : '';
    } catch (err) {
      if (mine !== token) return;
      console.error('AI widget:', err);
      kindsBox.innerHTML = '';
      lead.innerHTML = '';
      feed.innerHTML = '';
      wrap.hidden = true;
      empty.textContent = tr('AI news is unavailable right now.');
      empty.hidden = false;
      asof.textContent = '';
    }
  }

  function defaultCountry(codes) {
    let picked = null;
    try { picked = localStorage.getItem('lp-world-cc'); } catch (e) { /* no storage */ }
    if (picked && codes.includes(picked)) return picked;
    const fromLang = LANG_CC[siteLang()];
    if (fromLang && codes.includes(fromLang)) return fromLang;
    return codes.includes('US') ? 'US' : codes[0];
  }

  (async () => {
    try {
      const firsts = await get('news_ai?select=country_code&rank=eq.1');
      codes = [...new Set(firsts.map((r) => r.country_code))];
      if (!codes.length) throw new Error('no data');
      fillPicker();
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => { kind = 'all'; show(select.value); });
      document.addEventListener('lp:lang', () => { fillPicker(); if (cache[select.value]) draw(cache[select.value]); });
      await show(select.value);
    } catch (err) {
      if (err.message !== 'no data') console.error('AI widget:', err);
      mount.hidden = true;
    }
  })();
})();
