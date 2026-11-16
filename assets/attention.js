// Through-time charts on the homepage (points: [{ m: 'YYYY-MM', v }], e.g. news coverage per month). Load before the widgets.
//   LP_ATTN.chart(lines, opts), LP_ATTN.change(points), LP_ATTN.pick(el, n, fn), LP_ATTN.badge(pct)
(function () {
  'use strict';
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Last 12 months against the 12 before, in %; null without 2 full years.
  function change(pts) {
    if (pts.length < 24) return null;
    const sum = (a) => a.reduce((s, p) => s + p.v, 0);
    const prev = sum(pts.slice(-24, -12));
    return prev ? Math.round(((sum(pts.slice(-12)) - prev) / prev) * 100) : null;
  }
  const month = (m) => new Intl.DateTimeFormat(lang(), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
  const num = (n) => new Intl.NumberFormat(lang(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const peak = (pts) => pts.reduce((a, p) => (!a || p.v > a.v ? p : a), null);
  const signed = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`;

  // Lines in a 100×30 box stretched to the container, each scaled to its own top month.
  // lines: points, or [{ pts, cls }] (the first line sets the months and gets the area).
  // axis: a dashed line and label at each new year, and the last month at the right end (not when small).
  function chart(lines, { label = '', axis = false, small = false, years = false } = {}) {
    if (Array.isArray(lines) && (!lines.length || lines[0].m)) lines = [{ pts: lines }];
    const pts = (lines[0] && lines[0].pts) || [];
    if (pts.length < 2) return '';
    const at = new Map(pts.map((p, i) => [p.m, i]));
    // Monthly axis: each month sits in the middle of its own slot, so every label fits.
    const mo = axis && pts.length <= 24;
    const x = (i) => (mo ? ((i + 0.5) / pts.length) : (i / (pts.length - 1))) * 100;
    const poly = (l) => {
      const ok = l.pts.filter((p) => at.has(p.m));
      const max = Math.max(...ok.map((p) => p.v), 0) || 1;
      return ok.map((p) => `${x(at.get(p.m)).toFixed(2)},${(28 - (p.v / max) * 26).toFixed(2)}`).join(' ');
    };
    const first = poly(lines[0]);
    const svg = `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polygon points="${x(0).toFixed(2)},30 ${first} ${x(pts.length - 1).toFixed(2)},30" class="lp-attn-area"/>${lines.map((l, k) => `<polyline points="${k ? poly(l) : first}" class="lp-attn-line ${esc(l.cls || '')}" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`;
    let grid = '', ax = '';
    if (mo) {
      // A label under every month, plus the year under the first month and each January.
      const f = new Intl.DateTimeFormat(lang(), { month: small ? 'narrow' : 'short', timeZone: 'UTC' });
      grid = years ? '' : pts.map((p, i) => (i > 0 && p.m.endsWith('-01') ? `<i class="lp-attn-yr" style="left:${x(i).toFixed(2)}%"></i>` : '')).join('');
      // years: one point per year (m: 'YYYY-01'), labelled with the year only.
      ax = `<span class="lp-attn-ax mo${small ? ' sm' : ''}${years ? ' yr' : ''}">${pts.map((p, i) => {
        // Over 6 years, label every other one (counting back from the latest) so labels don't touch.
        if (years) return pts.length > 6 && (pts.length - 1 - i) % 2 ? '' : `<span style="left:${x(i).toFixed(2)}%">${p.m.slice(0, 4)}</span>`;
        const yr = i === 0 || p.m.endsWith('-01') ? `<b>${p.m.slice(0, 4)}</b>` : '';
        return `<span style="left:${x(i).toFixed(2)}%">${esc(f.format(new Date(`${p.m}-01T00:00:00Z`)).replace(/\.$/, ''))}${yr}</span>`;
      }).join('')}</span>`;
    } else if (axis) {
      const years = pts.map((p, i) => [p, i]).filter(([p, i]) => i > 0 && p.m.endsWith('-01'));
      grid = years.map(([, i]) => `<i class="lp-attn-yr" style="left:${x(i).toFixed(2)}%"></i>`).join('');
      const firstYr = years.length ? years[0][1] : pts.length;
      const labels = (x(firstYr) >= 14 ? [[pts[0], 0]] : []).concat(years);
      ax = `<span class="lp-attn-ax${small ? ' sm' : ''}">${labels.map(([p, i]) => `<span style="left:${x(i).toFixed(2)}%">${p.m.slice(0, 4)}</span>`).join('')}${small ? '' : `<span class="end">${esc(month(pts[pts.length - 1].m))}</span>`}</span>`;
    }
    return `<span class="lp-attn-svg${mo ? ' mo' : ''}" role="img" aria-label="${esc(label)}">${grid}${svg}<i class="lp-attn-cur" hidden></i></span>${ax}`;
  }
  // Pointing at or tapping a chart calls onPick(index of the month) and moves a cursor line there.
  function pick(root, n, onPick) {
    const box = root.querySelector('.lp-attn-svg');
    if (!box || n < 2) return;
    const cur = box.querySelector('.lp-attn-cur');
    const go = (e) => {
      const r = box.getBoundingClientRect();
      const f = (e.clientX - r.left) / r.width, mo = box.classList.contains('mo');
      const i = Math.max(0, Math.min(n - 1, mo ? Math.floor(f * n) : Math.round(f * (n - 1))));
      cur.hidden = false;
      cur.style.left = `${(mo ? (i + 0.5) / n : i / (n - 1)) * 100}%`;
      onPick(i);
    };
    box.addEventListener('pointermove', go);
    box.addEventListener('pointerdown', go);
  }
  // ▲ 12% / ▼ 8%, green or red.
  const badge = (p) => (p == null ? '' : `<em class="${p >= 0 ? 'lp-attn-up' : 'lp-attn-down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</em>`);

  const css = document.createElement('style');
  css.textContent = `
.lp-attn-svg { position: relative; display: block; width: 100%; height: 100%; }
.lp-attn-svg svg { display: block; width: 100%; height: 100%; overflow: visible; }
.lp-attn-area { fill: rgba(176, 0, 14, .09); }
.lp-attn-line { fill: none; stroke: #b0000e; stroke-width: 1.6; stroke-linejoin: round; }
.lp-attn-ax { position: relative; display: block; height: 15px; margin-top: 4px; font-size: 11px; color: #6b6b6b; }
.lp-attn-ax span { position: absolute; top: 0; padding-left: 3px; white-space: nowrap; }
.lp-attn-ax span.end { left: auto !important; right: 0; padding: 0; }
.lp-attn-ax.sm { height: 12px; margin-top: 2px; font-size: 9.5px; }
.lp-attn-ax.mo { height: 28px; }
.lp-attn-ax.mo span { padding: 0; transform: translateX(-50%); text-align: center; text-transform: capitalize; }
.lp-attn-ax.mo b { display: block; font-weight: 600; color: #333; }
.lp-attn-ax.mo.sm { height: 24px; }
.lp-attn-ax.mo.yr { height: 15px; }
.lp-attn-yr { position: absolute; top: -2px; bottom: -19px; width: 0; border-left: 1px dashed #cfcfcf; pointer-events: none; }
.lp-attn-ax.sm ~ * .lp-attn-yr, .fsh-attn-p .lp-attn-yr { bottom: -14px; }
.lp-attn-cur { position: absolute; top: -2px; bottom: 0; width: 0; border-left: 1.5px solid #111; pointer-events: none; }
.lp-attn-cur[hidden] { display: none; }
.lp-attn-txt strong { font-size: 22px; line-height: 1.15; }
.lp-attn-txt strong em { font-style: normal; }
.lp-attn-txt strong small { margin-left: 6px; font-size: 13px; font-weight: 500; color: #6b6b6b; }
.lp-attn-cap { display: block; margin-top: 8px; font-size: 13px; line-height: 1.4; color: #333; min-height: 18px; }
.lp-attn-cap a { color: inherit; font-weight: 600; text-decoration: underline; text-decoration-color: #ccc; }
.lp-attn-cap small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; font-size: 12px; color: #6b6b6b; }
.lp-attn-plot .lp-attn-svg { touch-action: pan-y; cursor: crosshair; }
.lp-attn-row { display: grid; grid-template-columns: auto 1fr; gap: 10px 28px; align-items: start; padding: 12px 18px; border-bottom: 1px solid var(--line, #ebebeb); }
.lp-attn-row[hidden] { display: none; }
.lp-attn-txt { display: flex; flex-direction: column; gap: 4px; min-width: 210px; }
.lp-attn-txt b { font-size: 15px; font-weight: 700; color: var(--ink, #111); }
.lp-attn-txt > span { font-size: 11px; color: #8a8a8a; }
.lp-attn-plot .lp-attn-svg { height: 48px; }
@media (max-width: 640px) { .lp-attn-ax.mo:not(.sm) { font-size: 10px; } .lp-attn-row { grid-template-columns: 1fr; padding: 12px 14px; } .lp-attn-plot .lp-attn-svg { height: 40px; } .lp-attn-ax span.end { display: none; } }
.lp-attn-up { color: #137a3a; } .lp-attn-down { color: #b0000e; }`;
  document.head.appendChild(css);

  window.LP_ATTN = { change, chart, pick, badge, month, num, peak, signed };
})();
