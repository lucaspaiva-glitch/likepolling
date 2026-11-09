// Restaurants widget: Michelin-starred restaurants per country as recorded in Wikidata (open data),
// saved weekly by scripts/restaurants-routine.js. A click opens the restaurant's own website.
//   <section id="restaurants" data-supabase-url="…" data-supabase-key="sb_publishable_…"></section>
(function () {
  'use strict';
  const mount = document.getElementById('restaurants');
  if (!mount) return;
  const base = (mount.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = mount.dataset.supabaseKey || '';
  if (!base || !key) return;
  const COUNTRIES = ['PT', 'BR', 'US', 'GB', 'FR', 'ES', 'JP'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const region = (cc) => { try { return new Intl.DisplayNames([lang()], { type: 'region' }).of(cc); } catch { return cc; } };
  const get = async (path) => { const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(r.status); return r.json(); };
  const guess = (String(navigator.language || '').split('-')[1] || '').toUpperCase();
  let cc = COUNTRIES.includes(guess) ? guess : 'PT';
  let day = null;
  mount.hidden = true;
  mount.classList.add('rst');
  mount.innerHTML = `
    <div class="fsh-top"><div><h2 class="fsh-h">Restaurants</h2><p class="fsh-p">Michelin-starred restaurants in each country. Click one to visit its website.</p></div>
      <div class="rst-picks"><select class="ytt-select rst-select" aria-label="Country"></select><select class="ytt-select rst-region" aria-label="State" hidden></select></div></div>
    <section class="ytt"><div class="ytt-head"><h3 class="ytt-title">Michelin stars</h3><span class="ytt-sym" data-no-i18n>STAR</span></div>
      <div class="rst-sum" data-no-i18n></div>
      <ul class="rst-list" data-no-i18n></ul>
      <p class="ytt-foot">Stars as recorded in Wikidata (open data), checked weekly. Not an official Michelin Guide list.</p></section>`;
  const select = mount.querySelector('.rst-select');
  const list = mount.querySelector('.rst-list');
  const sum = mount.querySelector('.rst-sum');
  const pick = mount.querySelector('.rst-region');
  let all = [];
  let reg = '';
  const tr = (x) => (window.LP_I18N ? window.LP_I18N.t(x) : x);
  const fill = () => { select.innerHTML = COUNTRIES.map((c) => `<option value="${c}"${c === cc ? ' selected' : ''}>${esc(region(c))}</option>`).join(''); };
  function paint() {
    const rows = reg ? all.filter((r) => r.region === reg) : all;
    list.innerHTML = rows.map((r) => { const u = r.website || r.wiki; const inner = `<b>${esc(r.name)}</b><span>${esc(r.city || '')}</span><em aria-label="${r.stars} Michelin star${r.stars > 1 ? 's' : ''}">${'★'.repeat(r.stars)}</em>`;
      return `<li class="rst-t${r.stars}">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${inner}</a>` : `<div>${inner}</div>`}</li>`; }).join('');
    sum.innerHTML = [3, 2, 1].map((n) => [n, rows.filter((r) => r.stars === n).length]).filter(([, c]) => c).map(([n, c]) => `<span class="rst-t${n}"><em>${'★'.repeat(n)}</em>${c}</span>`).join('');
  }
  async function show() {
    try {
      if (!day) day = (await get('restaurants_michelin?select=day&order=day.desc&limit=1'))[0]?.day;
      if (!day) return;
      const rows = await get(`restaurants_michelin?select=name,city,region,stars,website,wiki&country_code=eq.${cc}&day=eq.${day}&order=stars.desc,name.asc&limit=200`);
      all = rows;
      const n = (x) => rows.filter((r) => r.region === x).length;
      const regs = [...new Set(rows.map((r) => r.region).filter(Boolean))].sort((x, y) => n(y) - n(x));
      pick.hidden = regs.length < 2;
      pick.innerHTML = `<option value="">${esc(tr('All states'))}</option>` + regs.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      paint();
      mount.hidden = !rows.length;
    } catch { mount.hidden = true; }
  }
  select.addEventListener('change', () => { cc = select.value; reg = ''; show(); });
  pick.addEventListener('change', () => { reg = pick.value; paint(); });
  document.addEventListener('lp:lang', () => { fill(); if (pick.options[0]) pick.options[0].textContent = tr('All states'); });
  fill();
  show();
})();
