// YouTube Trending Index widget. Standalone: mount with
//   <section id="yt-trending" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/trending-widget.js" defer></script>
// Reads public.youtube_trending (filled by scripts/trending-routine.js) with the
// publishable key. Hides itself if the data can't be loaded.
(function () {
  'use strict';
  const mount = document.getElementById('yt-trending');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/trending-widget.css';
  // Linked in index.html <head> so the layout is right on first paint; added here only if missing.
  if (!document.querySelector('link[href="/assets/trending-widget.css"]')) document.head.appendChild(css);

  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n) => (n == null || isNaN(n) ? '—' : compact.format(Number(n)));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  async function get(path) {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function defaultCountry(codes) {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (const l of langs) {
      const region = (l.split('-')[1] || '').toUpperCase();
      if (codes.includes(region)) return region;
    }
    return codes.includes('US') ? 'US' : codes[0];
  }

  mount.className = 'ytt';
  mount.setAttribute('aria-label', 'YouTube trending videos by country');
  mount.innerHTML = `
    <div class="ytt-head">
      <h2 class="ytt-title">Trending Index</h2>
      <span class="ytt-sym">YT·TOP10</span>
      <span class="ytt-spacer"></span>
      <select class="ytt-select" aria-label="Country"></select>
      <span class="ytt-asof"></span>
    </div>
    <div class="ytt-body"></div>
    <div class="ytt-foot">YouTube's own Trending chart for each country, via the YouTube Data API. Refreshed hourly.</div>`;
  const select = mount.querySelector('.ytt-select');
  const body = mount.querySelector('.ytt-body');
  const asof = mount.querySelector('.ytt-asof');
  let token = 0;

  async function show(code) {
    const mine = ++token;
    try {
      const rows = await get(`youtube_trending?select=rank,video_id,title,channel_title,thumbnail_url,view_count,like_count,published_at,fetched_at&country_code=eq.${encodeURIComponent(code)}&order=rank`);
      if (mine !== token) return;
      if (!rows.length) {
        body.innerHTML = '<div class="ytt-empty">No trending data for this country yet.</div>';
        asof.textContent = '';
        return;
      }
      const top = Math.max(...rows.map((r) => Number(r.view_count) || 0), 1);
      body.innerHTML = `
        <div class="ytt-cards">${rows.slice(0, 5).map((r) => `<a class="ytt-card" href="https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}" target="_blank" rel="noopener">
            <span class="ytt-cth"><img src="https://i.ytimg.com/vi/${encodeURIComponent(r.video_id)}/mqdefault.jpg" alt="" loading="lazy"><b class="ytt-crk">${String(r.rank).padStart(2, '0')}</b><i class="ytt-cvw">${fmt(r.view_count)}</i>${window.lpVph && lpVph(r.view_count, r.published_at, r.fetched_at) != null ? `<i class="lp-vph">${fmt(lpVph(r.view_count, r.published_at, r.fetched_at))}/h</i>` : ''}</span>
            <span class="ytt-ctt" title="${esc(r.title)}">${esc(r.title)}</span>
            <span class="ytt-cch">${esc(r.channel_title)}</span></a>`).join('')}</div>
        ${rows.length > 5 ? `<table class="ytt-table">
          <colgroup><col class="ytt-rank-col"><col><col class="ytt-vol-col"><col class="ytt-likes-col"></colgroup>
          <thead><tr><th>#</th><th>Video</th><th class="n">Views</th><th class="n ytt-likes">Likes</th></tr></thead>
          <tbody>${rows.slice(5).map((r) => `
            <tr>
              <td><span class="ytt-rank">${String(r.rank).padStart(2, '0')}</span></td>
              <td><a class="ytt-video" href="https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}" target="_blank" rel="noopener">
                <span class="lp-rth"><img src="https://i.ytimg.com/vi/${encodeURIComponent(r.video_id)}/mqdefault.jpg" alt="" loading="lazy"><b>${String(r.rank).padStart(2, '0')}</b></span>
                <span class="ytt-text"><span class="ytt-vt" title="${esc(r.title)}">${esc(r.title)}</span><span class="ytt-ch">${esc(r.channel_title)}</span></span>
              </a></td>
              <td class="n ytt-vol"><span class="ytt-num">${fmt(r.view_count)}</span>${window.lpVph && lpVph(r.view_count, r.published_at, r.fetched_at) != null ? `<span class="lp-vph-t">${fmt(lpVph(r.view_count, r.published_at, r.fetched_at))}/h</span>` : ''}<div class="ytt-bar" style="width:${Math.max(4, Math.round((Number(r.view_count) || 0) / top * 100))}%"></div></td>
              <td class="n ytt-likes"><span class="ytt-num">${fmt(r.like_count)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>` : ''}`;
      asof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
    } catch (err) {
      if (mine !== token) return;
      console.error('Trending widget:', err);
      body.innerHTML = '<div class="ytt-empty">Trending data is unavailable right now.</div>';
      asof.textContent = '';
    }
  }

  (async () => {
    try {
      const countries = await get('youtube_active_users?select=country_code,country_name&order=country_name');
      if (!countries.length) throw new Error('no countries');
      const codes = countries.map((c) => c.country_code);
      select.innerHTML = countries.map((c) => `<option value="${esc(c.country_code)}">${esc(c.country_name)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => show(select.value));
      await show(select.value);
    } catch (err) {
      console.error('Trending widget:', err);
      mount.hidden = true;
    }
  })();
})();
