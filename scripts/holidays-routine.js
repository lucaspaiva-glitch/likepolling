#!/usr/bin/env node
// Holidays memory: once a week, saves each tracked country's public holidays for this year and next
// (Nager.Date, open source) into public.holidays.
//   node scripts/holidays-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key).
'use strict';
const { USER_AGENT, fetchBody, setup, countries, rpc, each } = require('./memory-common');

const API = 'https://date.nager.at/api/v3/PublicHolidays';

function toRows(country, body) {
  return (Array.isArray(body) ? body : []).filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && (h.name || h.localName) && (h.global !== false))
    .map((h) => ({ country_code: country, day: h.date, local_name: String(h.localName || h.name).slice(0, 200), name: String(h.name || h.localName).slice(0, 200) }));
}

async function run(env = process.env, deps = {}) {
  deps = setup(env, deps);
  const y = deps.now.getUTCFullYear();
  const list = await countries(env, deps);
  const rows = [], failed = [], missing = [];
  await each(list.flatMap((cc) => [y, y + 1].map((year) => [cc, year])), async ([cc, year]) => {
    try {
      const r = toRows(cc, await fetchBody(`${API}/${year}/${cc}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, deps));
      if (r.length) rows.push(...r); else missing.push(`${cc}:${year}`);
    } catch (err) { failed.push({ cc, year, error: err.message }); }
  }, deps);
  if (!rows.length) throw new Error(`No holiday data fetched (${failed.length} failures)`);
  const written = await rpc(env, deps, 'replace_holidays', rows);
  const summary = { countries: list.length, years: [y, y + 1], rows: written, missing, failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows };
if (require.main === module) run().catch((err) => { console.error(`Holidays routine failed: ${err.message}`); process.exit(1); });
