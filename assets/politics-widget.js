// "Trending politicians" side tab: per country, the 5 politicians named in the most World News headlines over the
// last 7 days (public.politics_trending, saved daily by scripts/politics-routine.js). A name opens its search page.
(() => {
  const body = document.getElementById('pol-pop-body');
  const tab = document.getElementById('pol-tab');
  if (!body || !tab) return;
  const base = (body.dataset.supabaseUrl || '').replace(/\/$/, '');
  const key = body.dataset.supabaseKey || '';
  const MAIN = ['BR', 'PT', 'US', 'ES', 'FR', 'DE', 'GB', 'JP', 'KR', 'RU', 'UA', 'MX', 'IN', 'CN'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const region = (cc) => { try { return new Intl.DisplayNames([lang()], { type: 'region' }).of(cc); } catch { return cc; } };
  const tr = (x) => (window.LP_I18N ? window.LP_I18N.t(x) : x);
  fetch(`${base}/rest/v1/politics_trending?select=country_code,rank,name,wiki_title,headlines&order=country_code.asc,rank.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    .then((r) => (r.ok ? r.json() : [])).then((rows) => {
      const by = {};
      rows.forEach((r) => { (by[r.country_code] ||= []).push(r); });
      const list = MAIN.filter((c) => by[c]);
      if (!list.length) return;
      let cc = window.LP_CC ? window.LP_CC(list) : list[0];
      const paint = () => {
        body.innerHTML = `<div class="lp-pol-sw"><button type="button" data-d="-1" aria-label="${esc(tr('Previous country'))}">‹</button><b><img src="/assets/flags/${cc.toLowerCase()}.svg" alt="" width="18" height="13"><span data-no-i18n>${esc(region(cc))}</span></b><button type="button" data-d="1" aria-label="${esc(tr('Next country'))}">›</button></div>
          <ol class="lp-pol-list" data-no-i18n>${by[cc].map((p) => `<li><a href="/s?find=${encodeURIComponent(p.wiki_title || p.name)}"><em>${p.rank}</em><span><b>${esc(p.name)}</b></span><i>${p.headlines}</i></a></li>`).join('')}</ol>
          <p class="lp-pol-note">Named in the most top news headlines, last 7 days. The number is how many headlines.</p>`;
      };
      body.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-d]'); if (!b) return;
        e.stopPropagation();
        cc = list[(list.indexOf(cc) + Number(b.dataset.d) + list.length) % list.length];
        paint();
      });
      paint();
      tab.hidden = false;
    }).catch(() => {});
})();
