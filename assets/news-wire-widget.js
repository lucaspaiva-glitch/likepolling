// Creator News Wire widget. Standalone: mount with
//   <section id="news-wire" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
//   <script src="/assets/news-wire-widget.js" defer></script>
// Reads public.news_wire (filled hourly by scripts/news-wire-routine.js) with the
// publishable key, in the site language from assets/i18n.js (English without it).
// UI text is English; i18n.js translates it. Hides itself if no data loads.
(function () {
  'use strict';
  const mount = document.getElementById('news-wire');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/news-wire-widget.css';
  document.head.appendChild(css);

  const PAGE = 12;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const cache = {};
  let filter = 'all';
  let shown = PAGE;
  let token = 0;

  async function load(lang) {
    if (!cache[lang]) {
      const res = await fetch(`${base}/rest/v1/news_wire?select=category,title,source,link,published_at,fetched_at&lang=eq.${encodeURIComponent(lang)}&order=published_at.desc&limit=200`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache[lang] = await res.json();
    }
    return cache[lang];
  }

  function ago(iso, lang) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    const rtf = new Intl.RelativeTimeFormat(lang === 'pt' ? 'pt-BR' : lang, { numeric: 'always', style: 'narrow' });
    if (mins < 60) return rtf.format(-Math.max(1, mins), 'minute');
    if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
    return rtf.format(-Math.round(mins / 1440), 'day');
  }

  mount.className = 'nw';
  mount.setAttribute('aria-label', 'YouTube and creator news');
  mount.innerHTML = `
    <div class="nw-head">
      <h2 class="nw-title">Creator News Wire</h2>
      <span class="nw-sym">YT·WIRE</span>
      <span class="nw-spacer"></span>
      <span class="nw-asof"></span>
    </div>
    <div class="nw-filters" role="group" aria-label="News filter">
      <button type="button" data-f="all" aria-pressed="true">All news</button>
      <button type="button" data-f="youtube" aria-pressed="false">YouTube updates</button>
      <button type="button" data-f="creators" aria-pressed="false">Creator economy</button>
    </div>
    <ol class="nw-list" data-no-i18n></ol>
    <div class="nw-more-wrap"><button type="button" class="nw-more">Load more</button></div>
    <div class="nw-foot">Latest headlines from Google News in the selected language. Refreshed hourly.</div>`;
  const list = mount.querySelector('.nw-list');
  const more = mount.querySelector('.nw-more');
  const asof = mount.querySelector('.nw-asof');

  async function render() {
    const mine = ++token;
    const lang = siteLang();
    try {
      const rows = await load(lang);
      if (mine !== token) return;
      if (!rows.length) throw new Error('no data');
      mount.hidden = false;
      const items = filter === 'all' ? rows : rows.filter((r) => r.category === filter);
      list.innerHTML = items.length ? items.slice(0, shown).map((r) => `
        <li class="nw-item">
          <a href="${/^https:\/\//.test(r.link) ? esc(r.link) : '#'}" target="_blank" rel="noopener">
            <span class="nw-time">${esc(ago(r.published_at, lang))}</span>
            <span class="nw-text">
              <span class="nw-hl">${esc(r.title)}</span>
              <span class="nw-meta"><span class="nw-src">${esc(r.source || 'Google News')}</span><span class="nw-cat">${r.category === 'youtube' ? 'YouTube' : 'Creators'}</span></span>
            </span>
          </a>
        </li>`).join('') : '<li class="nw-empty">No headlines in this filter yet.</li>';
      list.querySelectorAll('.nw-cat, .nw-empty').forEach((el) => { el.textContent = window.LP_I18N ? window.LP_I18N.t(el.textContent) : el.textContent; });
      more.parentElement.hidden = items.length <= shown;
      asof.textContent = `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC`;
    } catch (err) {
      if (mine !== token) return;
      if (err.message !== 'no data') console.error('News wire widget:', err);
      if (!Object.keys(cache).length || lang === 'en') { mount.hidden = true; return; }
      list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', `<li class="nw-empty">${esc(window.LP_I18N ? window.LP_I18N.t('News is unavailable right now.') : 'News is unavailable right now.')}</li>`);
      more.parentElement.hidden = true;
    }
  }

  mount.querySelector('.nw-filters').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    shown = PAGE;
    mount.querySelectorAll('.nw-filters button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  more.addEventListener('click', () => { shown += PAGE; render(); });
  document.addEventListener('lp:lang', () => { shown = PAGE; render(); });
  render();
})();
