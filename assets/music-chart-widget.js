// Music Index widget. Standalone: mount with
//   <section id="yt-music" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/music-chart-widget.js" defer></script>
// Reads public.youtube_music_chart (filled hourly by scripts/music-chart-routine.js)
// with the publishable key. Hides itself if the data can't be loaded.
(function () {
  'use strict';
  const mount = document.getElementById('yt-music');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/music-chart-widget.css';
  document.head.appendChild(css);

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

  mount.className = 'ymu';
  mount.setAttribute('aria-label', 'YouTube trending music by country');
  mount.innerHTML = `
    <div class="ymu-head">
      <h2 class="ymu-title">Music Index</h2>
      <span class="ymu-sym">YT·MUSIC</span>
      <span class="ymu-spacer"></span>
      <select class="ymu-select" aria-label="Country"></select>
      <span class="ymu-asof"></span>
    </div>
    <div class="ymu-body"></div>
    <div class="ymu-foot">YouTube's own Trending chart for Music in each country, via the YouTube Data API. Refreshed hourly.</div>`;
  const select = mount.querySelector('.ymu-select');
  const body = mount.querySelector('.ymu-body');
  const asof = mount.querySelector('.ymu-asof');

  function show(rows) {
    const top = Math.max(...rows.map((r) => Number(r.view_count) || 0), 1);
    body.innerHTML = `
      <table class="ymu-table">
        <colgroup><col class="ymu-rank-col"><col><col class="ymu-vol-col"><col class="ymu-likes-col"></colgroup>
        <thead><tr><th>#</th><th>Track</th><th class="n">Views</th><th class="n ymu-likes">Likes</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><span class="ymu-rank">${String(r.rank).padStart(2, '0')}</span></td>
            <td><a class="ymu-video" href="https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}" target="_blank" rel="noopener">
              ${r.thumbnail_url ? `<img class="ymu-thumb" src="${esc(r.thumbnail_url)}" alt="" width="64" height="36" loading="lazy">` : '<span class="ymu-thumb"></span>'}
              <span class="ymu-text"><span class="ymu-vt" title="${esc(r.title)}">${esc(r.title)}</span><span class="ymu-ch">${esc(r.channel_title)}</span></span>
            </a></td>
            <td class="n ymu-vol"><span class="ymu-num">${fmt(r.view_count)}</span><div class="ymu-bar" style="width:${Math.max(4, Math.round((Number(r.view_count) || 0) / top * 100))}%"></div></td>
            <td class="n ymu-likes"><span class="ymu-num">${fmt(r.like_count)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    asof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
  }

  (async () => {
    try {
      const [rows, countries] = await Promise.all([
        get('youtube_music_chart?select=country_code,rank,video_id,title,channel_title,thumbnail_url,view_count,like_count,fetched_at&order=country_code,rank'),
        get('youtube_active_users?select=country_code,country_name&order=country_name'),
      ]);
      const byCountry = {};
      for (const r of rows) (byCountry[r.country_code] ||= []).push(r);
      const listed = countries.filter((c) => byCountry[c.country_code]);
      if (!listed.length) throw new Error('no data');
      const codes = listed.map((c) => c.country_code);
      select.innerHTML = listed.map((c) => `<option value="${esc(c.country_code)}">${esc(c.country_name)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => show(byCountry[select.value]));
      show(byCountry[select.value]);
    } catch (err) {
      console.error('Music Index widget:', err);
      mount.hidden = true;
    }
  })();
})();
