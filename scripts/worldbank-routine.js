#!/usr/bin/env node
// Saves World Bank numbers for our tracked countries in public.country_indicators, so search pages have them
// even when the World Bank API is down (it often answers 502). Free, no key. Runs weekly.
//   node scripts/worldbank-routine.js        Env: SUPABASE_URL, SUPABASE_KEY (secret)
'use strict';
const { MAIN: COUNTRIES } = require('../lib/countries');
const { WB, wbRows } = require('../lib/key-stats');

async function run(env = process.env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const log = deps.log || console.log;
  const pause = deps.pause || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = `${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1`;
  const key = env.SUPABASE_KEY.trim();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const done = [];
  const failed = [];
  for (const cc of deps.countries || COUNTRIES) {
    const rows = [];
    for (const [id] of WB) {
      rows.push(...(await wbRows(fetchImpl, cc, id)).map((r) => ({ country_code: cc, indicator: id, year: r.year, value: r.value })));
      await pause(500);
    }
    if (!rows.length) { failed.push(cc); continue; }
    const save = await fetchImpl(`${base}/country_indicators?on_conflict=country_code,indicator,year`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    if (save.ok) done.push(cc); else { failed.push(cc); log(`${cc}: save failed (${save.status})`); }
  }
  log(`World Bank numbers saved for ${done.length} countries; failed: ${failed.join(', ') || 'none'}.`);
  // Saved rows stay until the next good run, so the job fails only when nothing at all was saved.
  if (!done.length) throw new Error('World Bank answered for no country.');
  return { done, failed };
}

if (require.main === module) run().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { run };
