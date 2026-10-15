#!/usr/bin/env node
// Trending Shorts pipeline. Run on a schedule (hourly):
//   node scripts/news-shorts-routine.js
// For each site language's country it reads YouTube's own trending chart
// (videos.list, chart=mostPopular, up to 200 videos, 1 quota unit per 50) and keeps
// the Shorts (3 minutes or less, embeddable, public, not live) in chart order,
// replacing that language's rows in public.news_shorts. About 36 quota units per run.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');

const YT = 'https://www.googleapis.com/youtube/v3';
const MAX_SECONDS = 180;
const PER_LANG = 30;
const MAX_PAGES = 4;

const SEARCHES = [
  { lang: 'en', region: 'US' },
  { lang: 'pt', region: 'BR' },
  { lang: 'pt-PT', region: 'PT' },
  { lang: 'es', region: 'MX' },
  { lang: 'de', region: 'DE' },
  { lang: 'ru', region: 'RU' },
  { lang: 'uk', region: 'UA' },
  { lang: 'ko', region: 'KR' },
  { lang: 'ja', region: 'JP' },
];

function seconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const qs = (params) => new URLSearchParams(params).toString();

// Keeps chart order; drops anything too long, live, not embeddable or not public.
function toRows(lang, ids, items) {
  const byId = new Map((items || []).map((it) => [it.id, it]));
  const rows = [];
  for (const id of ids) {
    const it = byId.get(id);
    if (!it || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const dur = seconds(it.contentDetails?.duration);
    if (dur == null || dur === 0 || dur > MAX_SECONDS) continue;
    if (it.status && (it.status.embeddable === false || (it.status.privacyStatus && it.status.privacyStatus !== 'public'))) continue;
    if (it.snippet?.liveBroadcastContent && it.snippet.liveBroadcastContent !== 'none') continue;
    rows.push({
      lang,
      video_id: id,
      rank: rows.length + 1,
      title: it.snippet?.title ?? '',
      channel_id: it.snippet?.channelId ?? '',
      channel_title: it.snippet?.channelTitle ?? '',
      duration_s: dur,
      view_count: it.statistics?.viewCount == null ? null : Number(it.statistics.viewCount),
      published_at: it.snippet?.publishedAt,
    });
    if (rows.length >= PER_LANG) break;
  }
  return rows;
}

async function fetchLang(s, env, deps) {
  const items = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { part: 'snippet,contentDetails,statistics,status', chart: 'mostPopular', regionCode: s.region, maxResults: '50', key: env.YOUTUBE_API_KEY };
    if (pageToken) params.pageToken = pageToken;
    const body = await fetchJson(`${YT}/videos?${qs(params)}`, {}, deps);
    items.push(...(body.items || []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return toRows(s.lang, items.map((it) => it.id), items);
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: globalThis.fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: console.log, now: Date.now, ...deps };
  for (const k of ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY']) if (!env[k]) throw new Error(`Missing ${k}`);
  const rows = [];
  const failed = [];
  const langs = {};
  let quotaHit = false;
  for (const s of SEARCHES) {
    if (quotaHit) { failed.push({ lang: s.lang, error: 'skipped: quota exceeded' }); continue; }
    try {
      const got = await fetchLang(s, env, deps);
      langs[s.lang] = got.length;
      rows.push(...got);
    } catch (err) {
      if (err instanceof QuotaError) quotaHit = true;
      failed.push({ lang: s.lang, error: err.message });
    }
  }
  if (!rows.length && failed.length) throw new Error(`No Shorts fetched (${failed.map((f) => `${f.lang}: ${f.error}`).join('; ') || 'no results'})`);
  const written = await fetchJson(`${env.SUPABASE_URL}/rest/v1/rpc/replace_news_shorts`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: rows }),
  }, deps);
  const summary = { rows: written,  langs, failed, quotaHit };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows, seconds, SEARCHES };

if (require.main === module) {
  run().catch((err) => {
    console.error(`News Shorts routine failed: ${err.message}`);
    process.exit(1);
  });
}
