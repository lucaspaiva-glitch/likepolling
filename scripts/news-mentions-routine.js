#!/usr/bin/env node
// News memory for people and brands: once a day, asks the GDELT DOC API (free, with credit; 1 request
// every 5 s) how many news articles worldwide named each tracked subject per day over the last month,
// and their average tone (-10 very negative .. +10 very positive). Saved in public.news_mentions_daily.
// Tracked: every subject a report was built on (mentions_daily, region_interest_daily) plus SEED.
//   node scripts/news-mentions-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const SEED = ['John John Florence', 'Gabriel Medina', 'Kelly Slater', 'Ítalo Ferreira', 'Carissa Moore', 'Filipe Toledo', 'Anitta (singer)', 'Neymar', 'Bad Bunny', 'MrBeast',
  'Vinícius Júnior', 'Rayssa Leal', 'Shakira', 'Taylor Swift', 'Cristiano Ronaldo', 'Red Bull', 'Monster Energy', 'Celsius Holdings', 'Prime (drink)', 'Coca-Cola',
  'PepsiCo', 'Ambev', 'Liquid Death', 'Gatorade', 'Havaianas', 'GoPro', 'Nike, Inc.', 'Adidas', 'Machu Picchu Energy'];
const term = (t) => t.replace(/ \([^)]*\)$/, '').replace(/,? (Inc|Ltd|Corp|Corporation|plc|S\.A|AG|SE|Co|Group|GmbH)\.?$/i, '').trim();
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

function db(env) {
  const base = `${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/`;
  const h = { apikey: env.SUPABASE_KEY.trim(), Authorization: `Bearer ${env.SUPABASE_KEY.trim()}`, 'Content-Type': 'application/json' };
  return {
    get: async (path) => { const r = await fetch(base + path, { headers: h }); if (!r.ok) throw new Error(`read ${r.status}`); return r.json(); },
    upsert: async (table, rows) => {
      const r = await fetch(`${base}${table}?on_conflict=day,subject`, { method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      if (!r.ok) throw new Error(`write ${r.status} ${await r.text()}`);
    },
  };
}

async function gdelt(q, mode) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${GDELT}?${new URLSearchParams({ query: `"${q.replace(/"/g, '')}"`, mode, format: 'json', timespan: '1month' })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    const t = r ? await r.text().catch(() => '') : '';
    if (r && r.ok && t.trim()[0] === '{') return JSON.parse(t);
    await wait(10000);
  }
  throw new Error('GDELT did not answer');
}
const series = (j) => new Map((j.timeline?.[0]?.data || []).map((d) => [`${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`, Number(d.value) || 0]));

async function main(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required.');
  const d = db(env);
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const seen = (await Promise.all(['mentions_daily', 'region_interest_daily'].map((t) => d.get(`${t}?select=subject&day=gte.${since}&limit=5000`).catch(() => []))));
  const subjects = [...new Set([...SEED, ...seen.flat().map((r) => r.subject)])].filter((s) => term(s).length >= 3).slice(0, 150);
  let ok = 0;
  for (const s of subjects) {
    try {
      const vol = series(await gdelt(term(s), 'timelinevolraw'));
      await wait(6000);
      const tone = vol.size && [...vol.values()].some(Boolean) ? series(await gdelt(term(s), 'timelinetone')) : new Map();
      const rows = [...vol].map(([day, articles]) => ({ day, subject: s, articles, tone: articles && tone.has(day) ? Math.round(tone.get(day) * 100) / 100 : null }));
      if (rows.length) await d.upsert('news_mentions_daily', rows);
      ok++;
      console.log(`${s}: ${rows.reduce((t, r) => t + r.articles, 0)} articles`);
    } catch (e) { console.log(`${s}: ${e.message}`); }
    await wait(6000);
  }
  console.log(`news mentions: ${ok}/${subjects.length} subjects saved`);
  if (!ok) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, term };
