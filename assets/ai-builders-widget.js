// AI Builders widget: the most-starred AI projects created on GitHub in the last 7 days (Trending), 30 days and 12 months, with a plain-language
// title and sentence for each, saved weekly by scripts/github-routine.js (GitHub API + Gemini).
//   <section id="ai-builders" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
(function () {
  'use strict';
  const mount = document.getElementById('ai-builders');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const dataLang = (l) => (l === 'en-GB' ? 'en' : l);
  const num = (n) => Number(n).toLocaleString(window.LP_I18N ? window.LP_I18N.locale() : 'en');
  const get = async (path) => { const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(r.status); return r.json(); };
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const TABS = [['week', 'Trending'], ['month', 'This month'], ['year', 'This year']];
  mount.hidden = true;
  mount.classList.add('aib');
  mount.innerHTML = `
    <div class="fsh-top"><div><h2 class="fsh-h">AI Builders</h2><p class="fsh-p">New AI projects on GitHub, every week, explained in plain words.</p></div></div>
      <section class="ytt"><div class="ytt-head"><h3 class="ytt-title">Top new AI projects</h3><span class="ytt-sym" data-no-i18n>GITHUB</span></div>
        <div class="aib-tabs" role="tablist">${TABS.map(([id, label]) => `<button type="button" class="aia-chip" role="tab" data-tab="${id}" aria-selected="${id === 'week'}" aria-pressed="${id === 'week'}" hidden>${label}</button>`).join('')}</div>
        <ol class="aib-repos" data-no-i18n></ol>
        <p class="ytt-foot" data-foot="week">Most-starred AI projects created on GitHub in the last 7 days. Plain-language titles are written by AI from each project's own description.</p>
        <p class="ytt-foot" data-foot="month" hidden>Most-starred AI projects created on GitHub in the last 30 days.</p>
        <p class="ytt-foot" data-foot="year" hidden>Most-starred AI projects created on GitHub in the last 12 months.</p></section>`;
  const repos = mount.querySelector('.aib-repos');
  const D = {};
  let tab = 'week';
  function paint() {
    const R = D[tab] || [];
    repos.innerHTML = R.map((r, i) => {
      const [owner, name] = r.full_name.split('/');
      const p = r.plain && (r.plain[dataLang(lang())] || r.plain.en);
      const text = p ? p.d : r.description;
      const gh = p && r.description && r.description !== p.d ? `<p class="aib-gh"><b>${esc(tr('From GitHub'))}:</b> ${esc(r.description)}</p>` : '';
      return `<li><div class="aib-card" role="button" tabindex="0" aria-expanded="false" aria-controls="aib-pop-${i}"><i>${r.rank}</i><b>${esc(p ? p.t : name)}<small>${esc(p ? name : owner)}</small></b>${text ? `<span>${esc(text)}</span>` : ''}<em>★ ${num(r.stars)}</em></div>
        <div class="aib-pop" id="aib-pop-${i}"><strong>${esc(p ? p.t : name)}</strong>${text ? `<p>${esc(text)}</p>` : ''}${gh}<p class="aib-meta">★ ${num(r.stars)}${r.language ? ` · ${esc(r.language)}` : ''} · ${esc(r.full_name)}</p><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(tr('Open on GitHub'))} →</a></div></li>`;
    }).join('');
    mount.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on); b.setAttribute('aria-pressed', on); });
    mount.querySelectorAll('[data-foot]').forEach((f) => { f.hidden = f.dataset.foot !== tab; });
  }
  const toggle = (card) => {
    const li = card.closest('li'), open = !li.classList.contains('open');
    repos.querySelectorAll('li.open').forEach((x) => { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); });
    if (open) { li.classList.add('open'); card.setAttribute('aria-expanded', 'true'); }
  };
  repos.addEventListener('click', (e) => { const c = e.target.closest('.aib-card'); if (c) toggle(c); });
  repos.addEventListener('keydown', (e) => { const c = e.target.closest('.aib-card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(c); } });
  mount.querySelector('.aib-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && D[b.dataset.tab]) { tab = b.dataset.tab; paint(); } });
  const cols = 'rank,full_name,description,stars,language,url,plain';
  const latest = async (table, filter = '') => {
    const day = (await get(`${table}?select=day${filter}&order=day.desc&limit=1`))[0]?.day;
    return day ? get(`${table}?select=${cols}${filter}&day=eq.${day}&order=rank.asc&limit=10`) : [];
  };
  (async () => {
    try {
      const [w, m, y] = await Promise.all([latest('github_ai_repos_weekly'),
        latest('github_ai_repos_top', '&period=eq.month').catch(() => []), latest('github_ai_repos_top', '&period=eq.year').catch(() => [])]);
      [['week', w], ['month', m], ['year', y]].forEach(([id, rows]) => { if (rows.length) D[id] = rows; });
      if (!D.week) return;
      if (D.month || D.year) mount.querySelectorAll('[data-tab]').forEach((b) => { b.hidden = !D[b.dataset.tab]; });
      paint();
      mount.hidden = false;
    } catch { /* section stays hidden */ }
  })();
  document.addEventListener('lp:lang', () => { if (D.week) paint(); });
})();
