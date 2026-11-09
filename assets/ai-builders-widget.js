// AI Builders widget: the most-starred AI projects created on GitHub in the last 7 days, and new GitHub
// accounts per country, saved weekly by scripts/github-routine.js (GitHub API).
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
  const region = (cc) => { try { return new Intl.DisplayNames([lang()], { type: 'region' }).of(cc); } catch { return cc; } };
  const num = (n) => Number(n).toLocaleString(window.LP_I18N ? window.LP_I18N.locale() : 'en');
  const get = async (path) => { const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(r.status); return r.json(); };
  mount.hidden = true;
  mount.classList.add('aib');
  mount.innerHTML = `
    <div class="fsh-top"><div><h2 class="fsh-h">AI Builders</h2><p class="fsh-p">New AI projects and new developers on GitHub, every week.</p></div></div>
    <div class="aib-grid">
      <section class="ytt"><div class="ytt-head"><h3 class="ytt-title">Top new AI projects</h3><span class="ytt-sym" data-no-i18n>GITHUB</span></div>
        <ol class="aib-repos" data-no-i18n></ol>
        <p class="ytt-foot">Most-starred AI projects created on GitHub in the last 7 days.</p></section>
      <section class="ytt"><div class="ytt-head"><h3 class="ytt-title">New developers</h3><span class="ytt-sym" data-no-i18n>GITHUB</span></div>
        <ol class="aib-devs" data-no-i18n></ol>
        <p class="ytt-foot">New GitHub accounts in the last 7 days. Counts only people who wrote their country in their profile.</p></section>
    </div>`;
  const repos = mount.querySelector('.aib-repos'), devs = mount.querySelector('.aib-devs');
  let R = [], D = [];
  function paint() {
    repos.innerHTML = R.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener"><i>${r.rank}</i><b>${esc(r.full_name.split('/')[1])}<small>${esc(r.full_name.split('/')[0])}</small></b>${r.description ? `<span>${esc(r.description)}</span>` : ''}<em>★ ${num(r.stars)}${r.language ? ` · ${esc(r.language)}` : ''}</em></a></li>`).join('');
    const top = D[0] ? D[0].accounts : 1;
    devs.innerHTML = D.map((d) => `<li><img src="/assets/flags/${d.country_code.toLowerCase()}.svg" alt="" width="20" height="15" loading="lazy"><b>${esc(region(d.country_code))}</b><em>${num(d.accounts)}</em><i style="width:${Math.max(2, Math.round((d.accounts / top) * 100))}%"></i></li>`).join('');
  }
  (async () => {
    try {
      const day = (await get('github_ai_repos_weekly?select=day&order=day.desc&limit=1'))[0]?.day;
      if (!day) return;
      [R, D] = await Promise.all([get(`github_ai_repos_weekly?select=rank,full_name,description,stars,language,url&day=eq.${day}&order=rank.asc&limit=10`),
        get(`github_new_devs_weekly?select=country_code,accounts&day=eq.${day}&accounts=gt.0&order=accounts.desc&limit=10`)]);
      if (!R.length) return;
      paint();
      mount.hidden = false;
    } catch { /* section stays hidden */ }
  })();
  document.addEventListener('lp:lang', () => { if (R.length) paint(); });
})();
