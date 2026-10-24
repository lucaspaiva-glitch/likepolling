#!/usr/bin/env node
// Education section pipeline, run twice a day by .github/workflows/education.yml:
//   node scripts/education-routine.js
// 1. Education Index: recent uploads (last 30 days) of the channels in
//    education-channels.json, ranked by views per hour since upload, at most
//    MAX_PER_CHANNEL per channel (thin countries: last 60 days, 3 per channel). Costs about 1 YouTube unit per channel
//    (playlistItems.list) plus 1 per 50 videos (videos.list).
// 2. Most talked-about subjects: those videos plus the last 24 h of Google News
//    education headlines for the country, sorted into SUBJECTS by Gemini (batches
//    of CLASSIFY_BATCH). Score = videos × VIDEO_WEIGHT + headlines.
// Writes both through the service-role RPC replace_education.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY (optional:
// without it only the videos are refreshed).
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');
const { parseItems, fetchText } = require('./news-wire-routine');
const { EDITIONS } = require('./news-world-routine');
const CHANNELS = require('./education-channels.json');

const YT = 'https://www.googleapis.com/youtube/v3/';
const WINDOW_DAYS = 30;
const UPLOADS_PER_CHANNEL = 10;
const MAX_PER_CHANNEL = 2;
// Thin countries (fewer than FILL_MIN videos) look back FILL_WINDOW_DAYS with FILL_MAX_PER_CHANNEL per channel.
const FILL_MIN = 5;
const FILL_WINDOW_DAYS = 60;
const FILL_MAX_PER_CHANNEL = 3;
const TOP_N = 10;
const NEWS_PER_COUNTRY = 40;
const VIDEO_WEIGHT = 3;
const SUBJECTS_PER_COUNTRY = 8;
// Long lists made Gemini return the wrong number of labels, so it gets small batches.
const CLASSIFY_BATCH = 25;
const CONCURRENCY = 6;
const MAX_LINK = 2000;
const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const SUBJECTS = {
  ai_tech: 'AI, computing and technology',
  space_physics: 'space, astronomy and physics',
  math: 'mathematics',
  health_biology: 'health, medicine and biology',
  chemistry: 'chemistry and materials',
  climate_environment: 'climate, environment and nature',
  history_geography: 'history, geography and society',
  engineering: 'engineering and how things work',
  exams_admissions: 'exams, university admissions and courses',
  schools_policy: 'schools, teachers and education policy',
  money_careers: 'money, economics and careers',
  languages_culture: 'languages, literature and arts',
};
// Google News search for education news, in each country's language.
const NEWS_QUERY = {
  en: 'education OR university OR students OR scientists',
  pt: 'educação OR universidade OR estudantes OR cientistas',
  es: 'educación OR universidad OR estudiantes OR científicos',
  de: 'Bildung OR Universität OR Schule OR Forscher',
  fr: 'éducation OR université OR étudiants OR scientifiques',
  it: 'istruzione OR università OR studenti OR scienziati',
  ja: '教育 OR 大学 OR 受験 OR 研究者',
  id: 'pendidikan OR universitas OR siswa OR ilmuwan',
  ru: 'образование OR университет OR студенты OR учёные',
  tr: 'eğitim OR üniversite OR öğrenci OR bilim insanları',
  ko: '교육 OR 대학 OR 수능 OR 과학자',
};

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v == null ? null : Number(v));
const ytUrl = (path, params, key) => {
  const u = new URL(YT + path);
  for (const [k, v] of Object.entries({ ...params, key })) u.searchParams.set(k, v);
  return u;
};

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()); }));
}

// Uploads playlist of channel UCxxxx is UUxxxx (no channels.list call needed).
async function recentUploads(channelId, env, deps, since) {
  const body = await fetchJson(ytUrl('playlistItems', { part: 'contentDetails', playlistId: `UU${channelId.slice(2)}`, maxResults: String(UPLOADS_PER_CHANNEL) }, env.YOUTUBE_API_KEY), {}, deps);
  return (body.items || []).filter((it) => Date.parse(it.contentDetails?.videoPublishedAt) >= since).map((it) => it.contentDetails.videoId);
}

async function videoDetails(ids, env, deps) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const body = await fetchJson(ytUrl('videos', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') }, env.YOUTUBE_API_KEY), {}, deps);
    out.push(...(body.items || []));
  }
  return out;
}

function toVideo(country, it, now) {
  const published = it.snippet?.publishedAt;
  const views = num(it.statistics?.viewCount) || 0;
  const hours = Math.max(1, (now - Date.parse(published)) / 3600000);
  return {
    country_code: country, video_id: it.id, title: it.snippet?.title ?? '', channel_id: it.snippet?.channelId ?? '',
    channel_title: it.snippet?.channelTitle ?? '',
    thumbnail_url: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || null,
    view_count: views, like_count: num(it.statistics?.likeCount), published_at: published ?? null,
    views_per_hour: Math.round(views / hours),
  };
}

// Fastest first, at most MAX_PER_CHANNEL per channel, ranked 1..TOP_N.
function rankVideos(videos, max = MAX_PER_CHANNEL) {
  const per = {};
  return [...videos].sort((a, b) => b.views_per_hour - a.views_per_hour)
    .filter((v) => (per[v.channel_id] = (per[v.channel_id] || 0) + 1) <= max)
    .slice(0, TOP_N).map((v, i) => ({ ...v, rank: i + 1 }));
}

function newsUrl(country) {
  const [hl, ceid] = EDITIONS[country];
  const q = NEWS_QUERY[hl.slice(0, 2)] || NEWS_QUERY.en;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=${hl}&gl=${country}&ceid=${ceid}`;
}

async function fetchNews(country, deps) {
  const seen = new Set();
  return parseItems(await fetchText(newsUrl(country), deps)).filter((it) => {
    const k = it.title.toLowerCase();
    if (!it.title || !/^https:\/\//.test(it.link) || it.link.length > MAX_LINK || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, NEWS_PER_COUNTRY);
}

function geminiClassifier(apiKey) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let m = 0;
  let thinking = true;
  return async (titles) => {
    const keys = Object.keys(SUBJECTS);
    const prompt = `Below are YouTube education video titles and education news headlines. For each one, pick the subject it is mainly about from this list (key: meaning):\n${keys.map((k) => `${k}: ${SUBJECTS[k]}`).join('\n')}\nother: none of these, or not about a field of study\nReply with only a JSON array of keys, one per item, in the same order.\n\n${JSON.stringify(titles)}`;
    let res;
    for (;;) {
      const config = { responseMimeType: 'application/json', ...(thinking ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : {}) };
      try {
        res = await ai.models.generateContent({ model: GEMINI_MODELS[m], contents: prompt, config });
        break;
      } catch (err) {
        const msg = String(err && err.message);
        if (thinking && /thinking/i.test(msg)) thinking = false;
        else if (m < GEMINI_MODELS.length - 1 && /NOT_FOUND|\b404\b/.test(msg)) m++;
        else throw err;
      }
    }
    const out = JSON.parse(res.text);
    if (!Array.isArray(out) || out.length !== titles.length) throw new Error('classification count mismatch');
    return out.map((k) => (SUBJECTS[k] ? k : 'other'));
  };
}

async function classifyAll(titles, classify) {
  const out = [];
  for (let i = 0; i < titles.length; i += CLASSIFY_BATCH) {
    const batch = titles.slice(i, i + CLASSIFY_BATCH);
    out.push(...await classify(batch).catch(() => classify(batch)));
  }
  return out;
}

// videos: all recent videos of the country (fastest first); news: headlines in Google News order.
function scoreSubjects(country, videos, videoKeys, news, newsKeys) {
  const by = {};
  const get = (k) => (by[k] ||= { subject: k, video_count: 0, news_count: 0, ev: null, en: null });
  videos.forEach((v, i) => { const k = videoKeys[i]; if (!SUBJECTS[k]) return; const s = get(k); s.video_count++; s.ev ||= v; });
  news.forEach((n, i) => { const k = newsKeys[i]; if (!SUBJECTS[k]) return; const s = get(k); s.news_count++; s.en ||= n; });
  return Object.values(by)
    .map((s) => ({ ...s, score: s.video_count * VIDEO_WEIGHT + s.news_count }))
    .sort((a, b) => b.score - a.score || b.video_count - a.video_count)
    .slice(0, SUBJECTS_PER_COUNTRY)
    .map((s, i) => ({
      country_code: country, rank: i + 1, subject: s.subject, score: s.score, video_count: s.video_count, news_count: s.news_count,
      example_video_id: s.ev?.video_id ?? null, example_video_title: s.ev?.title ?? null,
      example_news_title: s.en?.title ?? null, example_news_link: s.en?.link ?? null, example_news_source: s.en?.source ?? null,
    }));
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, classify: deps.classify || null, now: deps.now || Date.now, channels: deps.channels || CHANNELS };
  const missing = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  if (!deps.classify && env.GEMINI_API_KEY) {
    try { deps.classify = geminiClassifier(env.GEMINI_API_KEY); } catch (err) { deps.log(`Subjects skipped: ${err.message.split('\n')[0]}`); }
  }
  const now = deps.now();
  const since = now - FILL_WINDOW_DAYS * 86400000;
  const fresh = now - WINDOW_DAYS * 86400000;
  const failed = [];
  let quotaHit = false;

  // 1. Uploads of every channel, then their stats in batches of 50.
  const owner = new Map();
  const ids = [];
  const jobs = Object.entries(deps.channels).flatMap(([cc, list]) => list.map((ch) => ({ cc, ch })));
  const broken = new Set();
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
  const recent = {};
  if (ids.length && !quotaHit) {
    for (const it of await videoDetails(ids, env, deps)) {
      if (it.snippet?.liveBroadcastContent && it.snippet.liveBroadcastContent !== 'none') continue;
      const cc = owner.get(it.id);
      (recent[cc] ||= []).push(toVideo(cc, it, now));
    }
  }
  // A country whose channel lookup failed keeps its previous lists (a deleted channel, 404, does not block it).
  for (const cc of broken) delete recent[cc];
  const cap = {};
  for (const [cc, list] of Object.entries(recent)) {
    list.sort((a, b) => b.views_per_hour - a.views_per_hour);
    const last30 = list.filter((v) => Date.parse(v.published_at) >= fresh);
    if (rankVideos(last30).length >= FILL_MIN) { recent[cc] = last30; cap[cc] = MAX_PER_CHANNEL; } else cap[cc] = FILL_MAX_PER_CHANNEL;
  }
  const countries = Object.keys(recent);
  if (!countries.length) throw new Error(`No education videos fetched (${failed.map((f) => `${f.channel}: ${f.error}`).join('; ') || 'no recent uploads'})`);

  // 2. Subjects: one classification call per country.
  const videos = [];
  const subjects = [];
  const subjectErrors = [];
  await pool(countries, 3, async (cc) => {
    const ranked = rankVideos(recent[cc], cap[cc]);
    if (!deps.classify) { videos.push(...ranked); return; }
    try {
      const news = await fetchNews(cc, deps).catch((err) => { subjectErrors.push({ cc, error: `news: ${err.message}` }); return []; });
      const keys = await classifyAll([...recent[cc].map((v) => v.title), ...news.map((n) => n.title)], deps.classify);
      const vKeys = keys.slice(0, recent[cc].length);
      const subjectOf = new Map(recent[cc].map((v, i) => [v.video_id, vKeys[i]]));
      videos.push(...ranked.map((v) => ({ ...v, subject: subjectOf.get(v.video_id) === 'other' ? null : subjectOf.get(v.video_id) || null })));
      subjects.push(...scoreSubjects(cc, recent[cc], vKeys, news, keys.slice(recent[cc].length)));
    } catch (err) {
      subjectErrors.push({ cc, error: err.message.split('\n')[0] });
      videos.push(...ranked);
    }
  });

  const written = await fetchJson(
    `${env.SUPABASE_URL}/rest/v1/rpc/replace_education`,
    { method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ videos, subjects }) },
    deps
  );
  const summary = { countries: countries.length, kept_previous: [...broken], filled: countries.filter((cc) => cap[cc] === FILL_MAX_PER_CHANNEL), videos: videos.length, subjects: subjects.length, rows: written, youtube_units: jobs.length + Math.ceil(ids.length / 50), failed, subjectErrors, quotaHit };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, rankVideos, scoreSubjects, newsUrl, toVideo, SUBJECTS, NEWS_QUERY };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Education routine failed: ${err.message}`);
    process.exit(1);
  });
}
