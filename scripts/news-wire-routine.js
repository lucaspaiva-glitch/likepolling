#!/usr/bin/env node
// Creator News Wire pipeline, run hourly by .github/workflows/news-wire.yml:
//   node scripts/news-wire-routine.js
// Reads Google News RSS search feeds (free, no key) for YouTube and creator
// news in each site language and replaces public.news_wire in one RPC.
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const GOOGLE_NEWS = 'https://news.google.com/rss/search';
const MAX_PER_FEED = 40;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;

const EDITIONS = {
  en: 'hl=en-US&gl=US&ceid=US:en',
  pt: 'hl=pt-BR&gl=BR&ceid=BR:pt-419',
  es: 'hl=es-419&gl=MX&ceid=MX:es-419',
  de: 'hl=de&gl=DE&ceid=DE:de',
  ru: 'hl=ru&gl=RU&ceid=RU:ru',
  uk: 'hl=uk&gl=UA&ceid=UA:uk',
  ko: 'hl=ko&gl=KR&ceid=KR:ko',
  ja: 'hl=ja&gl=JP&ceid=JP:ja',
};
const LIVE_SPAM = '-"ao vivo" -"en vivo" -"live stream" -assistir -"onde assistir" -"dónde ver" -gratis -grátis';
const FEEDS = [
  { lang: 'en', category: 'youtube', q: `intitle:YouTube ${LIVE_SPAM} when:2d` },
  { lang: 'en', category: 'creators', q: '(YouTuber OR YouTubers OR "creator economy" OR "content creators") when:2d' },
  { lang: 'pt', category: 'youtube', q: `intitle:YouTube ${LIVE_SPAM} when:2d` },
  { lang: 'pt', category: 'creators', q: '(youtuber OR youtubers OR "criadores de conteúdo" OR "economia dos criadores") when:2d' },
  { lang: 'es', category: 'youtube', q: `intitle:YouTube ${LIVE_SPAM} when:2d` },
  { lang: 'es', category: 'creators', q: '(youtuber OR youtubers OR "creadores de contenido" OR "economía de creadores") when:2d' },
  { lang: 'de', category: 'youtube', q: `intitle:YouTube ${LIVE_SPAM} when:2d` },
  { lang: 'de', category: 'creators', q: '(YouTuber OR YouTuberin OR "Content Creator" OR "Creator Economy") when:2d' },
  { lang: 'ru', category: 'youtube', q: `(intitle:YouTube OR intitle:Ютуб) ${LIVE_SPAM} when:2d` },
  { lang: 'ru', category: 'creators', q: '(intitle:ютубер OR intitle:ютуберы OR intitle:блогер OR intitle:блогерша) when:2d' },
  { lang: 'uk', category: 'youtube', q: `(intitle:YouTube OR intitle:Ютуб) ${LIVE_SPAM} when:2d` },
  { lang: 'uk', category: 'creators', q: '(intitle:ютубер OR intitle:ютубери OR intitle:блогер OR intitle:блогерка) when:2d' },
  { lang: 'ko', category: 'youtube', q: `(intitle:유튜브 OR intitle:YouTube) ${LIVE_SPAM} when:2d` },
  { lang: 'ko', category: 'creators', q: '(유튜버 OR 크리에이터) when:2d' },
  { lang: 'ja', category: 'youtube', q: `(intitle:YouTube OR intitle:ユーチューブ) ${LIVE_SPAM} when:2d` },
  { lang: 'ja', category: 'creators', q: '(ユーチューバー OR YouTuber OR 動画クリエイター) when:2d' },
];

// Social posts and video pages are not news articles.
// Also drops sites that post fake "watch the game live on YouTube" pages.
const BLOCKED_SOURCES = /^(instagram|facebook|tiktok|youtube|x|twitter|reddit|threads|linkedin|howl\.link)$|universidad de c[oó]rdoba/i;
const SPAM_TITLE = /\b(ao vivo|en vivo|live stream|livestream|assistir|ver gratis|grátis|gratis)\b|\blive on youtube\b|\byoutube live\b|прямая трансляция|смотреть онлайн|пряма трансляція|дивитися онлайн/i;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decode(s) {
  return String(s || '')
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
}

function parseItems(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const raw = m[1];
    const source = tag(raw, 'source');
    let title = tag(raw, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const published = Date.parse(tag(raw, 'pubDate'));
    items.push({ title, source, link: tag(raw, 'link'), published_at: Number.isNaN(published) ? null : new Date(published).toISOString() });
  }
  return items;
}

function keep(item, now) {
  return item.title && /^https:\/\//.test(item.link) && item.published_at &&
    now - Date.parse(item.published_at) <= MAX_AGE_MS &&
    !BLOCKED_SOURCES.test(item.source) && !SPAM_TITLE.test(item.title);
}

async function fetchText(url, deps) {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LikePollingNewsWire/1.0)' } });
    if (res.ok) return res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) throw new Error(`HTTP ${res.status}`);
    await deps.sleep(2 ** attempt * 1000 + Math.floor(Math.random() * 250));
  }
}

async function fetchFeed(feed, deps, now) {
  const url = `${GOOGLE_NEWS}?q=${encodeURIComponent(feed.q)}&${EDITIONS[feed.lang]}`;
  const items = parseItems(await fetchText(url, deps)).filter((it) => keep(it, now));
  items.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  return items.slice(0, MAX_PER_FEED).map((it) => ({ lang: feed.lang, category: feed.category, ...it }));
}

// One row per article and language; the YouTube feed wins when both feeds carry it.
function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k1 = `${r.lang}|${r.link}`;
    const k2 = `${r.lang}|${r.title.toLowerCase()}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2);
    out.push(r);
  }
  return out;
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || Date.now };
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const now = deps.now();
  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f, deps, now)));
  const failed = [];
  const fetched = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length) fetched.push(...r.value);
    else failed.push({ feed: `${FEEDS[i].lang}/${FEEDS[i].category}`, error: r.status === 'rejected' ? r.reason.message : 'no articles' });
  });
  const rows = dedupe(fetched);
  if (!rows.length) throw new Error(`No news fetched (${failed.map((f) => `${f.feed}: ${f.error}`).join('; ')})`);

  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/replace_news_wire`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: rows }),
  });
  const written = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase write failed: ${written?.message || `HTTP ${res.status}`}`);

  const langs = {};
  for (const r of rows) langs[r.lang] = (langs[r.lang] || 0) + 1;
  const summary = { feeds: FEEDS.length, rows: written, langs, failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, parseItems, FEEDS };

if (require.main === module) {
  run().catch((err) => {
    console.error(`News wire routine failed: ${err.message}`);
    process.exit(1);
  });
}
