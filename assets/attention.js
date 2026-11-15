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

  // Line and area in a 100×30 box stretched to the container; axis = first and last month under it.
  function chart(pts, label = '', axis = false) {
    if (!pts || pts.length < 2) return '';
    const max = Math.max(1, ...pts.map((p) => p.v));
    const x = (i) => (i / (pts.length - 1)) * 100;
    const y = (v) => 28 - (v / max) * 26;
    const line = pts.map((p, i) => `${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
    return `<span class="lp-attn-svg" role="img" aria-label="${esc(label)}">
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,30 ${line} 100,30" class="lp-attn-area"/><polyline points="${line}" class="lp-attn-line" vector-effect="non-scaling-stroke"/></svg>
    </span>${axis ? `<span class="lp-attn-ax"><span>${esc(month(pts[0].m))}</span><span>${esc(month(pts[pts.length - 1].m))}</span></span>` : ''}`;
  }
  // ▲ 12% / ▼ 8%, green or red.
  const badge = (p) => (p == null ? '' : `<em class="${p >= 0 ? 'lp-attn-up' : 'lp-attn-down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</em>`);

  const css = document.createElement('style');
  css.textContent = `
.lp-attn-svg { position: relative; display: block; width: 100%; height: 100%; }
.lp-attn-svg svg { display: block; width: 100%; height: 100%; overflow: visible; }
.lp-attn-area { fill: rgba(176, 0, 14, .09); }
.lp-attn-line { fill: none; stroke: #b0000e; stroke-width: 1.6; stroke-linejoin: round; }
.lp-attn-ax { display: flex; justify-content: space-between; margin-top: 3px; font-size: 11px; color: #8a8a8a; }
.lp-attn-row { display: grid; grid-template-columns: auto 1fr; gap: 8px 24px; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--line, #ebebeb); }
.lp-attn-row[hidden] { display: none; }
.lp-attn-txt { display: flex; flex-direction: column; gap: 2px; }
.lp-attn-txt b { font-size: 15px; font-weight: 700; color: var(--ink, #111); }
.lp-attn-txt strong { font-size: 22px; line-height: 1.15; }
.lp-attn-txt strong em { font-style: normal; }
.lp-attn-txt strong small { margin-left: 6px; font-size: 13px; font-weight: 500; color: #6b6b6b; }
.lp-attn-txt > span { font-size: 11px; color: #8a8a8a; }
.lp-attn-plot .lp-attn-svg { height: 48px; }
@media (max-width: 640px) { .lp-attn-row { grid-template-columns: 1fr; padding: 12px 14px; } .lp-attn-plot .lp-attn-svg { height: 40px; } }
.lp-attn-up { color: #137a3a; } .lp-attn-down { color: #b0000e; }`;
  document.head.appendChild(css);

  window.LP_ATTN = { months, change, chart, badge, month, num, peak, signed };
})();
