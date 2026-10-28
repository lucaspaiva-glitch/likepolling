// "Who am I in the age of AI?": real headlines about people using AI for good (medicine, work,
// creativity, everyday life) from each country, in the site language. Filled twice a day by
// scripts/news-ai-routine.js (Google News + a Gemini check and translation).
//   <section id="ai-age" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
// Reads public.news_ai with the publishable key. Hides itself if there is no data.
(function () {
  'use strict';
  const mount = document.getElementById('ai-age');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;

  const SHOWN = 5;
  const KINDS = { medicine: 'Medicine', work: 'Jobs', creativity: 'Creativity', life: 'Daily life' };
  const LANG_CC = { en: 'US', 'en-GB': 'GB', pt: 'BR', 'pt-PT': 'PT', es: 'ES', de: 'DE', ru: 'RU', uk: 'UA', ko: 'KR', ja: 'JP' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const siteLang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const dataLang = (l) => (l === 'en-GB' ? 'en' : l);
  async function get(path) {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  mount.classList.add('aia');
  mount.innerHTML = `
    <div class="ytt-head"><h2 class="ytt-title">Who am I in the age of AI?</h2><button type="button" class="aia-info" aria-expanded="false" aria-controls="aia-about">About</button><span class="ytt-spacer"></span><span class="ytt-asof aia-asof"></span></div>
    <div class="aia-about" id="aia-about" hidden>
      <p>Real stories from the last 2 days on Google News in the chosen country, in its language, about people using AI for good: medicine and science, new jobs, creativity and everyday life. AI (Google Gemini) picks them, leaving out stories about risks, scandals, markets and product ads, translates the headline and writes the short summary from the publisher's own description. Updated twice a day.</p>
      <p>The title comes from a question that Ella Hafermalz, associate professor at Vrije Universiteit Amsterdam, asks her students, as she said on BBC News' AI Decoded.</p>
      <a href="https://www.youtube.com/watch?v=6zAgTga9kZw&amp;t=860s" target="_blank" rel="noopener">Watch the moment on YouTube (14:23)</a>
    </div>
    <div class="aia-bar"><select class="ytt-select aia-select" aria-label="Country"></select><div class="aia-kinds" role="group" aria-label="Topic"></div></div>
    <div class="aia-body"></div>`;
  const select = mount.querySelector('.aia-select');
  const kindsBox = mount.querySelector('.aia-kinds');
  const body = mount.querySelector('.aia-body');
  const asof = mount.querySelector('.aia-asof');
  const info = mount.querySelector('.aia-info');
  const about = mount.querySelector('.aia-about');
  info.addEventListener('click', () => {
    about.hidden = !about.hidden;
    info.setAttribute('aria-expanded', String(!about.hidden));
  });
  const cache = {};
  let kind = 'all';
  let token = 0;

  mount.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.closest('.aia-media')?.classList.add('aia-noimg');
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

  function story(r, lead) {
    const tr = r.title_tr || {};
    const shown = tr[dataLang(siteLang())] || r.title;
    const orig = shown !== r.title ? ` title="${esc(r.title)}"` : '';
    const sum = lead && tr.sum && tr.sum[dataLang(siteLang())];
    return `<article class="${lead ? 'aia-lead' : 'aia-row'}">
      <a class="aia-media" href="${esc(r.link)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
        <img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc((r.source || '?').slice(0, 1))}</span></a>
      <div class="aia-text">
        <div class="aia-meta"><span class="aia-kind">${esc(KINDS[tr.ai] || '')}</span><span class="aia-src" data-no-i18n>${esc(r.source || '')}</span><span class="aia-age">${esc(ago(r.published_at))}</span></div>
        <a class="aia-hl" href="${esc(r.link)}" target="_blank" rel="noopener" data-no-i18n${orig}>${esc(shown)}</a>
        ${sum ? `<p class="aia-sum" data-no-i18n>${esc(sum)}</p>` : ''}
      </div></article>`;
  }

  function draw(rows) {
    const present = Object.keys(KINDS).filter((k) => rows.some((r) => r.title_tr.ai === k));
    if (kind !== 'all' && !present.includes(kind)) kind = 'all';
    kindsBox.innerHTML = present.length > 1 ? ['all', ...present].map((k) => `<button type="button" class="aia-chip" aria-pressed="${k === kind}" data-kind="${k}">${esc(k === 'all' ? 'All' : KINDS[k])}</button>`).join('') : '';
    const list = rows.filter((r) => kind === 'all' || r.title_tr.ai === kind).slice(0, SHOWN);
    body.innerHTML = list.length
      ? `${story(list[0], true)}<div class="aia-list">${list.slice(1).map((r) => story(r, false)).join('')}</div>`
      : '<div class="ytt-empty">No stories for this country right now.</div>';
  }

  kindsBox.addEventListener('click', (e) => {
    const b = e.target.closest('.aia-chip');
    if (!b) return;
    kind = b.dataset.kind;
    if (cache[select.value]) draw(cache[select.value]);
  });

  async function show(cc) {
    const mine = ++token;
    if (!cache[cc]) body.innerHTML = '';
    try {
      cache[cc] = cache[cc] || await get(`news_ai?select=link,title,title_tr,source,published_at,image_url,fetched_at&country_code=eq.${encodeURIComponent(cc)}&image_url=like.https%3A%2F%2F*&title_tr->>ai=in.(${Object.keys(KINDS).join(',')})&order=rank.asc&limit=40`);
      if (mine !== token) return;
      const rows = cache[cc];
      draw(rows);
      asof.textContent = rows[0] ? `As of ${new Date(rows[0].fetched_at).toISOString().slice(11, 16)} UTC` : '';
    } catch (err) {
      if (mine !== token) return;
      console.error('AI widget:', err);
      kindsBox.innerHTML = '';
      body.innerHTML = '<div class="ytt-empty">AI news is unavailable right now.</div>';
      asof.textContent = '';
    }
  }

  function defaultCountry(codes) {
    let picked = null;
    try { picked = localStorage.getItem('lp-world-cc'); } catch (e) { /* no storage */ }
    if (picked && codes.includes(picked)) return picked;
    const fromLang = LANG_CC[siteLang()];
    if (fromLang && codes.includes(fromLang)) return fromLang;
    return codes.includes('US') ? 'US' : codes[0];
  }

  (async () => {
    try {
      const firsts = await get('news_ai?select=country_code&rank=eq.1');
      const codes = [...new Set(firsts.map((r) => r.country_code))];
      if (!codes.length) throw new Error('no data');
      const names = await get(`youtube_active_users?select=country_code,country_name&country_code=in.(${codes.join(',')})`).catch(() => []);
      const name = Object.fromEntries(names.map((n) => [n.country_code, n.country_name]));
      const list = codes.map((c) => [c, name[c] || c]).sort((a, b) => a[1].localeCompare(b[1]));
      select.innerHTML = list.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('');
      select.value = defaultCountry(codes);
      select.addEventListener('change', () => { kind = 'all'; show(select.value); });
      document.addEventListener('lp:lang', () => { if (cache[select.value]) draw(cache[select.value]); });
      await show(select.value);
    } catch (err) {
      if (err.message !== 'no data') console.error('AI widget:', err);
      mount.hidden = true;
    }
  })();
})();
