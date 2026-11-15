'use strict';
// News coverage: the share of all online news worldwide that mentions a term (GDELT DOC API "volume
// intensity", in %), averaged per month. Open data from The GDELT Project (https://www.gdeltproject.org),
// free for any use with credit. GDELT allows 1 request every 5 s.
const DOC = 'https://api.gdeltproject.org/api/v2/doc/doc';
const UA = 'LikePolling/1.0 (+https://www.likepolling.com)';
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const stamp = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

// First day 36 months before this month .. last day of last month.
function span(now, months = 36) {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - months, 1));
  return { start: `${stamp(from)}000000`, end: `${stamp(new Date(first - 864e5))}235959` };
}

// GDELT daily timeline -> [{ month: 'YYYY-MM-01', share }] (mean of the days in each month).
function monthly(timeline) {
  const by = new Map();
  for (const d of timeline?.timeline?.[0]?.data || []) {
    const m = `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-01`;
    const v = Number(d.value);
    if (!Number.isFinite(v)) continue;
    const a = by.get(m) || [0, 0];
    by.set(m, [a[0] + v, a[1] + 1]);
  }
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([month, [s, n]]) => ({ month, share: Math.round((s / n) * 10000) / 10000 }));
}

// query is a GDELT query, e.g. '"Brazil"'. Retries with growing waits (GDELT often answers 429).
async function coverage(query, now = new Date(), { fetchImpl = fetch, wait = sleep, tries = 4, timeout = 60000 } = {}) {
  const { start, end } = span(now);
  const url = `${DOC}?${new URLSearchParams({ query, mode: 'timelinevol', startdatetime: start, enddatetime: end, format: 'json' })}`;
  for (let k = 0; k < tries; k++) {
    if (k) await wait(20000 * k);
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      const t = await r.text();
      if (r.ok && t.trim()[0] === '{') return monthly(JSON.parse(t));
    } catch (e) { /* network error: retry */ }
  }
  throw new Error(`GDELT ${query}`);
}

// Saved rows -> chart points, scaled so the busiest month is 100.
function indexed(rows) {
  const max = Math.max(0, ...rows.map((r) => Number(r.share) || 0));
  return max > 0 ? rows.map((r) => ({ day: String(r.month).slice(0, 10), value: Math.round(((Number(r.share) || 0) / max) * 1000) / 10, share: Number(r.share) || 0 })) : [];
}

module.exports = { span, monthly, coverage, indexed };
