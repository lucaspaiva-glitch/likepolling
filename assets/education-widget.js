// Education widget: Education Index (fastest recent uploads of tracked education
// channels), plus trending books and a live/next space launch.
//   <section id="edu" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
// Reads public.education_videos (scripts/education-routine.js)
// with the publishable key. Hides itself if there is no data.
(function () {
  'use strict';
  const mount = document.getElementById('edu');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;
  if (!document.querySelector('link[href="/assets/education-widget.css"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/assets/education-widget.css';
    document.head.appendChild(css);
  }

  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n) => (n == null || isNaN(n) ? '—' : compact.format(Number(n)));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  // Opens the whole list as a YouTube quick playlist (no login), starting at the clicked video.
  const watch = (id, ids) => { const i = Math.max(0, ids.indexOf(id)); return `https://www.youtube.com/watch_videos?video_ids=${ids.slice(i).concat(ids.slice(0, i)).slice(0, 50).map(encodeURIComponent).join(',')}`; };
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  async function get(path) {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  mount.classList.add('edu');
  mount.setAttribute('aria-label', 'Education: learning videos in each country');
  mount.innerHTML = `
    <div class="edu-top"><h2 class="edu-h">Education</h2><p class="edu-p">What the world is learning on YouTube.</p></div>
    <div class="edu-grid edu-one">
      <section class="ytt edu-idx">
        <div class="ytt-head"><h3 class="ytt-title">Education Index</h3><span class="ytt-sym">EDU</span><span class="ytt-spacer"></span>
          <select class="ytt-select edu-select" aria-label="Country"></select><span class="ytt-asof"></span></div>
        <div class="edu-ib"></div>
        <div class="ytt-foot">Fastest-growing uploads of the last 30 days from the education channels we track in this country, at most 2 per channel. Speed = views per hour since upload. Refreshed twice a day.</div>
        <div class="ytt-foot">Countries with fewer than 5 videos look back 60 days, with up to 3 per channel.</div>
      </section>
    </div>
    <div class="edu-grid edu-more">
      <section class="ytt edu-bk" hidden>
        <div class="ytt-head"><h3 class="ytt-title">Trending books</h3><span class="ytt-sym" data-no-i18n>BOOKS</span><span class="ytt-spacer"></span><span class="ytt-asof">Worldwide · this week</span></div>
        <ol class="edu-bl" data-no-i18n></ol>
        <div class="ytt-foot">The books most opened and saved on Open Library this week, worldwide. Shows curiosity, not sales. Saved every day.</div>
      </section>
      <section class="ytt edu-sp" hidden>
        <div class="ytt-head"><h3 class="ytt-title">Space</h3><span class="ytt-sym" data-no-i18n>LAUNCH</span></div>
        <div class="edu-sl"></div>
        <div class="ytt-foot">Launches from Launch Library 2, by The Space Devs.</div>
      </section>
    </div>`;
  const select = mount.querySelector('.edu-select');
  const ib = mount.querySelector('.edu-ib');
  const asof = mount.querySelector('.ytt-asof');
  let token = 0;

  function index(rows) {
    if (!rows.length) return '<div class="ytt-empty">No education data for this country yet.</div>';
    const top = Math.max(...rows.map((r) => Number(r.views_per_hour) || 0), 1);
    const ids = rows.map((r) => r.video_id);
    return `<div class="ytt-cards">${rows.slice(0, 5).map((r) => `<a class="ytt-card" href="${watch(r.video_id, ids)}" target="_blank" rel="noopener">
        <span class="ytt-cth"><img src="https://i.ytimg.com/vi/${encodeURIComponent(r.video_id)}/mqdefault.jpg" alt="" loading="lazy"><b class="ytt-crk">${pad(r.rank)}</b><i class="ytt-cvw">${fmt(r.views_per_hour)}/h</i></span>
        <span class="ytt-ctt" title="${esc(r.title)}">${esc(r.title)}</span><span class="ytt-cch">${esc(r.channel_title)}</span></a>`).join('')}</div>
      ${rows.length > 5 ? `<table class="ytt-table"><colgroup><col class="ytt-rank-col"><col><col class="ytt-vol-col"><col class="ytt-likes-col"></colgroup>
        <thead><tr><th>#</th><th>Video</th><th class="n">Speed</th><th class="n ytt-likes">Views</th></tr></thead>
        <tbody>${rows.slice(5).map((r) => `<tr><td><span class="ytt-rank">${pad(r.rank)}</span></td>
          <td><a class="ytt-video" href="${watch(r.video_id, ids)}" target="_blank" rel="noopener"><span class="lp-rth" style="--i:${r.rank - 6}"><img src="https://i.ytimg.com/vi/${encodeURIComponent(r.video_id)}/mqdefault.jpg" alt="" loading="lazy"><b>${pad(r.rank)}</b></span>
            <span class="ytt-text"><span class="ytt-vt" title="${esc(r.title)}">${esc(r.title)}</span><span class="ytt-ch">${esc(r.channel_title)}</span></span></a></td>
          <td class="n ytt-vol"><span class="ytt-num">${fmt(r.views_per_hour)}/h</span><div class="ytt-bar" style="width:${Math.max(4, Math.round((Number(r.views_per_hour) || 0) / top * 100))}%"></div></td>
          <td class="n ytt-likes"><span class="ytt-num">${fmt(r.view_count)}</span></td></tr>`).join('')}</tbody></table>` : ''}`;
  }

  async function show(code) {
    const mine = ++token;
    try {
      const cc = encodeURIComponent(code);
      const vids = await get(`education_videos?select=rank,video_id,title,channel_title,thumbnail_url,view_count,views_per_hour,fetched_at&country_code=eq.${cc}&order=rank&limit=8`);
      if (mine !== token) return;
      ib.innerHTML = index(vids);
      asof.textContent = vids[0] ? `As of ${new Date(vids[0].fetched_at).toISOString().slice(11, 16)} UTC` : '';
    } catch (err) {
      if (mine !== token) return;
      console.error('Education widget:', err);
      ib.innerHTML = '<div class="ytt-empty">Education data is unavailable right now.</div>';
      asof.textContent = '';
    }
  }

  function defaultCountry(codes) {
    let lang = '';
    try { lang = localStorage.getItem('lp-lang') || ''; } catch (e) { /* storage blocked */ }
    const fromLang = { 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'ES', de: 'DE', ko: 'KR', ja: 'JP' }[lang];
    if (fromLang && codes.includes(fromLang)) return fromLang;
    for (const l of navigator.languages || [navigator.language || '']) {
      const region = (l.split('-')[1] || '').toUpperCase();
      if (codes.includes(region)) return region;
    }
    return codes.includes('US') ? 'US' : codes[0];
  }

  // Space: a launch streaming right now (YouTube when it has one), else just the next launch date.
  // Asks Launch Library 2 live (cached 5 min per visitor); falls back to our saved space_launches.
  const LL = 'https://ll.thespacedevs.com/2.3.0/launches/';
  const ll = async (path) => { const r = await fetch(LL + path, { signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error(`LL2 ${r.status}`); return r.json(); };
  const ytId = (u) => { const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(u || ''); return m ? m[1] : null; };
  async function launchNow() {
    try { const c = JSON.parse(sessionStorage.getItem('lp-launch') || 'null'); if (c && Date.now() - c.at < 3e5) return c.v; } catch (e) { /* storage blocked */ }
    const up = (await ll('upcoming/?limit=5&mode=normal')).results || [];
    const v = { next: (up.find((l) => Date.parse(l.net) > Date.now()) || {}).net || null, live: null };
    const now = up.find((l) => l.webcast_live || (l.status && l.status.abbrev === 'In Flight'));
    if (now) {
      const vids = (await ll(`${now.id}/?mode=detailed`)).vid_urls || [];
      const yt = vids.filter((x) => ytId(x.url));
      const pick = yt.find((x) => x.live) || yt[0];
      v.live = { name: now.name, yt: pick ? ytId(pick.url) : null, url: (vids.find((x) => x.live) || vids[0] || {}).url || null };
    }
    try { sessionStorage.setItem('lp-launch', JSON.stringify({ at: Date.now(), v })); } catch (e) { /* storage blocked */ }
    return v;
  }
  async function space() {
    const sp = mount.querySelector('.edu-sp'), box = sp.querySelector('.edu-sl');
    let v = await launchNow().catch(() => null);
    if (!v || (!v.live && !v.next)) {
      const saved = await get(`space_launches?select=net&net=gte.${new Date().toISOString()}&order=net.asc&limit=1`).catch(() => []);
      v = { live: null, next: saved[0] ? saved[0].net : null };
    }
    const render = () => {
      const lang = document.documentElement.lang;
      const L = v.live;
      sp.querySelector('.ytt-sym').textContent = L ? 'LIVE' : 'LAUNCH';
      if (L) {
        box.innerHTML = `<p class="edu-live"><i></i><span>Live now</span><b data-no-i18n>${esc(L.name)}</b></p>${L.yt
          ? `<div class="edu-frame"><iframe src="https://www.youtube-nocookie.com/embed/${L.yt}?autoplay=1&mute=1&playsinline=1" title="${esc(L.name)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
          : L.url ? `<p class="edu-next"><a href="${esc(L.url)}" target="_blank" rel="noopener">Watch live ↗</a></p>` : ''}`;
      } else {
        const when = new Intl.DateTimeFormat(lang || undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v.next));
        box.innerHTML = `<p class="edu-next"><span>Next launch</span><b data-no-i18n>${esc(when)}</b></p>`;
      }
    };
    if (!v.live && !v.next) return;
    render();
    sp.hidden = false;
    document.addEventListener('lp:lang', render);
  }

  // Trending books (Open Library), saved daily.
  async function books() {
    const bk = mount.querySelector('.edu-bk');
    const rows = await get('books_daily?select=day,rank,title,author,cover_id,work_key&order=day.desc,rank.asc&limit=10').catch(() => []);
    const latest = rows.filter((b) => b.day === (rows[0] && rows[0].day));
    if (latest.length) {
      bk.querySelector('.edu-bl').innerHTML = latest.map((b) => `<li><a href="https://openlibrary.org${esc(b.work_key)}" target="_blank" rel="noopener">${b.cover_id ? `<img src="https://covers.openlibrary.org/b/id/${b.cover_id}-S.jpg" alt="" loading="lazy">` : '<i></i>'}<span><b>${esc(b.title)}</b>${esc(b.author || '')}</span></a></li>`).join('');
      bk.hidden = false;
    }
  }

  (async () => {
    books();
    space();
    try {
      const firsts = await get('education_videos?select=country_code&rank=eq.1');
      const codes = firsts.map((r) => r.country_code);
      if (!codes.length) throw new Error('no data');
      const names = await get(`youtube_active_users?select=country_code,country_name&country_code=in.(${codes.join(',')})`).catch(() => []);
      const name = Object.fromEntries(names.map((n) => [n.country_code, n.country_name]));
      const list = codes.map((c) => [c, name[c] || c]).sort((a, b) => a[1].localeCompare(b[1]));
      select.innerHTML = list.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => show(select.value));
      await show(select.value);
    } catch (err) {
      console.error('Education widget:', err);
      mount.hidden = true;
    }
  })();
})();
