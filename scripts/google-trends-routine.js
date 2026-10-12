#!/usr/bin/env node
// Google "Trending now" pipeline. Runs hourly via .github/workflows/google-trends.yml:
//   node scripts/google-trends-routine.js
// Reads Google Trends' public "Trending now" RSS feed for every country in
// public.youtube_active_users, merges the searches across countries, flags the
// ones that look like YouTube creators, and replaces public.google_trending.
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Node >= 20, no deps.
'use strict';

const FEED = 'https://trends.google.com/trending/rss?geo=';
const TOP_N = 20;
const CONCURRENCY = 4;
const MAX_RETRIES = 3;
const CREATOR_WORDS = /\b(youtubers?|youtubeurs?|streamers?|youtube stars?|youtube creators?|content creators?)\b/i;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, init, deps, as = 'json') {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url, init);
    if (res.ok) return as === 'text' ? res.text() : res.json();
    if (!(res.status === 429 || res.status >= 500) || attempt >= MAX_RETRIES) {
      const body = await res.text().catch(() => '');
      let msg = `HTTP ${res.status}`;
      try { const j = JSON.parse(body); msg = j.message || j.error?.message || msg; } catch {}
      throw Object.assign(new Error(msg), { status: res.status });
    }
    await deps.sleep(2 ** attempt * 1000 + Math.floor(Math.random() * 250));
  }
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] !== '#') return XML_ENTITIES[e] ?? m;
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(cp);
    })
    .trim();
}
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

function parseTraffic(s) {
  const m = String(s || '').replace(/,/g, '').match(/([\d.]+)\s*([KM])?/i);
  if (!m) return 0;
  return Math.round(Number(m[1]) * ({ K: 1e3, M: 1e6 }[(m[2] || '').toUpperCase()] || 1));
}

function parseFeed(xml) {
  return (String(xml).match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => {
    const news = (it.match(/<ht:news_item>[\s\S]*?<\/ht:news_item>/g) || []).map((n) => ({
      title: tag(n, 'ht:news_item_title'),
      url: tag(n, 'ht:news_item_url'),
      source: tag(n, 'ht:news_item_source'),
    }));
    const traffic = tag(it, 'ht:approx_traffic');
    const pub = Date.parse(tag(it, 'pubDate'));
    return {
      query: tag(it, 'title'),
      traffic,
      traffic_min: parseTraffic(traffic),
      published_at: Number.isNaN(pub) ? null : new Date(pub).toISOString(),
      news,
    };
  }).filter((i) => i.query);
}

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

// Channel names that count as creators; auto-generated "- Topic" and VEVO channels don't.
function creatorNames(names) {
  const set = new Set();
  for (const n of names) {
    if (!n || / - Topic$/i.test(n) || /vevo$/i.test(n)) continue;
    const k = norm(n);
    if (k.length >= 3) set.add(k);
  }
  return set;
}

// Merges each country's feed into one list ranked by Google's own volume figure
// (largest single-country value), then by number of countries, then recency.
function aggregate(feeds, creators, topN = TOP_N) {
  const byKey = new Map();
  for (const { code, items } of feeds) {
    for (const it of items) {
      const key = norm(it.query);
      let e = byKey.get(key);
      if (!e) byKey.set(key, (e = { query: it.query, hits: [], news: [], published_at: null }));
      e.hits.push({ code, traffic: it.traffic, traffic_min: it.traffic_min, news: it.news });
      e.news.push(...it.news);
      if (it.published_at && (!e.published_at || it.published_at > e.published_at)) e.published_at = it.published_at;
    }
  }
  const rows = [...byKey.entries()].map(([key, e]) => {
    e.hits.sort((a, b) => b.traffic_min - a.traffic_min || a.code.localeCompare(b.code));
    const top = e.hits[0];
    const story = top.news.find((n) => n.url) || e.news.find((n) => n.url) || {};
    return {
      query: e.query,
      approx_traffic: top.traffic || null,
      traffic_min: top.traffic_min,
      top_country: top.code,
      countries: e.hits.map((h) => h.code),
      news_title: story.title || null,
      news_url: story.url || null,
      news_source: story.source || null,
      is_creator: creators.has(key) || e.news.some((n) => CREATOR_WORDS.test(n.title)),
      published_at: e.published_at,
    };
  });
  rows.sort((a, b) =>
    b.traffic_min - a.traffic_min ||
    b.countries.length - a.countries.length ||
    String(b.published_at || '').localeCompare(String(a.published_at || '')));
  return rows.slice(0, topN).map((r, i) => ({ rank: i + 1, ...r }));
}

function supabaseHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function collect(env, deps) {
  const sb = (path) => request(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: supabaseHeaders(env.SUPABASE_KEY) }, deps);
  const [countries, channels, entities] = await Promise.all([
    sb('youtube_active_users?select=country_code&order=country_code'),
    sb('youtube_trending?select=channel_title'),
    sb('entities?select=name'),
  ]);
  const creators = creatorNames([...channels.map((c) => c.channel_title), ...entities.map((e) => e.name)]);
  const feeds = [];
  const failed = [];
  const queue = countries.map((c) => c.country_code);
  async function worker() {
    while (queue.length) {
      const code = queue.shift();
      try {
        const items = parseFeed(await request(FEED + encodeURIComponent(code), { headers: { 'User-Agent': 'LikePolling/1.0 (+https://www.likepolling.com)' } }, deps, 'text'));
        if (items.length) feeds.push({ code, items });
        else failed.push({ code, error: 'empty feed' });
      } catch (err) {
        failed.push({ code, error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { rows: aggregate(feeds, creators), countries: countries.length, failed };
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log };
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  const { rows, countries, failed } = await collect(env, deps);
  if (!rows.length) throw new Error(`No trending searches fetched (${failed.map((f) => `${f.code}: ${f.error}`).join('; ')})`);
  const written = await request(
    `${env.SUPABASE_URL}/rest/v1/rpc/replace_google_trending`,
    { method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify({ payload: rows }) },
    deps
  );
  const summary = { countries, updated: countries - failed.length, rows: written, creators: rows.filter((r) => r.is_creator).length, failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, collect, aggregate, parseFeed, parseTraffic, creatorNames, TOP_N };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Google trends routine failed: ${err.message}`);
    process.exit(1);
  });
}
