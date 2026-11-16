// Fashion widget: Fashion Index (fastest recent uploads of tracked fashion channels,
// scripts/fashion-videos-routine.js) and brand news share.
//   <section id="fashion" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
// Reads public.fashion_videos with the publishable key. Hides itself if there is no data.
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

  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n) => (n == null || isNaN(n) ? '—' : compact.format(Number(n)));
  const pad = (n) => String(n).padStart(2, '0');
  // Opens the whole list as a YouTube quick playlist (no login), starting at the clicked video.
  const watch = (id, ids) => { const i = Math.max(0, ids.indexOf(id)); return `https://www.youtube.com/watch_videos?video_ids=${ids.slice(i).concat(ids.slice(0, i)).slice(0, 50).map(encodeURIComponent).join(',')}`; };
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
  mount.setAttribute('aria-label', 'Fashion: fashion videos in each country');
  mount.innerHTML = `
    <div class="fsh-top"><div><h2 class="fsh-h">Fashion</h2></div>
      <select class="ytt-select fsh-select" aria-label="Country"></select></div>
    <section class="ytt fsh-card fsh-vcard" hidden>
      <div class="ytt-head"><h3 class="ytt-title">Fashion Index</h3><span class="ytt-sym">FIX</span><span class="ytt-spacer"></span><span class="ytt-asof fsh-vasof"></span></div>
      <div class="fsh-vbody"></div>
      <p class="ytt-foot fsh-follow" hidden>Portugal follows fashion from Italy, Spain, France and the UK, so these are the top videos from their channels.</p>
      <p class="ytt-foot">Fastest-growing uploads of the last 30 days from the fashion magazines, brands and fashion weeks we track in this country, at most 2 per channel. Speed = views per hour since upload. Refreshed twice a day.</p>
      <p class="ytt-foot">Countries with fewer than 5 videos look back 60 days, with up to 3 per channel.</p>
    </section>`;
  const select = mount.querySelector('.fsh-select');
  const vcard = mount.querySelector('.fsh-vcard');
  const vbody = mount.querySelector('.fsh-vbody');
  const vasof = mount.querySelector('.fsh-vasof');
  const follow = mount.querySelector('.fsh-follow');
  const SHOWN = 10;
  const vcache = {};
  let videoCodes = [];
  let token = 0;
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);

  function videos(rows) {
    const ids = rows.map((r) => r.video_id);
    const top = Math.max(1, ...rows.map((r) => Number(r.views_per_hour) || 0));
    const from = (r) => (r.channel_country && r.channel_country !== r.country_code ? ` · ${esc(regionName(r.channel_country))}` : '');
    return `<div class="ytt-cards">${rows.map((r, i) => `<a class="ytt-card${i > 4 ? ' lp-more' : ''}" style="--i:${i}" href="${watch(r.video_id, ids)}" target="_blank" rel="noopener">
        <span class="ytt-cth"><img src="${thumb(r.video_id)}" alt="" loading="lazy"><b class="ytt-crk">${pad(r.rank)}</b><i class="ytt-cvw">${fmt(r.view_count)}</i><i class="lp-vph">${vph(r.views_per_hour)}/h</i></span>
        <span class="ytt-ctt" title="${esc(r.title)}" data-no-i18n>${esc(r.title)}</span><span class="ytt-cch" data-no-i18n>${esc(r.channel_title)}${from(r)}</span></a>`).join('')}</div>
      ${rows.length > 5 ? `<table class="ytt-table"><colgroup><col class="ytt-rank-col"><col><col class="ytt-vol-col"><col class="ytt-likes-col"></colgroup>
        <thead><tr><th>#</th><th>Video</th><th class="n">Speed</th><th class="n ytt-likes">Views</th></tr></thead>
        <tbody>${rows.slice(5).map((r) => `<tr><td><span class="ytt-rank">${pad(r.rank)}</span></td>
          <td><a class="ytt-video" href="${watch(r.video_id, ids)}" target="_blank" rel="noopener"><span class="lp-rth" style="--i:${r.rank - 6}"><img src="${thumb(r.video_id)}" alt="" loading="lazy"><b>${pad(r.rank)}</b></span>
            <span class="ytt-text"><span class="ytt-vt" title="${esc(r.title)}" data-no-i18n>${esc(r.title)}</span><span class="ytt-ch" data-no-i18n>${esc(r.channel_title)}${from(r)}</span></span></a></td>
          <td class="n ytt-vol"><span class="ytt-num">${vph(r.views_per_hour)}/h</span><div class="ytt-bar" style="width:${Math.max(4, Math.round((Number(r.views_per_hour) || 0) / top * 100))}%"></div></td>
          <td class="n ytt-likes"><span class="ytt-num">${fmt(r.view_count)}</span></td></tr>`).join('')}</tbody></table>` : ''}`;
  }

  // Loads (once) a country's rows; preload() fetches the countries either side of the one shown,
  // so a swipe or a step in the picker draws at once instead of showing an empty box.
  const pending = {};
  const once = (key, url, store, cc) => store[cc] ? Promise.resolve(store[cc])
    : (pending[key] ||= get(url).then((r) => (store[cc] = r), (e) => { delete pending[key]; throw e; }));
  const vph = (v) => ((Number(v) || 0) < 1 ? '<1' : fmt(v));
  const videosFor = (cc) => once(`v${cc}`, `fashion_videos?select=rank,video_id,title,channel_title,channel_country,country_code,view_count,views_per_hour,fetched_at&country_code=eq.${encodeURIComponent(cc)}&order=rank&limit=${SHOWN}`, vcache, cc);
  function preload(cc) {
    const list = [...select.options].map((o) => o.value), k = list.indexOf(cc);
    if (k < 0 || list.length < 2) return;
    for (const n of new Set([list[(k + 1) % list.length], list[(k - 1 + list.length) % list.length]])) {
      if (videoCodes.includes(n)) videosFor(n).catch(() => {});
    }
  }

  async function showVideos(cc) {
    const mine = token;
    if (!videoCodes.includes(cc)) { vcard.hidden = true; return; }
    vcard.hidden = false;
    follow.hidden = cc !== 'PT';
    if (!vcache[cc]) vbody.innerHTML = '';
    try {
      vcache[cc] = await videosFor(cc);
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

  function show(cc) {
    ++token;
    showVideos(cc);
    preload(cc);
  }

  function defaultCountry(codes) {
    if (window.LP_CC) return window.LP_CC(codes);
    const fromLang = { en: 'US', 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'ES', de: 'DE', uk: 'UA', ko: 'KR', ja: 'JP', fr: 'FR', zh: 'CN', hi: 'IN' }[siteLang()];
    if (fromLang && codes.includes(fromLang)) return fromLang;
    for (const l of navigator.languages || [navigator.language || '']) {
      const region = (l.split('-')[1] || '').toUpperCase();
      if (codes.includes(region)) return region;
    }
    return codes.includes('US') ? 'US' : codes[0];
  }

  (async () => {
    try {
      const vfirsts = await get('fashion_videos?select=country_code&rank=eq.1').catch(() => []);
      videoCodes = vfirsts.map((r) => r.country_code);
      const codes = [...new Set(videoCodes)];
      if (!codes.length) throw new Error('no data');
      const names = await get(`youtube_active_users?select=country_code,country_name&country_code=in.(${codes.join(',')})`).catch(() => []);
      const name = Object.fromEntries(names.map((n) => [n.country_code, n.country_name]));
      const list = codes.map((c) => [c, name[c] || regionName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
      select.innerHTML = list.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => show(select.value));
      document.addEventListener('lp:lang', () => {
        if (vcache[select.value] && vcache[select.value].length) vbody.innerHTML = videos(vcache[select.value]);
      });
      show(select.value);
    } catch (err) {
      if (err.message !== 'no data') console.error('Fashion widget:', err);
      mount.hidden = true;
    }
  })();
})();
