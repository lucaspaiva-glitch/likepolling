#!/usr/bin/env node
// Creator News Shorts pipeline. Run on a schedule (every 8 hours):
//   node scripts/news-shorts-routine.js
// For each site language it searches YouTube for recent creator-economy Shorts
// (search.list, 100 quota units), checks them with videos.list (1 unit: length,
// embeddable, not live, on topic) and replaces that language's rows in public.news_shorts.
// About 910 quota units per run. Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY
// (secret key). Node >= 20, no deps.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');

const YT = 'https://www.googleapis.com/youtube/v3';
const MAX_SECONDS = 180;
const MAX_AGE_DAYS = 7;
const PER_LANG = 15;

const MIN_VIEWS = 1000;

// q: YouTube search terms. topic: the title must name creators/YouTubers, so general
// news that merely matches "news" is dropped. script: the title must be written in
// the language's script (Latin-script languages reject other scripts).
const LATIN_ONLY = /^[^\u0400-\u04FF\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0E7F\u1100-\u11FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]*$/;
const SEARCHES = [
  { lang: 'en', region: 'US', hl: 'en', q: '"content creators"|"creator economy"|youtuber|youtubers|influencers',
    topic: /\b(youtubers?|content creators?|creator economy|creators?|influencers?|streamers?|mrbeast)\b/i, script: LATIN_ONLY },
  { lang: 'pt', region: 'BR', hl: 'pt', q: '"criadores de conteúdo"|youtuber|youtubers|influenciadores',
    topic: /(youtubers?|criador(es|a)? de conte[uú]dos?|influenciador(es|as?)?|influencers?|streamers?)/i, script: LATIN_ONLY },
  { lang: 'pt-PT', region: 'PT', hl: 'pt', q: '"criadores de conteúdos"|"criadores de conteúdo"|youtuber|youtubers|influencers',
    topic: /(youtubers?|criador(es|a)? de conte[uú]dos?|influenciador(es|as?)?|influencers?|streamers?)/i, script: LATIN_ONLY },
  { lang: 'es', region: 'MX', hl: 'es', q: '"creadores de contenido"|youtuber|youtubers|influencers',
    topic: /(youtubers?|creador(es|a)? de contenidos?|influencers?|influenciador(es|as?)?|streamers?)/i, script: LATIN_ONLY },
  { lang: 'de', region: 'DE', hl: 'de', q: 'YouTuber|YouTuberin|"Content Creator"|Influencer',
    topic: /(youtuber(in|innen)?|content.?creator(in|innen|s)?|influencer(in|innen)?|streamer(in|innen)?)/i, script: LATIN_ONLY },
  { lang: 'ru', region: 'RU', hl: 'ru', q: 'ютубер|ютуберы|блогер|блогерша',
    topic: /(ютубер|блогер|блоггер|инфлюенсер|стример|тиктокер)/i, script: /[\u0400-\u04FF]/ },
  { lang: 'uk', region: 'UA', hl: 'uk', q: 'ютубер|ютубери|блогер|блогерка',
    topic: /(ютубер|блогер|блогерк|інфлюенсер|стрімер|тіктокер)/i, script: /[\u0400-\u04FF]/ },
  { lang: 'ko', region: 'KR', hl: 'ko', q: '유튜버|크리에이터|인플루언서',
    topic: /(유튜버|크리에이터|인플루언서|스트리머|BJ)/i, script: /[\uAC00-\uD7AF]/ },
  { lang: 'ja', region: 'JP', hl: 'ja', q: 'ユーチューバー|YouTuber|インフルエンサー',
    topic: /(ユーチューバー|YouTuber|インフルエンサー|配信者|クリエイター|ストリーマー)/i, script: /[\u3040-\u30FF\u3400-\u9FFF]/ },
];
const BY_LANG = Object.fromEntries(SEARCHES.map((s) => [s.lang, s]));

// Title names creators, is in the language's script, and the audio language (when
// the uploader set one) matches.
function onTopic(lang, it) {
  const s = BY_LANG[lang];
  const title = it.snippet?.title || '';
  if (!s || !s.topic.test(title) || !s.script.test(title)) return false;
  const audio = (it.snippet?.defaultAudioLanguage || it.snippet?.defaultLanguage || '').toLowerCase().split('-')[0];
  return !audio || audio === lang.split('-')[0];
}

function seconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const qs = (params) => new URLSearchParams(params).toString();

// Keeps search order; drops anything too long, live, not embeddable, not public,
// under MIN_VIEWS or off topic.
function toRows(lang, ids, items) {
  const byId = new Map((items || []).map((it) => [it.id, it]));
  const rows = [];
  const seen = new Set();
  for (const id of ids) {
    const it = byId.get(id);
    if (!it || !/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const dur = seconds(it.contentDetails?.duration);
    if (dur == null || dur === 0 || dur > MAX_SECONDS) continue;
    if (it.status && (it.status.embeddable === false || (it.status.privacyStatus && it.status.privacyStatus !== 'public'))) continue;
    if (it.snippet?.liveBroadcastContent && it.snippet.liveBroadcastContent !== 'none') continue;
    if (Number(it.statistics?.viewCount || 0) < MIN_VIEWS || !onTopic(lang, it)) continue;
    const key = `${it.snippet?.channelId}|${(it.snippet?.title || '').replace(/#\S+/g, '').trim().slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
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

module.exports = { run, toRows, seconds, onTopic, SEARCHES };

if (require.main === module) {
  run().catch((err) => {
    console.error(`News Shorts routine failed: ${err.message}`);
    process.exit(1);
  });
}
