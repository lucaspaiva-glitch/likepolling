// Through-time charts on the homepage: views per month of an English Wikipedia page over the
// last 3 full years (Wikimedia pageviews API: open data, no key, CORS allowed). Load before the widgets.
//   LP_ATTN.months(title) -> Promise<[{ m: 'YYYY-MM', v }]>, LP_ATTN.chart(points), LP_ATTN.change(points)
(function () {
  'use strict';
  const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/';
  const cache = {};
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const lang = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function months(title) {
    if (!title) return Promise.resolve([]);
    if (!cache[title]) {
      const now = new Date();
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const from = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 36, 1));
      const url = `${API}${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${ymd(from)}/${ymd(new Date(first - 864e5))}`;
      cache[title] = fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
        .then((j) => (j.items || []).map((i) => ({ m: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}`, v: i.views })));
    }
    return cache[title];
  }
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

  // Line and area in a 100×30 box stretched to the container; the peak is a dot placed in %.
  function chart(pts, label = '') {
    if (!pts || pts.length < 2) return '';
    const max = Math.max(1, ...pts.map((p) => p.v));
    const x = (i) => (i / (pts.length - 1)) * 100;
    const y = (v) => 28 - (v / max) * 26;
    const line = pts.map((p, i) => `${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
    const top = peak(pts);
    const k = pts.indexOf(top);
    return `<span class="lp-attn-svg" role="img" aria-label="${esc(label)}">
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,30 ${line} 100,30" class="lp-attn-area"/><polyline points="${line}" class="lp-attn-line" vector-effect="non-scaling-stroke"/></svg>
      <i class="lp-attn-dot" style="left:${x(k).toFixed(2)}%;top:${((y(top.v) / 30) * 100).toFixed(2)}%" title="${esc(`${month(top.m)}: ${num(top.v)}`)}"></i>
    </span>`;
  }

  const css = document.createElement('style');
  css.textContent = `
.lp-attn-svg { position: relative; display: block; width: 100%; height: 100%; }
.lp-attn-svg svg { display: block; width: 100%; height: 100%; overflow: visible; }
.lp-attn-area { fill: rgba(176, 0, 14, .09); }
.lp-attn-line { fill: none; stroke: #b0000e; stroke-width: 1.6; stroke-linejoin: round; }
.lp-attn-dot { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; background: #fff; border: 2px solid #b0000e; box-sizing: border-box; }
.lp-attn-row { display: grid; grid-template-columns: minmax(280px, 32%) 1fr; gap: 6px 18px; align-items: center; padding: 10px 18px; border-bottom: 1px solid var(--line, #ebebeb); }
.lp-attn-row[hidden] { display: none; }
.lp-attn-txt { display: flex; flex-direction: column; gap: 3px; font-size: 12px; line-height: 1.35; color: #6b6b6b; }
.lp-attn-txt b { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #737373); }
.lp-attn-txt em, .fsh-attn em { font-style: normal; font-weight: 700; }
.lp-attn-plot { height: 44px; }
@media (max-width: 640px) { .lp-attn-row { grid-template-columns: 1fr; padding: 10px 14px; } .lp-attn-plot { height: 40px; } }
.lp-attn-up { color: #137a3a; } .lp-attn-down { color: #b0000e; }`;
  document.head.appendChild(css);

  window.LP_ATTN = { months, change, chart, month, num, peak, signed };
})();
