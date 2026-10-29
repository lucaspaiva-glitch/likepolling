// Fashion widget: Fashion Index (fastest recent uploads of tracked fashion channels,
// scripts/fashion-videos-routine.js) + Fashion News (Google News headlines checked
// and translated by AI, scripts/news-fashion-routine.js).
//   <section id="fashion" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
// Reads public.fashion_videos / news_fashion with the publishable key. Hides itself if there is no data.
(function () {
  'use strict';
  const mount = document.getElementById('fashion');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;
  if (!document.querySelector('link[href="/assets/fashion-widget.css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/assets/fashion-widget.css';
    document.head.appendChild(css);
  }

  const SHOWN = 10;
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n) => (n == null || isNaN(n) ? '—' : compact.format(Number(n)));
  const pad = (n) => String(n).padStart(2, '0');
  const watch = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const thumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
  const regionName = (cc) => { try { return new Intl.DisplayNames([siteLang()], { type: 'region' }).of(cc); } catch { return cc; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const dataLang = (l) => (l === 'en-GB' ? 'en' : l);
  async function get(path) {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  mount.classList.add('fsh');
  mount.setAttribute('aria-label', 'Fashion: fashion videos and fashion news in each country');
  mount.innerHTML = `
    <div class="fsh-top"><div><h2 class="fsh-h">Fashion</h2><p class="fsh-p">Fashion videos and headlines from each country, in your language.</p></div>
      <select class="ytt-select fsh-select" aria-label="Country"></select></div>
    <section class="ytt fsh-card fsh-vcard" hidden>
      <div class="ytt-head"><h3 class="ytt-title">Fashion Index</h3><span class="ytt-sym">FIX</span><span class="ytt-spacer"></span><span class="ytt-asof fsh-vasof"></span></div>
      <div class="fsh-vbody"></div>
      <p class="ytt-foot fsh-follow" hidden>Portugal follows fashion from Italy, Spain, France and the UK, so these are the top videos from their channels.</p>
      <p class="ytt-foot">Fastest-growing uploads of the last 30 days from the fashion magazines, brands and fashion weeks we track in this country, at most 2 per channel. Speed = views per hour since upload. Refreshed twice a day.</p>
      <p class="ytt-foot">Countries with fewer than 5 videos look back 60 days, with up to 3 per channel.</p>
    </section>
    <section class="ytt fsh-card">
      <div class="ytt-head"><h3 class="ytt-title">Fashion News</h3><span class="ytt-sym">FSH</span><span class="ytt-spacer"></span><span class="ytt-asof fsh-nasof"></span></div>
      <p class="ytt-empty fsh-empty" hidden></p>
      <div class="nw-front nw-ranked fsh-wire"><div class="nw-feed-wrap"><div class="nw-lead" data-no-i18n></div><div class="nw-feed" data-no-i18n></div></div></div>
      <p class="ytt-foot">Fashion stories from the last 2 days on Google News in the chosen country, in its language. AI (Google Gemini) checks that each one is about fashion and translates the headline; hover over it to see the original. Only stories with the article's own photo are shown. Updated twice a day.</p>
    </section>`;
  const select = mount.querySelector('.fsh-select');
  const empty = mount.querySelector('.fsh-empty');
  const wrap = mount.querySelector('.fsh-wire .nw-feed-wrap');
  const lead = mount.querySelector('.fsh-wire .nw-lead');
  const feed = mount.querySelector('.fsh-wire .nw-feed');
  const asof = mount.querySelector('.fsh-nasof');
  const vcard = mount.querySelector('.fsh-vcard');
  const vbody = mount.querySelector('.fsh-vbody');
  const vasof = mount.querySelector('.fsh-vasof');
  const follow = mount.querySelector('.fsh-follow');
  const cache = {};
  const vcache = {};
  let videoCodes = [];
  let token = 0;
  let spare = [];
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const ICON = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h9v9M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Pan-and-zoom (and the summary over the photo) run only while a card is on screen.
  const motion = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('nw-on', e.isIntersecting)), { threshold: 0.6 })
    : null;
  const watchCards = () => mount.querySelectorAll('.fsh-wire .nw-card:not([data-w])').forEach((c) => {
    c.dataset.w = '1';
    if (motion) motion.observe(c); else c.classList.add('nw-on');
  });

  // Like World News, a story whose photo doesn't load is dropped and the next one moves up.
  mount.addEventListener('error', (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains('nw-img')) return;
    const card = img.closest('.nw-card');
    if (card.classList.contains('nw-row')) {
      card.remove();
      if (spare.length) { feed.insertAdjacentHTML('beforeend', rowHtml(spare.shift(), feed.children.length + 1)); watchCards(); }
      return;
    }
    card.classList.add('nw-noimg');
    img.remove();
  }, true);
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
    const card = e.target.closest('.fsh-wire .nw-card');
    if (!card || e.target.closest('a') || card.classList.contains('nw-row')) return;
    setPaused(card, !card.classList.contains('nw-paused'));
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

  // Same ranked cards as World News Wire (news-wire-widget.css): 01 is the big photo card,
  // 02–10 photo cards that shrink step by step. Its summary player also plays these captions.
  function parts(r) {
    const t = r.title_tr || {};
    const l = dataLang(siteLang());
    const title = t[l] || r.title;
    const src = String(r.source || 'Google News').trim();
    return {
      title,
      orig: title !== r.title ? ` title="${esc(r.title)}"` : '',
      sum: (t.sum && t.sum[l]) || '',
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
            <span class="nw-src">${p.src}</span>
            <span class="nw-row-age">${esc(ago(r.published_at))}</span>
          </div>
          <a class="nw-hl" href="${p.link}" target="_blank" rel="noopener"${p.orig}>${esc(p.title)}</a>${p.sum ? `<span class="nw-sr">${esc(p.sum)}</span>` : ''}
        </div>
      </article>`;
  }

  function showEmpty(msg) {
    lead.innerHTML = '';
    feed.innerHTML = '';
    wrap.hidden = true;
    empty.textContent = msg;
    empty.hidden = false;
  }

  function draw(rows) {
    if (!rows.length) { showEmpty('No fashion news for this country right now.'); return; }
    empty.hidden = true;
    wrap.hidden = false;
    spare = rows.slice(SHOWN);
    feed.scrollTop = 0;
    lead.innerHTML = leadHtml(rows[0]);
    feed.innerHTML = rows.slice(1, SHOWN).map((r, i) => rowHtml(r, i + 1)).join('');
    watchCards();
  }

  function videos(rows) {
    const top = Math.max(1, ...rows.map((r) => Number(r.views_per_hour) || 0));
    const from = (r) => (r.channel_country && r.channel_country !== r.country_code ? ` · ${esc(regionName(r.channel_country))}` : '');
    return `<div class="ytt-cards">${rows.slice(0, 5).map((r) => `<a class="ytt-card" href="${watch(r.video_id)}" target="_blank" rel="noopener">
        <span class="ytt-cth"><img src="${thumb(r.video_id)}" alt="" loading="lazy"><b class="ytt-crk">${pad(r.rank)}</b><i class="ytt-cvw">${fmt(r.views_per_hour)}/h</i></span>
        <span class="ytt-ctt" title="${esc(r.title)}" data-no-i18n>${esc(r.title)}</span><span class="ytt-cch" data-no-i18n>${esc(r.channel_title)}${from(r)}</span></a>`).join('')}</div>
      ${rows.length > 5 ? `<table class="ytt-table"><colgroup><col class="ytt-rank-col"><col><col class="ytt-vol-col"><col class="ytt-likes-col"></colgroup>
        <thead><tr><th>#</th><th>Video</th><th class="n">Speed</th><th class="n ytt-likes">Views</th></tr></thead>
        <tbody>${rows.slice(5).map((r) => `<tr><td><span class="ytt-rank">${pad(r.rank)}</span></td>
          <td><a class="ytt-video" href="${watch(r.video_id)}" target="_blank" rel="noopener"><span class="lp-rth" style="--i:${r.rank - 6}"><img src="${thumb(r.video_id)}" alt="" loading="lazy"><b>${pad(r.rank)}</b></span>
            <span class="ytt-text"><span class="ytt-vt" title="${esc(r.title)}" data-no-i18n>${esc(r.title)}</span><span class="ytt-ch" data-no-i18n>${esc(r.channel_title)}${from(r)}</span></span></a></td>
          <td class="n ytt-vol"><span class="ytt-num">${fmt(r.views_per_hour)}/h</span><div class="ytt-bar" style="width:${Math.max(4, Math.round((Number(r.views_per_hour) || 0) / top * 100))}%"></div></td>
          <td class="n ytt-likes"><span class="ytt-num">${fmt(r.view_count)}</span></td></tr>`).join('')}</tbody></table>` : ''}`;
  }

  async function showVideos(cc) {
    const mine = token;
    if (!videoCodes.includes(cc)) { vcard.hidden = true; return; }
    vcard.hidden = false;
    follow.hidden = cc !== 'PT';
    if (!vcache[cc]) vbody.innerHTML = '';
    try {
      vcache[cc] = vcache[cc] || await get(`fashion_videos?select=rank,video_id,title,channel_title,channel_country,country_code,view_count,views_per_hour,fetched_at&country_code=eq.${encodeURIComponent(cc)}&order=rank&limit=${SHOWN}`);
      if (mine !== token) return;
      const rows = vcache[cc];
      if (!rows.length) { vcard.hidden = true; return; }
      vbody.innerHTML = videos(rows);
      vasof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
    } catch (err) {
      if (mine !== token) return;
      console.error('Fashion widget:', err);
      vcard.hidden = true;
    }
  }

  async function show(cc) {
    const mine = ++token;
    showVideos(cc);
    if (!cache[cc]) { lead.innerHTML = ''; feed.innerHTML = ''; wrap.hidden = false; empty.hidden = true; }
    try {
      cache[cc] = cache[cc] || await get(`news_fashion?select=link,title,title_tr,source,published_at,image_url,fetched_at&country_code=eq.${encodeURIComponent(cc)}&image_url=like.https%3A%2F%2F*&title_tr->>fashion=eq.true&order=rank.asc&limit=${SHOWN * 2}`);
      if (mine !== token) return;
      const rows = cache[cc];
      draw(rows);
      asof.textContent = rows[0] ? `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC` : '';
    } catch (err) {
      if (mine !== token) return;
      console.error('Fashion widget:', err);
      showEmpty('Fashion news is unavailable right now.');
      asof.textContent = '';
    }
  }

  function defaultCountry(codes) {
    const fromLang = { en: 'US', 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'ES', de: 'DE', uk: 'UA', ko: 'KR', ja: 'JP' }[siteLang()];
    if (fromLang && codes.includes(fromLang)) return fromLang;
    for (const l of navigator.languages || [navigator.language || '']) {
      const region = (l.split('-')[1] || '').toUpperCase();
      if (codes.includes(region)) return region;
    }
    return codes.includes('US') ? 'US' : codes[0];
  }

  (async () => {
    try {
      const [firsts, vfirsts] = await Promise.all([
        get('news_fashion?select=country_code&rank=lte.3&title_tr->>fashion=eq.true').catch(() => []),
        get('fashion_videos?select=country_code&rank=eq.1').catch(() => []),
      ]);
      videoCodes = vfirsts.map((r) => r.country_code);
      const codes = [...new Set([...firsts.map((r) => r.country_code), ...videoCodes])];
      if (!codes.length) throw new Error('no data');
      const names = await get(`youtube_active_users?select=country_code,country_name&country_code=in.(${codes.join(',')})`).catch(() => []);
      const name = Object.fromEntries(names.map((n) => [n.country_code, n.country_name]));
      const list = codes.map((c) => [c, name[c] || c]).sort((a, b) => a[1].localeCompare(b[1]));
      select.innerHTML = list.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => show(select.value));
      document.addEventListener('lp:lang', () => {
        if (cache[select.value]) draw(cache[select.value]);
        if (vcache[select.value] && vcache[select.value].length) vbody.innerHTML = videos(vcache[select.value]);
      });
      await show(select.value);
    } catch (err) {
      if (err.message !== 'no data') console.error('Fashion widget:', err);
      mount.hidden = true;
    }
  })();
})();
