#!/usr/bin/env node
// "Most Viewed This Month" pipeline. Run daily (GitHub Actions):
//   node scripts/monthly-top-routine.js
// For each country in COUNTRIES it asks YouTube search for videos uploaded since the
// 1st of the month (UTC), ordered by view count, in the country's main language
// (search.list, 100 quota units), reads their statistics (videos.list, 1 unit), keeps
// the 10 most viewed and replaces public.youtube_monthly_top in one transaction.
// About 1,010 quota units per run. Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');

const YT = 'https://www.googleapis.com/youtube/v3';
const TOP_N = 10;
const CANDIDATES = 25;
const CONCURRENCY = 2;
// Largest YouTube audiences on the tracked list, plus Portugal. [country, relevanceLanguage]
const COUNTRIES = [
  ['IN', 'hi'], ['US', 'en'], ['ID', 'id'], ['BR', 'pt'], ['MX', 'es'],
  ['JP', 'ja'], ['DE', 'de'], ['VN', 'vi'], ['PH', 'tl'], ['PT', 'pt'],
];

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v == null ? null : Number(v));
const monthStart = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

function ytUrl(path, params) {
  const url = new URL(`${YT}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

function toRows(countryCode, periodStart, items) {
  const since = periodStart.getTime();
  return (items || [])
    .filter((it) => !it.snippet?.publishedAt || Date.parse(it.snippet.publishedAt) >= since)
    .sort((a, b) => (num(b.statistics?.viewCount) || 0) - (num(a.statistics?.viewCount) || 0))
    .slice(0, TOP_N)
    .map((it, i) => ({
      country_code: countryCode,
      rank: i + 1,
      video_id: it.id,
      title: it.snippet?.title ?? '',
      channel_id: it.snippet?.channelId ?? '',
      channel_title: it.snippet?.channelTitle ?? '',
      thumbnail_url: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || null,
      view_count: num(it.statistics?.viewCount),
      like_count: num(it.statistics?.likeCount),
      published_at: it.snippet?.publishedAt ?? null,
      period_start: periodStart.toISOString().slice(0, 10),
    }));
}

async function fetchCountry([code, lang], periodStart, env, deps) {
  const search = await fetchJson(ytUrl('search', {
    part: 'id', type: 'video', order: 'viewCount', publishedAfter: periodStart.toISOString(),
    regionCode: code, relevanceLanguage: lang, maxResults: String(CANDIDATES), key: env.YOUTUBE_API_KEY,
  }), {}, deps);
  const ids = (search.items || []).map((it) => it.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const videos = await fetchJson(ytUrl('videos', { part: 'snippet,statistics', id: ids.join(','), key: env.YOUTUBE_API_KEY }), {}, deps);
  return toRows(code, periodStart, videos.items);
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || new Date(), countries: deps.countries || COUNTRIES };
  const missing = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const periodStart = monthStart(deps.now);
  const rows = [];
  const failed = [];
  let quotaHit = false;
  const queue = [...deps.countries];

  async function worker() {
    while (queue.length && !quotaHit) {
      const country = queue.shift();
      try {
        const r = await fetchCountry(country, periodStart, env, deps);
        if (r.length) rows.push(...r);
        else failed.push({ code: country[0], error: 'no videos' });
      } catch (err) {
        if (err instanceof QuotaError) quotaHit = true;
        failed.push({ code: country[0], error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  for (const [code] of queue) failed.push({ code, error: 'skipped: quota exceeded' });

  if (!rows.length) throw new Error(`No monthly data fetched (${failed.map((f) => `${f.code}: ${f.error}`).join('; ')})`);

  const written = await fetchJson(
    `${env.SUPABASE_URL}/rest/v1/rpc/replace_youtube_monthly_top`,
    {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: rows, tracked: deps.countries.map(([c]) => c) }),
    },
    deps
  );
  const summary = { countries: deps.countries.length, updated: deps.countries.length - failed.length, rows: written, since: rows[0].period_start, failed, quotaHit };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows, monthStart, COUNTRIES, TOP_N };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Monthly top routine failed: ${err.message}`);
    process.exit(1);
  });
}
