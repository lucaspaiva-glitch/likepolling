#!/usr/bin/env node
// Restaurants memory: once a week, saves the Michelin-starred restaurants that Wikidata (CC0 open data)
// records in each tracked country into public.restaurants_michelin: name, city, stars, own website and
// English Wikipedia page. Not an official Michelin list; Wikidata can lag behind the latest guide.
//   node scripts/restaurants-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const COUNTRIES = ['GB', 'FR', 'US', 'ES', 'JP', 'PT', 'BR'];
const QUERY = `SELECT ?r ?rLabel ?cc ?stars ?web ?cityLabel ?article WHERE {
  ?r wdt:P31/wdt:P279* wd:Q11707; p:P166 ?st; wdt:P17 ?c. ?st ps:P166 wd:Q20824563.
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  OPTIONAL { ?st pq:P1114 ?stars } ?c wdt:P297 ?cc. FILTER(?cc IN (${COUNTRIES.map((c) => `"${c}"`).join(',')}))
  OPTIONAL { ?r wdt:P856 ?web } OPTIONAL { ?r wdt:P131 ?city }
  OPTIONAL { ?article schema:about ?r; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt,fr,es,ja". } }`;

function rows(bindings, day) {
  const by = new Map();
  for (const b of bindings) {
    const qid = b.r.value.split('/').pop();
    const name = b.rLabel?.value || '';
    if (!/^Q\d+$/.test(qid) || !name || /^Q\d+$/.test(name)) continue;
    const stars = Math.min(3, Math.max(1, Number(b.stars?.value) || 1));
    const old = by.get(qid);
    if (old && old.stars >= stars) continue;
    const web = /^https?:\/\//.test(b.web?.value || '') ? b.web.value : null;
    by.set(qid, { day, qid, country_code: b.cc.value, name: name.slice(0, 120), city: b.cityLabel?.value && !/^Q\d+$/.test(b.cityLabel.value) ? b.cityLabel.value.slice(0, 80) : null,
      stars, website: web, wiki: b.article?.value || null });
  }
  return [...by.values()];
}

async function main(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required.');
  const r = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query: QUERY })}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`Wikidata ${r.status}`);
  const list = rows((await r.json()).results.bindings, new Date().toISOString().slice(0, 10));
  if (list.length < 50) throw new Error(`Only ${list.length} restaurants; not saving.`);
  const key = env.SUPABASE_KEY.trim();
  const w = await fetch(`${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/restaurants_michelin?on_conflict=day,qid`, { method: 'POST', body: JSON.stringify(list),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
  if (!w.ok) throw new Error(`write ${w.status} ${await w.text()}`);
  const per = COUNTRIES.map((c) => `${c} ${list.filter((x) => x.country_code === c).length}`).join(', ');
  console.log(`restaurants: ${list.length} saved (${per})`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, rows };
