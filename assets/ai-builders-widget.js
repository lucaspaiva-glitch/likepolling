// AI Builders widget: the most-starred AI projects created on GitHub in the last 7 days, with a plain-language
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
  mount.hidden = true;
  mount.classList.add('aib');
  mount.innerHTML = `
    <div class="fsh-top"><div><h2 class="fsh-h">AI Builders</h2><p class="fsh-p">New AI projects on GitHub, every week, explained in plain words.</p></div></div>
      <section class="ytt"><div class="ytt-head"><h3 class="ytt-title">Top new AI projects</h3><span class="ytt-sym" data-no-i18n>GITHUB</span></div>
        <ol class="aib-repos" data-no-i18n></ol>
        <p class="ytt-foot">Most-starred AI projects created on GitHub in the last 7 days. Plain-language titles are written by AI from each project's own description.</p></section>`;
  const repos = mount.querySelector('.aib-repos');
  let R = [];
  function paint() {
    repos.innerHTML = R.map((r) => {
      const name = r.full_name.split('/')[1];
      const p = r.plain && (r.plain[dataLang(lang())] || r.plain.en);
      const text = p ? p.d : r.description;
      return `<li><a href="${esc(r.url)}" target="_blank" rel="noopener"><i>${r.rank}</i><b>${esc(p ? p.t : name)}<small>${esc(p ? name : r.full_name.split('/')[0])}</small></b>${text ? `<span>${esc(text)}</span>` : ''}<em>★ ${num(r.stars)}</em></a></li>`;
    }).join('');
  }
  (async () => {
    try {
      const day = (await get('github_ai_repos_weekly?select=day&order=day.desc&limit=1'))[0]?.day;
      if (!day) return;
      R = await get(`github_ai_repos_weekly?select=rank,full_name,description,stars,url,plain&day=eq.${day}&order=rank.asc&limit=10`);
      if (!R.length) return;
      paint();
      mount.hidden = false;
    } catch { /* section stays hidden */ }
  })();
  document.addEventListener('lp:lang', () => { if (R.length) paint(); });
})();
