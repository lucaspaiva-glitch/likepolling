#!/usr/bin/env node
// Google Trends memory: every 2 hours, saves each tracked country's "trending now" searches
// (Google Trends public RSS feed, about 10 at a time) into public.trends_daily, one row per search
// per UTC day, keeping the highest approximate traffic seen. Only the search, its traffic and start
// time are kept; the linked news headlines are not.
//   node scripts/trends-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key).
'use strict';
const { USER_AGENT, fetchBody, setup, countries, rpc, each } = require('./memory-common');

const FEED = 'https://trends.google.com/trending/rss?geo=';
const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };

// "500+" -> 500, "2K+" -> 2000, "1,000+" -> 1000, "1M+" -> 1000000.
function traffic(s) {
  const m = String(s || '').replace(/[.,\s]/g, '').match(/^(\d+)([KM]?)/i);
  return m ? Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1) : null;
}

function parse(country, xml, now) {
  return String(xml || '').split('<item>').slice(1).map((item) => {
    const query = tag(item, 'title').slice(0, 200);
    const pub = new Date(tag(item, 'pubDate'));
    const started = Number.isNaN(pub.getTime()) ? null : pub;
    return query && { day: (started || now).toISOString().slice(0, 10), country_code: country, query, traffic: traffic(tag(item, 'ht:approx_traffic')), started_at: started && started.toISOString() };
  }).filter(Boolean);
}

async function run(env = process.env, deps = {}) {
  deps = setup(env, deps);
  const list = await countries(env, deps);
  const rows = [], failed = [], empty = [];
  await each(list, async (cc) => {
    try {
      const r = parse(cc, await fetchBody(FEED + cc, { headers: { 'User-Agent': USER_AGENT } }, deps, true), deps.now);
      if (r.length) rows.push(...r); else empty.push(cc);
    } catch (err) { failed.push({ cc, error: err.message }); }
  }, deps);
  if (!rows.length) throw new Error(`No Google Trends data fetched (${failed.length} failures)`);
  const written = await rpc(env, deps, 'upsert_trends_daily', rows);
  const summary = { countries: list.length, rows: written, empty, failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, parse, traffic };
if (require.main === module) run().catch((err) => { console.error(`Google Trends routine failed: ${err.message}`); process.exit(1); });
