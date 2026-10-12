// "Most Viewed This Month" widget. Standalone: mount with
//   <section id="yt-monthly" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/monthly-top-widget.js" defer></script>
// Reads public.youtube_monthly_top (filled daily by scripts/monthly-top-routine.js)
// with the publishable key. Hides itself if the data can't be loaded.
(function () {
  'use strict';
  const mount = document.getElementById('yt-monthly');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/monthly-top-widget.css';
  document.head.appendChild(css);

  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n) => (n == null || isNaN(n) ? '—' : compact.format(Number(n)));
  const day = (s, opts) => new Date(s).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
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

  mount.className = 'ymt';
  mount.setAttribute('aria-label', 'Most viewed YouTube videos this month by country');
  mount.innerHTML = `
    <div class="ymt-head">
      <h2 class="ymt-title">Most Viewed This Month</h2>
      <span class="ymt-sym">YT·MONTH</span>
      <span class="ymt-spacer"></span>
      <select class="ymt-select" aria-label="Country"></select>
      <span class="ymt-asof"></span>
    </div>
    <div class="ymt-body"></div>
    <div class="ymt-foot"></div>`;
  const select = mount.querySelector('.ymt-select');
  const body = mount.querySelector('.ymt-body');
  const asof = mount.querySelector('.ymt-asof');
  const foot = mount.querySelector('.ymt-foot');

  function show(rows) {
    const top = Math.max(...rows.map((r) => Number(r.view_count) || 0), 1);
    body.innerHTML = `
      <table class="ymt-table">
        <colgroup><col class="ymt-rank-col"><col><col class="ymt-vol-col"><col class="ymt-date-col"></colgroup>
        <thead><tr><th>#</th><th>Video</th><th class="n">Views</th><th class="n ymt-date">Uploaded</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><span class="ymt-rank">${String(r.rank).padStart(2, '0')}</span></td>
            <td><a class="ymt-video" href="https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}" target="_blank" rel="noopener">
              ${r.thumbnail_url ? `<img class="ymt-thumb" src="${esc(r.thumbnail_url)}" alt="" width="64" height="36" loading="lazy">` : '<span class="ymt-thumb"></span>'}
              <span class="ymt-text"><span class="ymt-vt" title="${esc(r.title)}">${esc(r.title)}</span><span class="ymt-ch">${esc(r.channel_title)}</span></span>
            </a></td>
            <td class="n ymt-vol"><span class="ymt-num">${fmt(r.view_count)}</span><div class="ymt-bar" style="width:${Math.max(4, Math.round((Number(r.view_count) || 0) / top * 100))}%"></div></td>
            <td class="n ymt-date"><span class="ymt-num">${r.published_at ? esc(day(r.published_at, { month: 'short', day: 'numeric' })) : '—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    asof.textContent = `As of ${day(rows[0].fetched_at, { month: 'short', day: 'numeric' })}, ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
    foot.textContent = `Videos uploaded since ${day(rows[0].period_start, { month: 'long', day: 'numeric' })} in the country's main language, by YouTube view count, via the YouTube Data API. Refreshed daily.`;
  }

  (async () => {
    try {
      const rows = await get('youtube_monthly_top?select=country_code,rank,video_id,title,channel_title,thumbnail_url,view_count,published_at,period_start,fetched_at&order=country_code,rank');
      if (!rows.length) throw new Error('no data');
      const byCountry = {};
      for (const r of rows) (byCountry[r.country_code] ||= []).push(r);
      const codes = Object.keys(byCountry);
      const names = await get(`youtube_active_users?select=country_code,country_name&country_code=in.(${codes.map(encodeURIComponent).join(',')})`).catch(() => []);
      const nameOf = Object.fromEntries(names.map((n) => [n.country_code, n.country_name]));
      codes.sort((a, b) => (nameOf[a] || a).localeCompare(nameOf[b] || b));
      select.innerHTML = codes.map((c) => `<option value="${esc(c)}">${esc(nameOf[c] || c)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => show(byCountry[select.value]));
      show(byCountry[select.value]);
    } catch (err) {
      console.error('Monthly top widget:', err);
      mount.hidden = true;
    }
  })();
})();
