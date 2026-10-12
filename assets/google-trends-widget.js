// "Most Talked About, According to Google" widget. Reads the latest snapshot of
// Google Trends "Trending now" searches from public.google_trending (written hourly
// by scripts/google-trends-routine.js). Read-only; publishable key only.
// Mount: <section id="google-trending" data-supabase-url="…" data-supabase-key="…"></section>
//        <script src="/assets/google-trends-widget.js" defer></script>
(() => {
  'use strict';
  const mount = document.getElementById('google-trending');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey;
  if (!base || !key) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/google-trends-widget.css';
  document.head.appendChild(css);

  mount.className = 'gtt';
  mount.hidden = true;

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const r = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
  const flag = (code, names) => (/^[A-Z]{2}$/.test(code)
    ? `<img class="gtt-flag" src="/assets/flags/${code.toLowerCase()}.svg" width="16" height="12" alt="${esc(names[code] || code)}" title="${esc(names[code] || code)}">`
    : '');
  const volume = (r) => (r.traffic_min ? `${Number(r.traffic_min).toLocaleString('en-US')}+` : esc(r.approx_traffic || '–'));
  const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

  function row(r, max, names) {
    const trends = `https://trends.google.com/trends/explore?date=now%201-d&geo=${encodeURIComponent(r.top_country || '')}&q=${encodeURIComponent(r.query)}`;
    const news = safeUrl(r.news_url);
    const where = (r.countries || []).slice(0, 3).map((c) => flag(c, names)).join('');
    const more = (r.countries || []).length > 3 ? `<span class="gtt-more">+${r.countries.length - 3}</span>` : '';
    const pct = Math.max(4, Math.round(((Number(r.traffic_min) || 0) / max) * 100));
    return `<tr>
      <td><span class="gtt-rank">${String(r.rank).padStart(2, '0')}</span></td>
      <td>
        <div class="gtt-q"><a class="gtt-query" href="${esc(trends)}" target="_blank" rel="noopener">${esc(r.query)}</a>${r.is_creator ? '<span class="gtt-badge">YouTube creator</span>' : ''}</div>
        ${news ? `<a class="gtt-news" href="${esc(news)}" target="_blank" rel="noopener">${r.news_source ? `<b>${esc(r.news_source)}</b> · ` : ''}${esc(r.news_title || 'Top story')}</a>` : ''}
      </td>
      <td class="gtt-where">${where}${more}</td>
      <td class="n gtt-vol"><span class="gtt-num">${volume(r)}</span><div class="gtt-bar" style="width:${pct}%"></div></td>
    </tr>`;
  }

  Promise.all([
    get('google_trending?select=*&order=rank&limit=10'),
    get('youtube_active_users?select=country_code,country_name'),
  ]).then(([rows, countries]) => {
    if (!rows.length) return;
    const names = Object.fromEntries(countries.map((c) => [c.country_code, c.country_name]));
    const max = Math.max(1, ...rows.map((r) => Number(r.traffic_min) || 0));
    const asof = new Date(rows[0].fetched_at);
    mount.innerHTML = `
      <div class="gtt-head">
        <h2 class="gtt-title">Most Talked About, According to Google</h2>
        <span class="gtt-sym">GOOGLE·TRENDS</span>
        <span class="gtt-spacer"></span>
        ${Number.isNaN(asof.getTime()) ? '' : `<span class="gtt-asof">As of ${hhmm(asof)} UTC</span>`}
      </div>
      <table class="gtt-table">
        <colgroup><col class="gtt-rank-col"><col><col class="gtt-where-col"><col class="gtt-vol-col"></colgroup>
        <thead><tr><th>#</th><th>Search</th><th class="gtt-where">Trending in</th><th class="n">Searches</th></tr></thead>
        <tbody>${rows.map((r) => row(r, max, names)).join('')}</tbody>
      </table>
      <div class="gtt-foot">Google Trends "Trending now" searches across our ${countries.length} tracked countries, past 24 hours. Searches = Google's approximate volume in the top country. Refreshed hourly.</div>`;
    mount.hidden = false;
  }).catch(() => { mount.hidden = true; });
})();
