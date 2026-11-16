#!/usr/bin/env node
// News coverage memory: every 3 hours, refreshes (weekly per subject) for each tracked country and Fashion Index brand the share of
// all news articles worldwide that mention it (GDELT DOC API "volume intensity", in %), averaged per month since
// January 2017, into public.news_coverage_monthly and public.brand_coverage_monthly (lib/news-coverage.js). GDELT allows 1 request every 5 s, so this runs as a
// job instead of from visitors' browsers.
//   node scripts/news-coverage-routine.js
// Data: The GDELT Project (https://www.gdeltproject.org), free for any use with credit.
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const { MAIN: COUNTRIES } = require('../lib/countries.js');
const { FEATURED } = require('./news-world-routine.js');
const { supabaseHeaders } = require('./memory-common.js');
const { coverage, termOf } = require('../lib/news-coverage.js');

// How the news names a country, when it differs from its English short name (GDELT needs 4+ letters).
const QUERY = { US: '"United States"', GB: '("United Kingdom" OR "Britain")', KR: '"South Korea"', TW: '"Taiwan"',
  TR: '("Turkey" OR "Türkiye")', CI: '"Ivory Coast"', NL: '"Netherlands"', PH: '"Philippines"' };
// Brands and magazines of the homepage Fashion Index (assets/fashion-widget.js), worded to avoid other meanings.
const BRANDS = { 'Teen Vogue': '"Teen Vogue"', Vogue: '"Vogue"', ELLE: '"Elle magazine"', "Harper's Bazaar": '"Harpers Bazaar"', InStyle: '"InStyle"',
  WWD: '"Womens Wear Daily"', GQ: '"GQ magazine"', W: '"W magazine"', Burberry: '"Burberry"', Chanel: '"Chanel"', Dior: '"Dior"',
  'Louis Vuitton': '"Louis Vuitton"', 'Hermès': '"Hermes" (fashion OR luxury OR Birkin)', Balmain: '"Balmain"', Gucci: '"Gucci"', Prada: '"Prada"',
  Valentino: '"Valentino" (fashion OR designer)', Versace: '"Versace"', Zara: '"Zara" (fashion OR clothing OR Inditex)', Mango: '"Mango" (fashion OR clothing)',
  Uniqlo: '"Uniqlo"', 'Lakmé Fashion Week': '"Lakme Fashion Week"', 'Tamara Kalinic': '"Tamara Kalinic"' };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function query(cc) {
  if (QUERY[cc]) return QUERY[cc];
  return `"${new Intl.DisplayNames(['en'], { type: 'region' }).of(cc)}"`;
}

// Each run refreshes the subjects saved longest ago (missing ones first) for up to `budget` ms, so GDELT's
// rate limits only slow the fill-in instead of failing it. Subjects saved in the last 6 days are skipped.
async function main(env = process.env, now = new Date(), deps = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required.');
  const fetchImpl = deps.fetch || fetch, wait = deps.sleep || sleep, clock = deps.clock || Date.now, budget = deps.budget ?? 20 * 60000;
  const headers = supabaseHeaders(env.SUPABASE_KEY);
  const savedAt = {};
  for (const [table, col] of [['news_coverage_monthly', 'country_code'], ['brand_coverage_monthly', 'brand']]) {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/${table}?select=${col},saved_at&month=eq.2017-01-01`, { headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    for (const row of await r.json()) savedAt[`${table}:${row[col]}`] = Date.parse(row.saved_at);
  }
  // People and companies of saved reports (samples and bought ones) go first; the reports read them from brand_coverage_monthly.
  const snaps = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/report_snapshots?select=subjects&kind=in.(artist,company)&order=saved_at.desc&limit=1000`, { headers })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const people = [...new Set((Array.isArray(snaps) ? snaps : []).map((r) => termOf(r.subjects)))].filter((t) => t.length >= 3 && t.length <= 60 && !BRANDS[t]);
  const jobs = [...people.map((t) => ['brand_coverage_monthly', 'brand', t, `"${t.replace(/"/g, '')}"`]),
    // World News countries first (the homepage chart), then the rest of the report countries.
    ...[...new Set([...FEATURED, ...COUNTRIES])].map((cc) => ['news_coverage_monthly', 'country_code', cc, query(cc)]),
    ...Object.entries(BRANDS).map(([b, q]) => ['brand_coverage_monthly', 'brand', b, q])]
    .map((j) => [...j, savedAt[`${j[0]}:${j[2]}`] || 0])
    .filter((j) => now - j[4] > 6 * 86400000)
    .sort((x, y) => x[4] - y[4]);
  const start = clock();
  let saved = 0, tried = 0, failed = 0;
  for (const [table, col, key, q] of jobs) {
    if (clock() - start > budget) break;
    tried++;
    try {
      const rows = (await coverage(q, now, { fetchImpl, wait, tries: 2, timeout: 90000 })).map((r) => ({ [col]: key, ...r, saved_at: now.toISOString() }));
      if (rows.length) {
        const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${col},month`,
          { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
        if (!r.ok) throw new Error(`Supabase ${r.status}`);
        saved++;
      }
    } catch (e) { failed++; console.error(`${key}: ${e.message}`); }
    await wait(10000);
  }
  console.log(`Saved ${saved} subjects, ${failed} failed, ${jobs.length - tried} left for the next run.`);
  if (tried && !saved) throw new Error('No subject could be saved.');
  return { saved, failed, left: jobs.length - tried };
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, query, BRANDS };
