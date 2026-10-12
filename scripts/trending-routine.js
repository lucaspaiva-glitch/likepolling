#!/usr/bin/env node
// YouTube Trending pipeline. Run on a schedule (e.g. a Claude Routine, hourly):
//   node scripts/trending-routine.js
// For every country in public.youtube_active_users it fetches YouTube's
// "most popular" chart (videos.list, chart=mostPopular, 1 quota unit each) and
// replaces the snapshot in public.youtube_trending in one transaction.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const YT_VIDEOS = 'https://www.googleapis.com/youtube/v3/videos';
const TOP_N = 10;
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

class QuotaError extends Error {}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v == null ? null : Number(v));

// Retries 429/5xx/rateLimitExceeded with exponential backoff; quotaExceeded is fatal.
async function fetchJson(url, init, deps) {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const reason = body?.error?.errors?.[0]?.reason || '';
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new QuotaError(body.error.message || reason);
    }
    const retryable = res.status === 429 || res.status >= 500 || /rateLimitExceeded/i.test(reason);
    if (!retryable || attempt >= MAX_RETRIES) {
      const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
      throw Object.assign(new Error(msg), { status: res.status });
    }
    await deps.sleep(2 ** attempt * 1000 + Math.floor(Math.random() * 250));
  }
}

function supabaseHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function getCountries(env, deps) {
  const url = `${env.SUPABASE_URL}/rest/v1/youtube_active_users?select=country_code&order=country_code`;
  const rows = await fetchJson(url, { headers: supabaseHeaders(env.SUPABASE_KEY) }, deps);
  return rows.map((r) => r.country_code);
}

function toRows(countryCode, items) {
  return (items || []).map((it, i) => ({
    country_code: countryCode,
    rank: i + 1,
    video_id: it.id,
    title: it.snippet?.title ?? '',
    channel_id: it.snippet?.channelId ?? '',
    channel_title: it.snippet?.channelTitle ?? '',
    category_id: it.snippet?.categoryId ?? null,
    thumbnail_url: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || null,
    view_count: num(it.statistics?.viewCount),
    like_count: num(it.statistics?.likeCount),
    comment_count: num(it.statistics?.commentCount),
    published_at: it.snippet?.publishedAt ?? null,
  }));
}

async function fetchTrending(countryCode, env, deps) {
  const url = new URL(YT_VIDEOS);
  const params = { part: 'snippet,statistics', chart: 'mostPopular', regionCode: countryCode, maxResults: String(TOP_N), key: env.YOUTUBE_API_KEY };
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
        const r = await fetchTrending(code, env, deps);
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

  if (!rows.length) throw new Error(`No trending data fetched (${failed.map((f) => `${f.code}: ${f.error}`).join('; ')})`);

  const written = await fetchJson(
    `${env.SUPABASE_URL}/rest/v1/rpc/replace_youtube_trending`,
    { method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify({ payload: rows }) },
    deps
  );
  const summary = { countries: countries.length, updated: countries.length - failed.length, rows: written, failed, quotaHit };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows, fetchJson, QuotaError, TOP_N };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Trending routine failed: ${err.message}`);
    process.exit(1);
  });
}
