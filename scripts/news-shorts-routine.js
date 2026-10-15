#!/usr/bin/env node
// Popular Shorts pipeline. Run on a schedule (every 8 hours):
//   node scripts/news-shorts-routine.js
// For each site language's country it asks YouTube search for the most viewed short
// videos of the last 2 days (search.list order=viewCount, no topic: 100 quota units),
// reads their details (videos.list: 1 unit), keeps the embeddable, public, non-live
// ones of 3 minutes or less, and keeps only real Shorts (youtube.com/shorts/<id> opens
// instead of redirecting to /watch). Replaces that language's rows in
// public.news_shorts. About 910 quota units per run.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');

const YT = 'https://www.googleapis.com/youtube/v3';
const MAX_SECONDS = 180;
const MAX_AGE_DAYS = 2;
const PER_LANG = 20;

const SEARCHES = [
  { lang: 'en', region: 'US', hl: 'en' },
  { lang: 'pt', region: 'BR', hl: 'pt' },
  { lang: 'pt-PT', region: 'PT', hl: 'pt' },
  { lang: 'es', region: 'MX', hl: 'es' },
  { lang: 'de', region: 'DE', hl: 'de' },
  { lang: 'ru', region: 'RU', hl: 'ru' },
  { lang: 'uk', region: 'UA', hl: 'uk' },
  { lang: 'ko', region: 'KR', hl: 'ko' },
  { lang: 'ja', region: 'JP', hl: 'ja' },
];

function seconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const qs = (params) => new URLSearchParams(params).toString();

// Keeps search order; drops anything too long, live, not embeddable or not public.
function toRows(lang, ids, items, limit = Infinity) {
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
    if (rows.length >= limit) break;
  }
  return rows;
}

// 'short' when youtube.com/shorts/<id> serves the Short, 'video' when it redirects to
// /watch (a regular video), otherwise 'unknown' (blocked, consent page, network error).
async function shortKind(id, deps) {
  try {
    const r = await deps.fetch(`https://www.youtube.com/shorts/${id}`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; LikePollingBot/1.0)' } });
    if (r.status === 200) return 'short';
    if (r.status >= 300 && r.status < 400 && /\/watch\?/.test(r.headers?.get?.('location') || '')) return 'video';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function fetchLang(s, env, deps, check) {
  const after = new Date(deps.now() - MAX_AGE_DAYS * 86400e3).toISOString();
  const found = await fetchJson(`${YT}/search?${qs({ part: 'id', type: 'video', videoDuration: 'short', videoEmbeddable: 'true', safeSearch: 'strict', order: 'viewCount', maxResults: '50', regionCode: s.region, relevanceLanguage: s.hl, publishedAfter: after, key: env.YOUTUBE_API_KEY })}`, {}, deps);
  const ids = [...new Set((found.items || []).map((it) => it.id?.videoId).filter(Boolean))];
  if (!ids.length) return [];
  const details = await fetchJson(`${YT}/videos?${qs({ part: 'snippet,contentDetails,statistics,status', id: ids.join(','), maxResults: '50', key: env.YOUTUBE_API_KEY })}`, {}, deps);
  const cands = toRows(s.lang, ids, details.items);
  const kinds = [];
  for (let i = 0; i < cands.length && kinds.filter((k) => k === 'short').length < PER_LANG; i += 6) {
    kinds.push(...await Promise.all(cands.slice(i, i + 6).map((r) => shortKind(r.video_id, deps))));
  }
  kinds.forEach((k) => { check[k]++; });
  return cands.filter((_, i) => kinds[i] === 'short').slice(0, PER_LANG).map((r, i) => ({ ...r, rank: i + 1 }));
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: globalThis.fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: console.log, now: Date.now, ...deps };
  for (const k of ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY']) if (!env[k]) throw new Error(`Missing ${k}`);
  const rows = [];
  const failed = [];
  const langs = {};
  let quotaHit = false;
  const check = { short: 0, video: 0, unknown: 0 };
  for (const s of SEARCHES) {
    if (quotaHit) { failed.push({ lang: s.lang, error: 'skipped: quota exceeded' }); continue; }
    try {
      const got = await fetchLang(s, env, deps, check);
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
  const summary = { rows: written, langs, check, failed, quotaHit };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows, seconds, shortKind, SEARCHES };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Popular Shorts routine failed: ${err.message}`);
    process.exit(1);
  });
}
