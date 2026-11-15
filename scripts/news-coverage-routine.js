#!/usr/bin/env node
// News coverage memory: once a week, saves for each tracked country and Fashion Index brand the share of
// all news articles worldwide that mention it (GDELT DOC API "volume intensity", in %), averaged per month over the last
// 3 full years, into public.news_coverage_monthly and public.brand_coverage_monthly (lib/news-coverage.js). GDELT allows 1 request every 5 s, so this runs as a
// job instead of from visitors' browsers.
//   node scripts/news-coverage-routine.js
// Data: The GDELT Project (https://www.gdeltproject.org), free for any use with credit.
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const { COUNTRIES } = require('../lib/report.js');
const { supabaseHeaders } = require('./memory-common.js');
const { coverage } = require('../lib/news-coverage.js');

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

async function main(env = process.env, now = new Date(), deps = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required.');
  const fetchImpl = deps.fetch || fetch, wait = deps.sleep || sleep;
  const jobs = [...COUNTRIES.map((cc) => ['news_coverage_monthly', 'country_code', cc, query(cc)]),
    ...Object.entries(BRANDS).map(([b, q]) => ['brand_coverage_monthly', 'brand', b, q])];
  let saved = 0, failed = 0;
  for (const [table, col, key, q] of jobs) {
    try {
      const rows = (await coverage(q, now, { fetchImpl, wait })).map((r) => ({ [col]: key, ...r, saved_at: now.toISOString() }));
      if (rows.length) {
        const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${col},month`,
          { method: 'POST', headers: { ...supabaseHeaders(env.SUPABASE_KEY), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
        if (!r.ok) throw new Error(`Supabase ${r.status}`);
        saved += rows.length;
      }
    } catch (e) { failed++; console.error(`${key}: ${e.message}`); }
    await wait(6000);
  }
  console.log(`Saved ${saved} months, ${failed} of ${jobs.length} subjects failed.`);
  if (failed > jobs.length / 2) throw new Error('Most subjects failed.');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, query, BRANDS };
