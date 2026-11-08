#!/usr/bin/env node
// Space memory: once a day, saves the next 50 rocket launches (Launch Library 2) and the latest 50 spaceflight
// headlines (Spaceflight News API), both free from The Space Devs, into public.space_launches / public.space_news.
// One request each: Launch Library allows 15 an hour without a key. Images are not kept (mixed licenses).
//   node scripts/space-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key).
'use strict';
const { USER_AGENT, fetchBody, setup, supabaseHeaders } = require('./memory-common');

const LAUNCHES = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=50&mode=normal';
const NEWS = 'https://api.spaceflightnewsapi.net/v4/articles/?limit=50&ordering=-published_at';
const cut = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n) || null);

function launchRows(body) {
  return (body && Array.isArray(body.results) ? body.results : []).filter((l) => l && l.id && l.name && !Number.isNaN(Date.parse(l.net)))
    .map((l) => {
      const cc = l.pad && l.pad.location && l.pad.location.country && l.pad.location.country.alpha_2_code;
      return {
        id: String(l.id), name: cut(l.name, 200), net: new Date(l.net).toISOString(),
        status: cut(l.status && l.status.abbrev, 40), provider: cut(l.launch_service_provider && l.launch_service_provider.name, 120),
        country_code: /^[A-Z]{2}$/.test(cc || '') ? cc : null,
        site: cut(l.pad && l.pad.location && l.pad.location.name, 160), mission: cut(l.mission && l.mission.name, 200),
      };
    });
}

function newsRows(body) {
  return (body && Array.isArray(body.results) ? body.results : [])
    .filter((a) => a && Number.isInteger(a.id) && a.title && /^https:\/\//.test(a.url || '') && !Number.isNaN(Date.parse(a.published_at)))
    .map((a) => ({ id: a.id, title: cut(a.title, 300), url: String(a.url).slice(0, 600), site: cut(a.news_site, 120), published_at: new Date(a.published_at).toISOString() }));
}

async function run(env = process.env, deps = {}) {
  deps = setup(env, deps);
  const h = { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } };
  const [l, n] = await Promise.all([fetchBody(LAUNCHES, h, deps).catch((e) => ({ error: e.message })), fetchBody(NEWS, h, deps).catch((e) => ({ error: e.message }))]);
  const launches = launchRows(l), news = newsRows(n);
  if (!launches.length && !news.length) throw new Error(`No space data fetched (${l && l.error || ''} ${n && n.error || ''})`.trim());
  await fetchBody(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_space`, { method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify({ launches, news }) }, deps);
  const summary = { launches: launches.length, news: news.length, next: launches[0] ? `${launches[0].name} ${launches[0].net}` : null };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, launchRows, newsRows };
if (require.main === module) run().catch((err) => { console.error(`Space routine failed: ${err.message}`); process.exit(1); });
