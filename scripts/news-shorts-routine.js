#!/usr/bin/env node
// Creator News Shorts pipeline. Run on a schedule (every 8 hours):
//   node scripts/news-shorts-routine.js
// For each site language it searches YouTube for recent creator-economy Shorts
// (search.list, 100 quota units), checks them with videos.list (1 unit: length,
// embeddable, not live) and replaces that language's rows in public.news_shorts.
// About 910 quota units per run. Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY
// (secret key). Node >= 20, no deps.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');

const YT = 'https://www.googleapis.com/youtube/v3';
const MAX_SECONDS = 180;
const MAX_AGE_DAYS = 7;
const PER_LANG = 15;

const SEARCHES = [
  { lang: 'en', region: 'US', hl: 'en', q: 'youtuber news|creator economy|content creators news' },
  { lang: 'pt', region: 'BR', hl: 'pt', q: 'youtuber notícias|criadores de conteúdo|economia dos criadores' },
  { lang: 'pt-PT', region: 'PT', hl: 'pt', q: 'youtuber notícias|criadores de conteúdos|criadores de conteúdo' },
  { lang: 'es', region: 'MX', hl: 'es', q: 'youtuber noticias|creadores de contenido|economía de creadores' },
  { lang: 'de', region: 'DE', hl: 'de', q: 'YouTuber Nachrichten|Content Creator News|Creator Economy' },
  { lang: 'ru', region: 'RU', hl: 'ru', q: 'ютубер новости|блогер новости' },
  { lang: 'uk', region: 'UA', hl: 'uk', q: 'ютубер новини|блогер новини' },
  { lang: 'ko', region: 'KR', hl: 'ko', q: '유튜버 뉴스|크리에이터 뉴스' },
  { lang: 'ja', region: 'JP', hl: 'ja', q: 'ユーチューバー ニュース|YouTuber ニュース' },
];

function seconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const qs = (params) => new URLSearchParams(params).toString();

// Keeps search order; drops anything too long, live, not embeddable or not public.
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
  const after = new Date(deps.now() - MAX_AGE_DAYS * 86400000).toISOString();
  const found = await fetchJson(`${YT}/search?${qs({ part: 'snippet', type: 'video', videoDuration: 'short', videoEmbeddable: 'true', safeSearch: 'strict', order: 'relevance', maxResults: '50', q: s.q, regionCode: s.region, relevanceLanguage: s.hl, publishedAfter: after, key: env.YOUTUBE_API_KEY })}`, {}, deps);
  const ids = [...new Set((found.items || []).map((it) => it.id?.videoId).filter(Boolean))];
  if (!ids.length) return [];
  const details = await fetchJson(`${YT}/videos?${qs({ part: 'snippet,contentDetails,statistics,status', id: ids.join(','), maxResults: '50', key: env.YOUTUBE_API_KEY })}`, {}, deps);
  return toRows(s.lang, ids, details.items);
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
  if (!rows.length) throw new Error(`No Shorts fetched (${failed.map((f) => `${f.lang}: ${f.error}`).join('; ') || 'no results'})`);
  const written = await fetchJson(`${env.SUPABASE_URL}/rest/v1/rpc/replace_news_shorts`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: rows }),
  }, deps);
  const summary = { rows: written, langs, failed, quotaHit };
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
