#!/usr/bin/env node
// Restaurants memory: once a week, saves the Michelin-starred restaurants that Wikidata (CC0 open data)
// records in each tracked country into public.restaurants_michelin: name, city, stars, own website and
// English Wikipedia page, and its state / region (the country's first-level division). Not an official Michelin list; Wikidata can lag behind the latest guide.
//   node scripts/restaurants-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const COUNTRIES = ['GB', 'FR', 'US', 'ES', 'JP', 'PT', 'BR'];
const QUERY = `SELECT ?r ?rLabel ?cc ?stars ?web ?cityLabel ?regLabel ?article WHERE {
  ?r wdt:P31/wdt:P279* wd:Q11707; p:P166 ?st; wdt:P17 ?c. ?st ps:P166 wd:Q20824563.
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  FILTER NOT EXISTS { ?r wdt:P576 ?gone } FILTER NOT EXISTS { ?r wdt:P3999 ?shut }
  OPTIONAL { ?st pq:P1114 ?stars } ?c wdt:P297 ?cc. FILTER(?cc IN (${COUNTRIES.map((c) => `"${c}"`).join(',')}))
  OPTIONAL { ?r wdt:P856 ?web } OPTIONAL { ?r wdt:P131 ?city } OPTIONAL { ?r wdt:P131+ ?reg. ?c wdt:P150 ?reg }
  OPTIONAL { ?article schema:about ?r; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pt,fr,es,ja". } }`;

const label = (b) => (b?.value && !/^Q\d+$/.test(b.value) ? b.value.slice(0, 80) : null);

function rows(bindings, day) {
  const by = new Map();
  for (const b of bindings) {
    const qid = b.r.value.split('/').pop();
    const name = b.rLabel?.value || '';
    if (!/^Q\d+$/.test(qid) || !name || /^Q\d+$/.test(name)) continue;
    const stars = Math.min(3, Math.max(1, Number(b.stars?.value) || 1));
    const old = by.get(qid);
    if (old && (old.stars > stars || (old.stars === stars && (old.region || !b.regLabel)))) continue;
    const web = /^https?:\/\//.test(b.web?.value || '') ? b.web.value : null;
    by.set(qid, { day, qid, country_code: b.cc.value, name: name.slice(0, 120), city: b.cityLabel?.value && !/^Q\d+$/.test(b.cityLabel.value) ? b.cityLabel.value.slice(0, 80) : null,
      stars, website: web, wiki: b.article?.value || null, region: label(b.regLabel) });
  }
  return [...by.values()];
}

// Wikidata often misses closures, so the English Wikipedia intro is checked too: "X was a restaurant",
// or "closed permanently", means it no longer runs.
const closed = (intro) => /^[^.]{0,160}?\bwas (a|an|the)\b[^.]{0,120}\brestaurant/i.test((intro || '').trim().split('\n')[0])
  || /\b(closed permanently|permanently closed)\b/i.test(intro || '');

async function intros(list) {
  const by = new Map(list.filter((x) => x.wiki).map((x) => [decodeURIComponent(x.wiki.split('/wiki/')[1] || '').replace(/_/g, ' '), x.qid]));
  const out = new Map(), titles = [...by.keys()];
  for (let i = 0; i < titles.length; i += 20) {
    const q = new URLSearchParams({ action: 'query', prop: 'extracts', exintro: 1, explaintext: 1, exlimit: 20, redirects: 1, format: 'json', titles: titles.slice(i, i + 20).join('|') });
    const j = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!j?.query) continue;
    const back = new Map([...(j.query.normalized || []), ...(j.query.redirects || [])].map((x) => [x.to, x.from]));
    for (const pg of Object.values(j.query.pages || {})) {
      let t = pg.title;
      while (!by.has(t) && back.has(t)) t = back.get(t);
      if (by.has(t)) out.set(by.get(t), pg.extract || '');
    }
  }
  return out;
}

// A website that no longer exists (404/410, or its domain is gone) is dropped, so the click opens Wikipedia instead.
// Sites that block bots (403) or are slow keep their link.
async function deadSite(u) {
  try {
    const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36' }, signal: AbortSignal.timeout(20000) });
    return r.status === 404 || r.status === 410;
  } catch (e) {
    return /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID/.test(String(e?.cause?.code || e?.cause?.message || ''));
  }
}

async function main(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required.');
  const r = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query: QUERY })}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`Wikidata ${r.status}`);
  const all = rows((await r.json()).results.bindings, new Date().toISOString().slice(0, 10));
  const text = await intros(all);
  const list = all.filter((x) => !closed(text.get(x.qid)));
  for (let i = 0; i < list.length; i += 25) {
    await Promise.all(list.slice(i, i + 25).map(async (x) => { if (x.website && await deadSite(x.website)) x.website = null; }));
  }
  if (list.length < 50) throw new Error(`Only ${list.length} restaurants; not saving.`);
  const key = env.SUPABASE_KEY.trim();
  const w = await fetch(`${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/restaurants_michelin?on_conflict=day,qid`, { method: 'POST', body: JSON.stringify(list),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
  if (!w.ok) throw new Error(`write ${w.status} ${await w.text()}`);
  const day = list[0].day;
  const old = await fetch(`${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/restaurants_michelin?day=eq.${day}&qid=not.in.(${list.map((x) => x.qid).join(',')})`, { method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' } });
  if (!old.ok) throw new Error(`cleanup ${old.status} ${await old.text()}`);
  const per = COUNTRIES.map((c) => `${c} ${list.filter((x) => x.country_code === c).length}`).join(', ');
  console.log(`restaurants: ${list.length} saved (${per}); ${all.length - list.length} closed left out; ${list.filter((x) => !x.website).length} without a working website`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, rows, closed };
