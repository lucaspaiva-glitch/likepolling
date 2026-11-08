#!/usr/bin/env node
// Company memory: once a week, saves 10 years of yearly sales and net profit for every company that files with
// the US SEC, into public.company_financials. Uses SEC EDGAR XBRL "frames" (one file per measure and year covers
// every company), so it is about 50 requests. US government data, free to reuse.
//   node scripts/sec-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key).
'use strict';
const { USER_AGENT, fetchBody, setup, rpc } = require('./memory-common');

const FRAMES = 'https://data.sec.gov/api/xbrl/frames/us-gaap';
const YEARS = 10;
const SALES = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'];
const MEASURES = [['profit', 'NetIncomeLoss', 0], ...SALES.map((c, i) => ['revenue', c, i])];
const CHUNK = 2000;

// Merges frame files into one row per company and business year (the year it ended). Sales keep the first concept in SALES order.
function merge(frames) {
  const by = new Map();
  for (const { field, rank, data } of frames) {
    for (const x of data || []) {
      if (!Number.isInteger(x.cik) || x.cik <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(x.end || '') || !Number.isFinite(x.val)) continue;
      const year = Number(x.end.slice(0, 4));
      const k = `${x.cik}:${year}`;
      const r = by.get(k) || { cik: x.cik, year, name: String(x.entityName || '').slice(0, 300) || `CIK ${x.cik}`, period_end: x.end, revenue: null, profit: null, rank: 99 };
      if (field === 'profit') r.profit = Math.round(x.val);
      else if (rank < r.rank) { r.revenue = Math.round(x.val); r.rank = rank; r.period_end = x.end; }
      by.set(k, r);
    }
  }
  return [...by.values()].map(({ rank, ...r }) => r);
}

async function run(env = process.env, deps = {}) {
  deps = setup(env, deps);
  const last = deps.now.getUTCFullYear() - 1;
  const frames = [];
  for (let cy = last - YEARS + 1; cy <= last; cy++) {
    for (const [field, concept, rank] of MEASURES) {
      const body = await fetchBody(`${FRAMES}/${concept}/USD/CY${cy}.json`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, deps);
      frames.push({ field, rank, data: body && Array.isArray(body.data) ? body.data : [] });
      await deps.sleep(150);
    }
  }
  const rows = merge(frames);
  if (rows.length < 1000) throw new Error(`Only ${rows.length} company-years fetched`);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) written += Number(await rpc(env, deps, 'upsert_company_financials', rows.slice(i, i + CHUNK))) || 0;
  const summary = { years: `${last - YEARS + 1}-${last}`, companies: new Set(rows.map((r) => r.cik)).size, rows: written };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, merge, SALES };
if (require.main === module) run().catch((err) => { console.error(`SEC routine failed: ${err.message}`); process.exit(1); });
