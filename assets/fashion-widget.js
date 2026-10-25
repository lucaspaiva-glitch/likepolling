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
  mount.setAttribute('aria-label', 'Fashion videos and news by country');
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
      <div class="fsh-body"></div>
      <p class="ytt-foot">Fashion stories from the last 2 days on Google News in the chosen country, in its language. AI (Google Gemini) checks that each one is about fashion and translates the headline; hover over it to see the original. Only stories with the article's own photo are shown. Updated twice a day.</p>
    </section>`;
  const select = mount.querySelector('.fsh-select');
  const body = mount.querySelector('.fsh-body');
  const asof = mount.querySelector('.fsh-nasof');
  const vcard = mount.querySelector('.fsh-vcard');
  const vbody = mount.querySelector('.fsh-vbody');
  const vasof = mount.querySelector('.fsh-vasof');
  const follow = mount.querySelector('.fsh-follow');
  const cache = {};
  const vcache = {};
  let videoCodes = [];
  let token = 0;

  // Hide photos that fail to load in this browser.
  mount.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.closest('.fsh-media')?.classList.add('fsh-noimg');
  }, true);

  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return '';
    const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
    const rtf = new Intl.RelativeTimeFormat(siteLang(), { numeric: 'always', style: siteLang().startsWith('en') ? 'narrow' : 'short' });
    if (mins < 60) return rtf.format(-mins, 'minute');
    if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  }

  function story(r, cls) {
    const shown = (r.title_tr && r.title_tr[dataLang(siteLang())]) || r.title;
    const orig = shown !== r.title ? ` title="${esc(r.title)}"` : '';
    return `<article class="${cls}">
      <a class="fsh-media" href="${esc(r.link)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
        <img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc((r.source || '?').slice(0, 1))}</span></a>
      <div class="fsh-text">
        <div class="fsh-meta"><span class="fsh-src" data-no-i18n>${esc(r.source || '')}</span><span class="fsh-age">${esc(ago(r.published_at))}</span></div>
        <a class="fsh-hl" href="${esc(r.link)}" target="_blank" rel="noopener" data-no-i18n${orig}>${esc(shown)}</a>
      </div></article>`;
  }

  function draw(rows) {
    if (!rows.length) { body.innerHTML = '<div class="ytt-empty">No fashion news for this country right now.</div>'; return; }
    body.innerHTML = `<div class="fsh-grid">${story(rows[0], 'fsh-lead')}
      <div class="fsh-list">${rows.slice(1, 5).map((r) => story(r, 'fsh-row')).join('')}</div></div>
      ${rows.length > 5 ? `<div class="fsh-more">${rows.slice(5).map((r) => story(r, 'fsh-tile')).join('')}</div>` : ''}`;
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
    if (!cache[cc]) body.innerHTML = '';
    try {
      cache[cc] = cache[cc] || await get(`news_fashion?select=link,title,title_tr,source,published_at,image_url,fetched_at&country_code=eq.${encodeURIComponent(cc)}&image_url=like.https%3A%2F%2F*&title_tr->>fashion=eq.true&order=rank.asc&limit=${SHOWN}`);
      if (mine !== token) return;
      const rows = cache[cc];
      draw(rows);
      asof.textContent = rows[0] ? `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC` : '';
    } catch (err) {
      if (mine !== token) return;
      console.error('Fashion widget:', err);
      body.innerHTML = '<div class="ytt-empty">Fashion news is unavailable right now.</div>';
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
