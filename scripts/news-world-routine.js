// World News Wire: Google News "Top stories" for each Trending Index country, in
// Google News' own order and the country's language, with each article's own
// preview image. Writes public.news_world through the service-role RPC
// replace_news_world. Run hourly by .github/workflows/news-world.yml.
const { parseItems, fetchText, imageFor } = require('./news-wire-routine');

const TOP_N = 30;
const FEED_CONCURRENCY = 6;
const IMAGE_LOOKUPS_PER_RUN = 400;
const IMAGE_CONCURRENCY = 6;
// The site shows only stories with their own photo. Countries with fewer than
// PHOTO_TARGET top stories with a photo are topped up with recent stories from
// the country's other Google News sections (or more search results).
const PHOTO_TARGET = 12; // the site shows 10, the rest stand in for photos a browser can't load
const SECTIONS = ['NATION', 'WORLD', 'BUSINESS', 'ENTERTAINMENT', 'SPORTS', 'TECHNOLOGY'];
const SECTION_DEPTH = 15;
const TOPUP_LOOKUPS_PER_RUN = 400;
// Headlines are translated once into every site language and reused afterwards.
const SITE_LANGS = ['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];
// Cheapest suitable models first; the next is used if one is retired.
const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const TRANSLATE_BATCH = 40;
const TRANSLATIONS_PER_RUN = 800;

// Google News edition per country: [hl, ceid].
const EDITIONS = {
  AR: ['es-419', 'AR:es-419'], AU: ['en-AU', 'AU:en'], BD: ['bn', 'BD:bn'], BE: ['nl', 'BE:nl'],
  BR: ['pt-BR', 'BR:pt-419'], CA: ['en-CA', 'CA:en'], CL: ['es-419', 'CL:es-419'], CO: ['es-419', 'CO:es-419'],
  DE: ['de', 'DE:de'], DZ: ['fr', 'DZ:fr'], EC: ['es-419', 'EC:es-419'], EG: ['ar', 'EG:ar'],
  ES: ['es', 'ES:es'], FR: ['fr', 'FR:fr'], GB: ['en-GB', 'GB:en'], ID: ['id', 'ID:id'],
  IN: ['en-IN', 'IN:en'], IQ: ['ar', 'IQ:ar'], IT: ['it', 'IT:it'], JP: ['ja', 'JP:ja'],
  KE: ['en-KE', 'KE:en'], KR: ['ko', 'KR:ko'], MA: ['fr', 'MA:fr'], MX: ['es-419', 'MX:es-419'],
  MY: ['en-MY', 'MY:en'], NG: ['en-NG', 'NG:en'], NL: ['nl', 'NL:nl'], PE: ['es-419', 'PE:es-419'],
  PH: ['en-PH', 'PH:en'], PK: ['en-PK', 'PK:en'], PL: ['pl', 'PL:pl'], PT: ['pt-PT', 'PT:pt-150'],
  RO: ['ro', 'RO:ro'], SA: ['ar', 'SA:ar'], TH: ['th', 'TH:th'], TR: ['tr', 'TR:tr'],
  TW: ['zh-TW', 'TW:zh-Hant'], UA: ['uk', 'UA:uk'], US: ['en-US', 'US:en'], VN: ['vi', 'VN:vi'],
  ZA: ['en-ZA', 'ZA:en'],
};
// No Google News edition of their own (Google serves France's, Egypt's or US
// Spanish news instead), so these use a Google News search for the country's name.
const SEARCH = { DZ: 'Algérie', EC: 'Ecuador', IQ: 'العراق' };
const BLOCKED_SOURCES = /^(instagram|facebook|tiktok|youtube|x|twitter|reddit|threads|linkedin)$/i;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function feedUrl(cc, days = 1) {
  const [hl, ceid] = EDITIONS[cc];
  const edition = `hl=${hl}&gl=${cc}&ceid=${ceid}`;
  return SEARCH[cc]
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(`${SEARCH[cc]} when:${days}d`)}&${edition}`
    : `https://news.google.com/rss?${edition}`;
}

function sectionUrl(cc, topic) {
  const [hl, ceid] = EDITIONS[cc];
  return `https://news.google.com/rss/headlines/section/topic/${topic}?hl=${hl}&gl=${cc}&ceid=${ceid}`;
}

function uniqueItems(items, seen) {
  return items.filter((it) => {
    if (!it.title || !/^https:\/\//.test(it.link) || BLOCKED_SOURCES.test(it.source)) return false;
    const k = it.title.toLowerCase();
    if (seen.has(it.link) || seen.has(k)) return false;
    seen.add(it.link); seen.add(k);
    return true;
  });
}

async function fetchCountry(cc, deps) {
  const seen = new Set();
  const items = uniqueItems(parseItems(await fetchText(feedUrl(cc), deps)), seen);
  return { top: items.slice(0, TOP_N).map((it, i) => ({ country_code: cc, rank: i + 1, ...it })), more: items.slice(TOP_N), seen };
}

// Top-up candidates, most recent first: the rest of the search results for
// search countries (plus a 3-day search), otherwise the leading stories of each section feed.
async function topUpCandidates(cc, more, seen, deps) {
  const lists = [more];
  if (SEARCH[cc]) lists.push(await fetchText(feedUrl(cc, 3), deps).then(parseItems).catch(() => []));
  else {
    lists.push(...await Promise.all(SECTIONS.map((t) => fetchText(sectionUrl(cc, t), deps)
      .then((xml) => parseItems(xml).slice(0, SECTION_DEPTH)).catch(() => []))));
  }
  const ts = (it) => Date.parse(it.published_at) || 0;
  return uniqueItems(lists.flat(), seen).sort((a, b) => ts(b) - ts(a));
}

async function loadStoredImages(env, deps) {
  const stored = new Map();
  for (const table of ['news_world', 'news_wire']) {
    try {
      const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=link,image_url&image_url=not.is.null&limit=20000`, { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } });
      if (res.ok) for (const r of await res.json()) if (!stored.has(r.link)) stored.set(r.link, r.image_url);
    } catch { /* nothing stored yet */ }
  }
  return stored;
}

// Adds top-up stories after each short country's top stories until it has
// PHOTO_TARGET with a photo. Looked-up stories without a photo are kept (with
// image_url '') so they aren't looked up again next run; the site hides them.
async function topUp(rows, extras, stored, deps) {
  let budget = TOPUP_LOOKUPS_PER_RUN;
  let added = 0;
  const queue = Object.keys(extras);
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, async () => {
    while (queue.length) {
      const cc = queue.shift();
      const own = rows.filter((r) => r.country_code === cc);
      let have = own.filter((r) => r.image_url).length;
      let rank = own.length;
      for (const it of extras[cc]) {
        if (have >= PHOTO_TARGET) break;
        let img;
        if (stored.has(it.link)) img = stored.get(it.link);
        else if (budget > 0) { budget--; img = await imageFor(it.link, deps); }
        else break;
        if (img == null) continue;
        rows.push({ country_code: cc, rank: ++rank, ...it, image_url: img });
        if (img) { have++; added++; }
      }
    }
  }));
  return { added, looked: TOPUP_LOOKUPS_PER_RUN - budget };
}

// Images already stored (here or in the Creator News Wire) are reused; new
// articles are looked up top stories first, each link once, capped per run.
async function addImages(rows, stored, deps) {
  const todo = new Map();
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (stored.has(r.link)) r.image_url = stored.get(r.link);
    else { r.image_url = null; if (!todo.has(r.link)) todo.set(r.link, []); todo.get(r.link).push(r); }
  }
  const queue = [...todo.entries()].slice(0, IMAGE_LOOKUPS_PER_RUN);
  const looked = queue.length;
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, async () => {
    while (queue.length) {
      const [link, list] = queue.shift();
      const img = await imageFor(link, deps);
      for (const r of list) r.image_url = img;
    }
  }));
  return { looked, with_image: rows.filter((r) => r.image_url).length };
}

function geminiTranslator(apiKey) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let m = 0;
  let thinking = true;
  return async (titles) => {
    const prompt = `Translate each news headline below into these languages: en (English), pt (Brazilian Portuguese), pt-PT (European Portuguese), es (Spanish), de (German), ru (Russian), uk (Ukrainian), ko (Korean), ja (Japanese). Keep names, numbers and meaning exact; do not add or drop information. Reply with only a JSON array with one object per headline, in the same order, each with exactly the keys ${SITE_LANGS.map((l) => `"${l}"`).join(', ')}.\n\n${JSON.stringify(titles)}`;
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
    if (!Array.isArray(out) || out.length !== titles.length) throw new Error('translation count mismatch');
    return out;
  };
}

// Stored translations are reused; new headlines the site can show (each country's
// first PHOTO_TARGET with a photo) are translated in batches, top stories first.
async function addTranslations(rows, env, deps) {
  const stored = new Map();
  try {
    const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/news_world?select=link,title,title_tr&title_tr=not.is.null&limit=20000`, { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } });
    if (res.ok) for (const r of await res.json()) stored.set(`${r.link}|${r.title}`, r.title_tr);
  } catch { /* nothing stored yet */ }
  const todo = [];
  const pos = {};
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    r.title_tr = stored.get(`${r.link}|${r.title}`) || null;
    if (!r.image_url) continue;
    pos[r.country_code] = (pos[r.country_code] || 0) + 1;
    if (!r.title_tr && pos[r.country_code] <= PHOTO_TARGET) todo.push(r);
  }
  if (!deps.translate) return { translated: 0, pending: todo.length };
  const queue = todo.slice(0, TRANSLATIONS_PER_RUN);
  let translated = 0;
  const errors = [];
  const batches = [];
  for (let i = 0; i < queue.length; i += TRANSLATE_BATCH) batches.push(queue.slice(i, i + TRANSLATE_BATCH));
  await Promise.all(Array.from({ length: 4 }, async () => { while (batches.length) {
    const batch = batches.shift();
    try {
      const out = await deps.translate(batch.map((r) => r.title));
      batch.forEach((r, k) => {
        const t = out[k] || {};
        if (SITE_LANGS.every((l) => typeof t[l] === 'string' && t[l].trim())) {
          r.title_tr = Object.fromEntries(SITE_LANGS.map((l) => [l, t[l].trim().slice(0, 500)]));
          translated++;
        }
      });
    } catch (err) { errors.push(err.message); }
  } }));
  return { translated, pending: todo.length - translated, errors: errors.slice(0, 3) };
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, translate: deps.translate || null };
  if (!deps.translate && env.GEMINI_API_KEY) {
    try { deps.translate = geminiTranslator(env.GEMINI_API_KEY); } catch (err) { deps.log(`Translations skipped: ${err.message.split('\n')[0]}`); }
  }
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const countries = Object.keys(EDITIONS);
  const queue = [...countries];
  const rows = [];
  const pending = {};
  const failed = [];
  await Promise.all(Array.from({ length: FEED_CONCURRENCY }, async () => {
    while (queue.length) {
      const cc = queue.shift();
      try {
        const got = await fetchCountry(cc, deps);
        if (got.top.length) { rows.push(...got.top); pending[cc] = got; } else failed.push({ country: cc, error: 'no stories' });
      } catch (err) { failed.push({ country: cc, error: err.message }); }
    }
  }));
  if (!rows.length) throw new Error(`No stories fetched (${failed.map((f) => `${f.country}: ${f.error}`).join('; ')})`);

  const stored = await loadStoredImages(env, deps);
  const images = await addImages(rows, stored, deps);
  const extras = {};
  const short = Object.keys(pending).filter((cc) => rows.filter((r) => r.country_code === cc && r.image_url).length < PHOTO_TARGET);
  await Promise.all(Array.from({ length: FEED_CONCURRENCY }, async () => {
    while (short.length) {
      const cc = short.shift();
      extras[cc] = await topUpCandidates(cc, pending[cc].more, pending[cc].seen, deps);
    }
  }));
  images.topped_up = await topUp(rows, extras, stored, deps);
  const translations = await addTranslations(rows, env, deps);

  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/replace_news_world`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: rows }),
  });
  const written = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase write failed: ${written?.message || `HTTP ${res.status}`}`);

  const perCountry = {};
  for (const r of rows) if (r.image_url) perCountry[r.country_code] = (perCountry[r.country_code] || 0) + 1;
  const summary = { countries: countries.length, rows: written, perCountry, images, translations, failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, feedUrl, sectionUrl, EDITIONS, SEARCH, PHOTO_TARGET };

if (require.main === module) {
  run().catch((err) => {
    console.error(`World news routine failed: ${err.message}`);
    process.exit(1);
  });
}
