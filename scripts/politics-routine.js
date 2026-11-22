#!/usr/bin/env node
// Trending politicians: for each tracked country, Gemini reads the last 7 days of saved World News headlines
// (public.news_archive) and names the politicians in them; the 5 named in the most headlines are saved in
// public.politics_trending for the homepage side tab. ~14 small Gemini calls a day.
//   node scripts/politics-routine.js        Env: SUPABASE_URL, SUPABASE_KEY (secret), GEMINI_API_KEY
'use strict';
const { logGemini, isNoCredit } = require('../lib/gemini-usage');
const { MAIN: COUNTRIES } = require('../lib/countries');

const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const DAYS = 7;
const TOP = 5;
const MAX_HEADLINES = 400;
const CONCURRENCY = 4;

function geminiJson(apiKey) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let m = 0;
  return async (prompt) => {
    for (;;) {
      try {
        const res = await ai.models.generateContent({ model: GEMINI_MODELS[m], contents: prompt, config: { responseMimeType: 'application/json' } });
        await logGemini({ model: GEMINI_MODELS[m], usage: res.usageMetadata });
        return JSON.parse(res.text);
      } catch (err) {
        if (isNoCredit(err)) await logGemini({ model: GEMINI_MODELS[m], status: 'no_credit' });
        if (m < GEMINI_MODELS.length - 1 && /NOT_FOUND|\b404\b/.test(String(err && err.message))) m++;
        else throw err;
      }
    }
  };
}

function prompt(cc, headlines) {
  return `Below are numbered news headlines from country ${cc} over the last ${DAYS} days, in their original language.
List every politician named in them: heads of state or government, ministers, members of parliament or congress, party leaders, mayors, governors, candidates for office, and former office holders who are named as such.
Do not list journalists, athletes, artists, business people, judges, police chiefs, royals, or anyone you are not sure is a politician. Never invent anyone: each person must be named in the headlines you cite.
Reply with only a JSON array of objects: {"name": the person's usual name in English, "wiki": the exact English Wikipedia article title if you are sure, else "", "role": at most 6 words, e.g. "President of Brazil", "headlines": the numbers of the headlines that name them}.

${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`;
}

const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// The Wikipedia title must share a word with the name in the headlines ("Lee" -> "Yoon Suk Yeol" is refused).
function sameName(name, wiki) {
  const words = new Set(fold(name).split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  return fold(wiki).split(/[^a-z0-9]+/).some((w) => words.has(w));
}

// Gemini's list, counting only real headline numbers and merging repeats of the same person, most headlines first.
function rank(list, total, top = TOP) {
  if (!Array.isArray(list)) return [];
  const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const byKey = new Map();
  for (const p of list) {
    const name = s(p && p.name, 80);
    if (!name) continue;
    const nums = new Set((Array.isArray(p.headlines) ? p.headlines : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= total));
    if (!nums.size) continue;
    const wiki = sameName(name, p.wiki) ? s(p.wiki, 120) : '';
    const key = (wiki || name).toLowerCase();
    const was = byKey.get(key);
    if (was) nums.forEach((n) => was.nums.add(n));
    else byKey.set(key, { name, wiki_title: wiki || null, role: s(p.role, 60) || null, nums });
  }
  return [...byKey.values()].sort((a, b) => b.nums.size - a.nums.size || a.name.localeCompare(b.name)).slice(0, top)
    .map((p, i) => ({ rank: i + 1, name: p.name, wiki_title: p.wiki_title, role: p.role, headlines: p.nums.size }));
}

// Keeps only people whose Wikidata entry says "politician" (occupation, P106 = Q82955); the name shown becomes the
// Wikipedia title. Two free calls: Wikipedia (title -> Wikidata id, following redirects), then the Wikidata query service.
async function verify(fetchImpl, people) {
  const titles = people.map((p) => p.wiki_title).filter(Boolean);
  if (!titles.length) return [];
  const ua = { 'User-Agent': 'LikePolling/1.0 (https://www.likepolling.com)' };
  const w = await (await fetchImpl(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item', titles: titles.join('|') })}`, { headers: ua })).json();
  const q = w.query || {};
  const to = new Map([...(q.normalized || []), ...(q.redirects || [])].map((r) => [r.from, r.to]));
  const final = (t) => { let x = t; for (let i = 0; i < 3 && to.has(x); i++) x = to.get(x); return x; };
  const ids = new Map((q.pages || []).filter((pg) => pg.pageprops && pg.pageprops.wikibase_item).map((pg) => [pg.title, pg.pageprops.wikibase_item]));
  const qids = [...new Set(ids.values())];
  if (!qids.length) return [];
  const sparql = `SELECT ?item WHERE { VALUES ?item { ${qids.map((x) => `wd:${x}`).join(' ')} } ?item wdt:P106 wd:Q82955 }`;
  const d = await (await fetchImpl(`https://query.wikidata.org/sparql?${new URLSearchParams({ query: sparql, format: 'json' })}`, { headers: { ...ua, Accept: 'application/sparql-results+json' } })).json();
  const ok = new Set(d.results.bindings.map((b) => b.item.value.split('/').pop()));
  return people.filter((p) => p.wiki_title && ok.has(ids.get(final(p.wiki_title)))).map((p) => ({ ...p, wiki_title: final(p.wiki_title), name: final(p.wiki_title).replace(/ \([^)]*\)$/, '') }));
}

async function run(env = process.env, deps = {}) {
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY', 'GEMINI_API_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  const fetchImpl = deps.fetch || fetch;
  const log = deps.log || console.log;
  const ask = deps.ask || geminiJson(env.GEMINI_API_KEY);
  const check = deps.verify || ((people) => verify(fetchImpl, people));
  const now = deps.now ? deps.now() : new Date();
  const base = `${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1`;
  const key = env.SUPABASE_KEY.trim();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const since = new Date(now.getTime() - DAYS * 864e5).toISOString();
  const day = now.toISOString().slice(0, 10);
  const queue = [...(deps.countries || COUNTRIES)];
  const done = [];
  const failed = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let cc; (cc = queue.shift());) {
      try {
        const r = await fetchImpl(`${base}/news_archive?select=title&section=eq.world&country_code=eq.${cc}&first_seen=gte.${encodeURIComponent(since)}&order=best_rank.asc&limit=${MAX_HEADLINES}`, { headers });
        if (!r.ok) throw new Error(`headlines failed (${r.status})`);
        const titles = [...new Set((await r.json()).map((x) => String(x.title || '').trim()).filter(Boolean))];
        if (titles.length < 10) throw new Error(`only ${titles.length} headlines`);
        const rows = (await check(rank(await ask(prompt(cc, titles)), titles.length, 15))).slice(0, TOP).map((p, i) => ({ country_code: cc, day, ...p, rank: i + 1 }));
        if (!rows.length) throw new Error('no politicians found');
        const save = await fetchImpl(`${base}/politics_trending?on_conflict=country_code,rank`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
        if (!save.ok) throw new Error(`save failed (${save.status})`);
        if (rows.length < TOP) await fetchImpl(`${base}/politics_trending?country_code=eq.${cc}&rank=gt.${rows.length}`, { method: 'DELETE', headers });
        done.push(cc);
      } catch (err) {
        failed.push(cc);
        log(`${cc}: ${String(err && err.message).split('\n')[0]}`);
      }
    }
  }));
  log(`Politicians saved for ${done.length} countries; failed: ${failed.join(', ') || 'none'}.`);
  // A failed country keeps yesterday's list; fail the job only if most countries failed.
  if (done.length < Math.ceil((deps.countries || COUNTRIES).length / 2)) throw new Error('Most countries failed.');
  return { done, failed };
}

if (require.main === module) run().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { run, prompt, rank, verify, sameName };
