#!/usr/bin/env node
// Music Index pipeline. Run hourly (GitHub Actions):
//   node scripts/music-chart-routine.js
// For every country in public.youtube_active_users it fetches YouTube's own trending
// chart for the Music category (videos.list, chart=mostPopular, videoCategoryId=10,
// 1 quota unit each) and replaces public.youtube_music_chart in one transaction.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const { fetchJson, toRows, QuotaError } = require('./trending-routine');

const YT_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';
const MUSIC_CATEGORY = '10';
const TOP_N = 10;
const CONCURRENCY = 4;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const supabaseHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

async function getCountries(env, deps) {
  const url = `${env.SUPABASE_URL}/rest/v1/youtube_active_users?select=country_code&order=country_code`;
  const rows = await fetchJson(url, { headers: supabaseHeaders(env.SUPABASE_KEY) }, deps);
  return rows.map((r) => r.country_code);
}

async function fetchMusic(countryCode, env, deps) {
  const url = new URL(YT_VIDEOS);
  const params = { part: 'snippet,statistics', chart: 'mostPopular', videoCategoryId: MUSIC_CATEGORY, regionCode: countryCode, maxResults: String(TOP_N), key: env.YOUTUBE_API_KEY };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const body = await fetchJson(url, {}, deps);
  return toRows(countryCode, body.items);
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log };
  const missing = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const countries = await getCountries(env, deps);
  const rows = [];
  const failed = [];
  let quotaHit = false;
  const queue = [...countries];

  async function worker() {
    while (queue.length && !quotaHit) {
      const code = queue.shift();
      try {
        const r = await fetchMusic(code, env, deps);
        if (r.length) rows.push(...r);
        else failed.push({ code, error: 'empty chart' });
      } catch (err) {
        if (err instanceof QuotaError) quotaHit = true;
        failed.push({ code, error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  for (const code of queue) failed.push({ code, error: 'skipped: quota exceeded' });

  if (!rows.length) throw new Error(`No music chart data fetched (${failed.map((f) => `${f.code}: ${f.error}`).join('; ')})`);

  const written = await fetchJson(
    `${env.SUPABASE_URL}/rest/v1/rpc/replace_youtube_music_chart`,
    { method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify({ payload: rows }) },
    deps
  );
  const summary = { countries: countries.length, updated: countries.length - failed.length, rows: written, failed, quotaHit };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, TOP_N };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Music chart routine failed: ${err.message}`);
    process.exit(1);
  });
}
