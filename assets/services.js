// /services: live preview of the free Brazil vs Portugal sample. Product cards are in offers.js.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // Live preview of the free sample, so the page always shows today's numbers.
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const loc = () => (lang() === 'pt' ? 'pt-BR' : lang());
  const D = window.LP_REPORT_DICT || {};
  const L = (en, v = {}) => ((lang() === 'pt-PT' && D['pt-PT'] && D['pt-PT'][en]) || (D[lang() === 'pt-PT' ? 'pt' : lang()] || {})[en] || en).replace(/\{(\w+)\}/g, (_, k) => v[k]);
  const region = (c) => { try { return new Intl.DisplayNames([loc()], { type: 'region' }).of(c); } catch { return c; } };
  const num = (n) => Number(n || 0).toLocaleString(loc());
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const SAMPLES = 'https://iyhaoagslsrwtkcrxylp.supabase.co/storage/v1/object/public/samples';
  const setPdf = () => { $('pv-pdf').href = `${SAMPLES}/${lang()}/country-report.pdf?download=like-polling-country-report.pdf`; };
  setPdf();
  let data = null;
  document.addEventListener('lp:lang', () => { setPdf(); if (data) draw(data); });
  fetch('/api/report?country=BR&compare=PT').then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { data = d; draw(d); }).catch(() => { $('pv-take').textContent = 'Open the free sample to see a full report.'; });
  function draw(d) {
    const [br, pt] = d.countries;
    $('pv-kpis').innerHTML = [[br, 'BR'], [pt, 'PT']].map(([c, n]) => `<div><b>${num(c.news_focus.articles)}</b><span>${L('News articles')} · ${region(n)}</span></div>`).join('');
    const nd = br.news_daily || [];
    if (nd.length > 1) {
      const max = Math.max(...nd.map((x) => x.articles)), W = 300, H = 90;
      const pts = nd.map((x, i) => `${((i * (W - 8)) / (nd.length - 1) + 4).toFixed(1)},${(H - 6 - (x.articles / max) * (H - 16)).toFixed(1)}`).join(' ');
      const pk = nd.findIndex((x) => x.articles === max), [px, py] = pts.split(' ')[pk].split(',');
      $('pv-chart').innerHTML = `<polygon points="4,${H - 6} ${pts} ${W - 4},${H - 6}" fill="#fbeaec"/><polyline points="${pts}" fill="none" stroke="#b0000e" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${px}" cy="${py}" r="4" fill="#fff" stroke="#b0000e" stroke-width="2.5"/>`;
      const day = new Date(`${nd[pk].day}T00:00:00Z`).toLocaleDateString(loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
      $('pv-take').innerHTML = `${region('BR')}: ${L('Busiest day: {day} with {n} articles', { day: `<b>${day}</b>`, n: num(max) })}. ${L('{n} news articles mentioned both countries together.', { n: num(d.shared.articles_together) })}`;
    }
    const top = br.wikipedia.slice(0, 3), m = (top[0] && top[0].views) || 1;
    $('pv-tag').textContent = L('Extended Country Report');
    $('pv-title').textContent = `${region('BR')} vs ${region('PT')}`;
    $('pv-nl').textContent = L('News coverage per day');
    $('pv-rank-l').textContent = `${L('Most-read on Wikipedia')} · ${region('BR')}`;
    $('pv-rank').innerHTML = top.map((w) => `<li><div class="l"><span>${esc(w.title)}</span><b>${num(w.views)}</b></div><i style="--w:${((w.views / m) * 100).toFixed(0)}%"></i></li>`).join('');
  }

})();
