// /services: live preview of the free Brazil vs Portugal sample. Product cards are in offers.js.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // Live preview of the free sample, so the page always shows today's numbers.
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  fetch('/api/report?country=BR&compare=PT').then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => {
    const [br, pt] = d.countries;
    $('pv-kpis').innerHTML = [[br, 'Brazil'], [pt, 'Portugal']].map(([c, n]) => `<div><b>${num(c.news_focus.articles)}</b><span>news articles about ${n}</span></div>`).join('');
    const nd = br.news_daily || [];
    if (nd.length > 1) {
      const max = Math.max(...nd.map((x) => x.articles)), W = 300, H = 90;
      const pts = nd.map((x, i) => `${((i * (W - 8)) / (nd.length - 1) + 4).toFixed(1)},${(H - 6 - (x.articles / max) * (H - 16)).toFixed(1)}`).join(' ');
      const pk = nd.findIndex((x) => x.articles === max), [px, py] = pts.split(' ')[pk].split(',');
      $('pv-chart').innerHTML = `<polygon points="4,${H - 6} ${pts} ${W - 4},${H - 6}" fill="#fbeaec"/><polyline points="${pts}" fill="none" stroke="#b0000e" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${px}" cy="${py}" r="4" fill="#fff" stroke="#b0000e" stroke-width="2.5"/>`;
      const day = new Date(`${nd[pk].day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      $('pv-take').innerHTML = `Brazil's busiest news day was <b>${day}</b>, with ${num(max)} articles. ${num(d.shared.articles_together)} articles mentioned both countries.`;
    }
    const top = br.wikipedia.slice(0, 3), m = (top[0] && top[0].views) || 1;
    $('pv-rank').innerHTML = top.map((w) => `<li><div class="l"><span>${esc(w.title)}</span><b>${num(w.views)}</b></div><i style="--w:${((w.views / m) * 100).toFixed(0)}%"></i></li>`).join('');
  }).catch(() => { $('pv-take').textContent = 'Open the free sample to see a full report.'; });

})();
