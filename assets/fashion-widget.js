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
      <div class="lp-attn-row fsh-attn" data-no-i18n hidden>
        <span class="lp-cs-nav fsh-bnav"><button type="button" class="lp-cs-arr" data-d="-1" aria-label="Previous brand">‹</button><span class="lp-cs-grp"><span class="lp-cs-name" aria-hidden="true"></span><span class="lp-cs-pos" aria-hidden="true"></span><select class="lp-cs-sel" aria-label="Brand"></select></span><button type="button" class="lp-cs-arr" data-d="1" aria-label="Next brand">›</button></span>
        <div class="lp-attn-txt"></div><div class="lp-attn-plot"></div>
      </div>
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
  // News share of 14 fashion brands and magazines, one chart at a time (GDELT, saved weekly by scripts/news-coverage-routine.js).
  const attn = mount.querySelector('.fsh-attn');
  const bsel = attn.querySelector('select');
  const BRANDS = ['Vogue', 'ELLE', "Harper's Bazaar", 'GQ', 'Chanel', 'Dior', 'Louis Vuitton', 'Hermès', 'Gucci', 'Prada', 'Burberry', 'Versace', 'Zara', 'Uniqlo'];
  let brandRows = null, brands = [];
  const brandData = () => (brandRows = brandRows || fetch(`${base}/rest/v1/brand_coverage_monthly?select=brand,month,share&brand=in.(${encodeURIComponent(BRANDS.map((n) => `"${n}"`).join(','))})&order=month.asc`, { headers })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []).then((rows) => {
      const by = {};
      for (const r of rows) (by[r.brand] = by[r.brand] || []).push({ m: r.month.slice(0, 7), v: Number(r.share) });
      return by;
    }));
  async function showBrand() {
    const A = window.LP_ATTN;
    const by = await brandData();
    brands = BRANDS.filter((b) => (by[b] || []).length >= 2 && A && A.change(by[b]) != null);
    if (!brands.length) { attn.hidden = true; return; }
    if (bsel.options.length !== brands.length) bsel.innerHTML = brands.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    if (!brands.includes(bsel.value)) bsel.value = brands[0];
    const name = bsel.value, pts = by[name], yr = pts.slice(-12), lang = siteLang();
    attn.querySelector('.lp-cs-name').textContent = name;
    attn.querySelector('.lp-cs-pos').innerHTML = `<span>${brands.indexOf(name) + 1}/${brands.length}</span>`;
    const mention = (p) => (p && p.v > 0 ? tr('1 in {n} news stories worldwide mention {c}').replace('{n}', Math.round(100 / p.v).toLocaleString(lang)).replace('{c}', name) : '');
    const label = tr('Fashion Share: {c}').replace('{c}', name);
    attn.querySelector('.lp-attn-txt').innerHTML = `<b>${esc(label)}</b><strong>${A.badge(A.change(pts))}<small>${esc(tr('vs last year'))}</small></strong>`;
    const plot = attn.querySelector('.lp-attn-plot');
    plot.innerHTML = A.chart(yr, { label, axis: true }) + '<span class="lp-attn-cap"></span>';
    const cap = plot.querySelector('.lp-attn-cap');
    const show = (p) => { const t = mention(p); cap.innerHTML = `<b>${esc(A.month(p.m))}</b>${t ? ` · ${esc(t)}` : ''}`; };
    show(yr[yr.length - 1]);
    A.pick(plot, yr.length, (i) => show(yr[i]));
    attn.hidden = false;
  }
  bsel.addEventListener('change', showBrand);
  attn.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    const k = brands.indexOf(bsel.value);
    if (k < 0) return;
    bsel.value = brands[(k + Number(b.dataset.d) + brands.length) % brands.length];
    showBrand();
  }));
  const SHOWN = 10;
  const vcache = {};
  let videoCodes = [];
  let token = 0;
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);

  function videos(rows) {
    const ids = rows.map((r) => r.video_id);
    const top = Math.max(1, ...rows.map((r) => Number(r.views_per_hour) || 0));
    const from = (r) => (r.channel_country && r.channel_country !== r.country_code ? ` · ${esc(regionName(r.channel_country))}` : '');
    return `<div class="ytt-cards">${rows.slice(0, 5).map((r) => `<a class="ytt-card" href="${watch(r.video_id, ids)}" target="_blank" rel="noopener">
        <span class="ytt-cth"><img src="${thumb(r.video_id)}" alt="" loading="lazy"><b class="ytt-crk">${pad(r.rank)}</b><i class="ytt-cvw">${vph(r.views_per_hour)}/h</i></span>
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
        showBrand();
      });
      show(select.value);
      showBrand();
    } catch (err) {
      if (err.message !== 'no data') console.error('Fashion widget:', err);
      mount.hidden = true;
    }
  })();
})();
