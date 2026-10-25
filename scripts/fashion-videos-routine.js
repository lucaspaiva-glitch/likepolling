#!/usr/bin/env node
// Fashion Index, run twice a day by .github/workflows/fashion-videos.yml:
//   node scripts/fashion-videos-routine.js
// Recent uploads (last 30 days) of the magazine, brand and fashion-week channels in
// fashion-channels.json, ranked by views per hour since upload, at most 2 per channel,
// top 10 per country (thin countries: last 60 days, 3 per channel). Countries in
// FOLLOWS have no active fashion channels of their own and get the combined ranking
// of the countries they follow (no extra YouTube cost). About 1 YouTube unit per
// channel plus 1 per 50 videos. Writes through the service-role RPC replace_fashion_videos.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');
const { rankVideos, toVideo, recentUploads, videoDetails, pool } = require('./education-routine');
const CHANNELS = require('./fashion-channels.json');

const WINDOW_DAYS = 30;
const FILL_MIN = 5;
const FILL_WINDOW_DAYS = 60;
const MAX_PER_CHANNEL = 2;
const FILL_MAX_PER_CHANNEL = 3;
const CONCURRENCY = 6;
// Portugal follows fashion from Italy, Spain, France and the UK (user's call, 2026-10-25).
const FOLLOWS = { PT: ['IT', 'ES', 'FR', 'GB'] };

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rankCountry(list, fresh) {
  const last30 = list.filter((v) => Date.parse(v.published_at) >= fresh);
  const ranked = rankVideos(last30, MAX_PER_CHANNEL);
  return ranked.length >= FILL_MIN ? ranked : rankVideos(list, FILL_MAX_PER_CHANNEL);
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || Date.now, channels: deps.channels || CHANNELS };
  const missing = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  const now = deps.now();
  const since = now - FILL_WINDOW_DAYS * 86400000;
  const fresh = now - WINDOW_DAYS * 86400000;
  const failed = [];
  const broken = new Set();
  let quotaHit = false;

  const owner = new Map();
  const ids = [];
  const jobs = Object.entries(deps.channels).flatMap(([cc, list]) => list.map((ch) => ({ cc, ch })));
  await pool(jobs, CONCURRENCY, async ({ cc, ch }) => {
    if (quotaHit) return;
    try {
      for (const id of await recentUploads(ch.id, env, deps, since)) if (!owner.has(id)) { owner.set(id, cc); ids.push(id); }
    } catch (err) {
      if (err instanceof QuotaError) quotaHit = true;
      if (!/\b404\b|notFound/i.test(err.message)) broken.add(cc);
      failed.push({ channel: ch.handle || ch.id, error: err.message });
    }
  });
  if (quotaHit) throw new Error('YouTube quota exhausted; previous rows kept');
  const recent = {};
  if (ids.length) {
    for (const it of await videoDetails(ids, env, deps)) {
      if (it.snippet?.liveBroadcastContent && it.snippet.liveBroadcastContent !== 'none') continue;
      const cc = owner.get(it.id);
      (recent[cc] ||= []).push({ ...toVideo(cc, it, now), channel_country: cc });
    }
  }
  for (const cc of broken) delete recent[cc];
  for (const [cc, from] of Object.entries(FOLLOWS)) {
    if (from.some((f) => broken.has(f))) continue;
    const list = from.flatMap((f) => recent[f] || []).map((v) => ({ ...v, country_code: cc }));
    if (list.length) recent[cc] = list;
  }
  const countries = Object.keys(recent);
  if (!countries.length) throw new Error(`No fashion videos fetched (${failed.map((f) => `${f.channel}: ${f.error}`).join('; ') || 'no recent uploads'})`);
  const videos = countries.flatMap((cc) => rankCountry(recent[cc], fresh));

  const written = await fetchJson(
    `${env.SUPABASE_URL}/rest/v1/rpc/replace_fashion_videos`,
    { method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ videos }) },
    deps
  );
  const summary = { countries: countries.length, kept_previous: [...broken], videos: videos.length, rows: written, youtube_units: jobs.length + Math.ceil(ids.length / 50), failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, FOLLOWS };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Fashion videos routine failed: ${err.message}`);
    process.exit(1);
  });
}
