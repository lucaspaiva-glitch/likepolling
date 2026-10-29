// World News Wire: Google News "Top stories" for each Trending Index country, in
// Google News' own order and the country's language, with each article's own
// preview image. Writes public.news_world through the service-role RPC
// replace_news_world. Run hourly by .github/workflows/news-world.yml.
const { parseItems, fetchText, imageFor, descriptionFor } = require('./news-wire-routine');

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
// Short summaries shown over each photo, written from the publisher's own article description.
const SUMMARY_LOOKUPS_PER_RUN = 500;
const SUMMARY_CONCURRENCY = 6;
const SUMMARY_BATCH = 20;
const SUMMARY_WORDS = 15;

// Google News edition per country: [hl, ceid].
const EDITIONS = {
  AR: ['es-419', 'AR:es-419'], AU: ['en-AU', 'AU:en'], BD: ['bn', 'BD:bn'], BE: ['nl', 'BE:nl'],
  BR: ['pt-BR', 'BR:pt-419'], CA: ['en-CA', 'CA:en'], CL: ['es-419', 'CL:es-419'], CO: ['es-419', 'CO:es-419'],
  DE: ['de', 'DE:de'], DZ: ['fr', 'DZ:fr'], EC: ['es-419', 'EC:es-419'], EG: ['ar', 'EG:ar'],
  ES: ['es', 'ES:es'], FR: ['fr', 'FR:fr'], GB: ['en-GB', 'GB:en'], ID: ['id', 'ID:id'], IE: ['en-IE', 'IE:en'],
  IN: ['en-IN', 'IN:en'], IQ: ['ar', 'IQ:ar'], IT: ['it', 'IT:it'], JP: ['ja', 'JP:ja'],
  KE: ['en-KE', 'KE:en'], KR: ['ko', 'KR:ko'], MA: ['fr', 'MA:fr'], MX: ['es-419', 'MX:es-419'],
  MY: ['en-MY', 'MY:en'], NG: ['en-NG', 'NG:en'], NL: ['nl', 'NL:nl'], PE: ['es-419', 'PE:es-419'],
  PH: ['en-PH', 'PH:en'], PK: ['en-PK', 'PK:en'], PL: ['pl', 'PL:pl'], PT: ['pt-PT', 'PT:pt-150'],
  SA: ['ar', 'SA:ar'], TH: ['th', 'TH:th'], TR: ['tr', 'TR:tr'],
  TW: ['zh-TW', 'TW:zh-Hant'], UA: ['uk', 'UA:uk'], US: ['en-US', 'US:en'], VN: ['vi', 'VN:vi'],
  ZA: ['en-ZA', 'ZA:en'],
};
// No Google News edition of their own (Google serves France's, Egypt's or US
// Spanish news instead), so these use a Google News search for the country's name.
const SEARCH = { DZ: 'Algérie', EC: 'Ecuador', IQ: 'العراق' };
// Links are part of the table's primary key; Postgres can't index very long ones.
const MAX_LINK = 2000;
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

// maxPerSource keeps one outlet (e.g. a spam site flooding a search) from filling a country's list.
function uniqueItems(items, seen, maxPerSource = Infinity) {
  seen.perSource = seen.perSource || new Map();
  return items.filter((it) => {
    if (!it.title || !/^https:\/\//.test(it.link) || it.link.length > MAX_LINK || BLOCKED_SOURCES.test(it.source)) return false;
    const k = it.title.toLowerCase();
    const src = (it.source || '').toLowerCase();
    if (seen.has(it.link) || seen.has(k) || (seen.perSource.get(src) || 0) >= maxPerSource) return false;
    seen.add(it.link); seen.add(k); seen.perSource.set(src, (seen.perSource.get(src) || 0) + 1);
    return true;
  });
}

// The World News defaults; scripts/news-fashion-routine.js passes its own.
const WORLD = {
  table: 'news_world', rpc: 'replace_news_world', feed: feedUrl, searchTopUp: (cc) => !!SEARCH[cc],
  photoTarget: PHOTO_TARGET, imageLookups: IMAGE_LOOKUPS_PER_RUN, translations: TRANSLATIONS_PER_RUN, classify: false, summaries: true,
};

async function fetchCountry(cc, deps, cfg = WORLD) {
  const seen = new Set();
  const items = uniqueItems(parseItems(await fetchText(cfg.feed(cc), deps)), seen, cfg.maxPerSource);
  return { top: items.slice(0, TOP_N).map((it, i) => ({ country_code: cc, rank: i + 1, ...it })), more: items.slice(TOP_N), seen };
}

// Top-up candidates, most recent first: the rest of the search results for
// search countries (plus a 3-day search), otherwise the leading stories of each section feed.
async function topUpCandidates(cc, more, seen, deps, cfg = WORLD) {
  const lists = [more];
  if (cfg.searchTopUp(cc)) lists.push(await fetchText(cfg.feed(cc, 3), deps).then(parseItems).catch(() => []));
  else {
    lists.push(...await Promise.all(SECTIONS.map((t) => fetchText(sectionUrl(cc, t), deps)
      .then((xml) => parseItems(xml).slice(0, SECTION_DEPTH)).catch(() => []))));
  }
  const ts = (it) => Date.parse(it.published_at) || 0;
  return uniqueItems(lists.flat(), seen, cfg.maxPerSource).sort((a, b) => ts(b) - ts(a));
}

async function loadStoredImages(env, deps, cfg = WORLD) {
  const stored = new Map();
  for (const table of new Set([cfg.table, 'news_world', 'news_wire'])) {
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
async function topUp(rows, extras, stored, deps, target = PHOTO_TARGET) {
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
        if (have >= target) break;
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
async function addImages(rows, stored, deps, limit = IMAGE_LOOKUPS_PER_RUN) {
  const todo = new Map();
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (stored.has(r.link)) r.image_url = stored.get(r.link);
    else { r.image_url = null; if (!todo.has(r.link)) todo.set(r.link, []); todo.get(r.link).push(r); }
  }
  const queue = [...todo.entries()].slice(0, limit);
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

// Sends a prompt to Gemini and returns its JSON reply; moves to the next model if one is retired.
function geminiJson(apiKey) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let m = 0;
  let thinking = true;
  return async (prompt) => {
    for (;;) {
      const config = { responseMimeType: 'application/json', ...(thinking ? { thinkingConfig: { thinkingLevel: 'MINIMAL' } } : {}) };
      try {
        return JSON.parse((await ai.models.generateContent({ model: GEMINI_MODELS[m], contents: prompt, config })).text);
      } catch (err) {
        const msg = String(err && err.message);
        if (thinking && /thinking/i.test(msg)) thinking = false;
        else if (m < GEMINI_MODELS.length - 1 && /NOT_FOUND|\b404\b/.test(msg)) m++;
        else throw err;
      }
    }
  };
}

const LANG_LIST = 'en (English), pt (Brazilian Portuguese), pt-PT (European Portuguese), es (Spanish), de (German), ru (Russian), uk (Ukrainian), ko (Korean), ja (Japanese)';
const LANG_KEYS = SITE_LANGS.map((l) => `"${l}"`).join(', ');

// Optional AI check stored with each translation (title_tr[key]); cfg.classify: true is the Fashion News one.
const FASHION_CHECK = {
  key: 'fashion',
  rule: '"fashion" is true only if the headline is mainly about fashion: clothing, shoes, accessories, designers, fashion brands, models, fashion shows or style trends; otherwise false (for example sport, politics, food, or the word only used as in "in dramatic fashion").',
  ok: (v) => typeof v === 'boolean',
};
const checkOf = (classify) => (classify === true ? FASHION_CHECK : classify || null);

function geminiTranslator(apiKey, classify = false) {
  const ask = geminiJson(apiKey);
  const check = checkOf(classify);
  return async (titles) => {
    const prompt = `Translate each news headline below into these languages: ${LANG_LIST}. Keep names, numbers and meaning exact; do not add or drop information. Reply with only a JSON array with one object per headline, in the same order, each with exactly the keys ${LANG_KEYS}${check ? `, "${check.key}"` : ''}.${check ? ` ${check.rule}` : ''}\n\n${JSON.stringify(titles)}`;
    const out = await ask(prompt);
    if (!Array.isArray(out) || out.length !== titles.length) throw new Error('translation count mismatch');
    return out;
  };
}

function geminiSummarizer(apiKey) {
  const ask = geminiJson(apiKey);
  return async (stories) => {
    const prompt = `For each news story below (its headline and the publisher's own description), write one short summary of at most ${SUMMARY_WORDS} words in each of these languages: ${LANG_LIST}. Use only facts stated in the headline or description; do not add facts, opinions or names that are not there. Prefer details the headline doesn't already say. No quotation marks, no hashtags. Reply with only a JSON array with one object per story, in the same order, each with exactly the keys ${LANG_KEYS}.\n\n${JSON.stringify(stories)}`;
    const out = await ask(prompt);
    if (!Array.isArray(out) || out.length !== stories.length) throw new Error('summary count mismatch');
    return out;
  };
}

// Stored translations are reused; new headlines the site can show (each country's
// first PHOTO_TARGET with a photo) are translated in batches, top stories first.
async function addTranslations(rows, env, deps, cfg = WORLD) {
  const stored = new Map();
  try {
    const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/${cfg.table}?select=link,title,title_tr&title_tr=not.is.null&limit=20000`, { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } });
    if (res.ok) for (const r of await res.json()) stored.set(`${r.link}|${r.title}`, r.title_tr);
  } catch { /* nothing stored yet */ }
  const todo = [];
  const pos = {};
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    r.title_tr = stored.get(`${r.link}|${r.title}`) || null;
    if (!r.image_url) continue;
    pos[r.country_code] = (pos[r.country_code] || 0) + 1;
    if (!r.title_tr && pos[r.country_code] <= cfg.photoTarget) todo.push(r);
  }
  if (!deps.translate) return { translated: 0, pending: todo.length };
  const check = checkOf(cfg.classify);
  const queue = todo.slice(0, cfg.translations);
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
        if (SITE_LANGS.every((l) => typeof t[l] === 'string' && t[l].trim()) && (!check || check.ok(t[check.key]))) {
          r.title_tr = Object.fromEntries(SITE_LANGS.map((l) => [l, t[l].trim().slice(0, 500)]));
          if (check) r.title_tr[check.key] = t[check.key];
          translated++;
        }
      });
    } catch (err) {
      // One bad reply (e.g. invalid JSON) shouldn't leave the whole batch untranslated: retry it in halves.
      if (batch.length > 1) batches.push(batch.slice(0, batch.length >> 1), batch.slice(batch.length >> 1));
      else errors.push(err.message);
    }
  } }));
  return { translated, pending: todo.length - translated, errors: errors.slice(0, 3) };
}

// Each country's first photoTarget translated photo stories get a summary (title_tr.sum, one per
// site language), stored with the translations so it's written once. Stories whose article has
// no description get sum '' and aren't looked up again.
async function addSummaries(rows, deps, cfg = WORLD) {
  if (!cfg.summaries) return null;
  const check = checkOf(cfg.classify);
  const shown = (r) => !check || !check.hide || !check.hide(r.title_tr[check.key]);
  const todo = [];
  const pos = {};
  for (const r of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (!r.image_url) continue;
    pos[r.country_code] = (pos[r.country_code] || 0) + 1;
    if (pos[r.country_code] <= cfg.photoTarget && r.title_tr && r.title_tr.sum === undefined && shown(r)) todo.push([pos[r.country_code], r]);
  }
  // Every country's #1 first, then every #2 and so on, so fill-in stories (low Google rank,
  // high place on the site) aren't left at the back of the queue.
  todo.sort((a, b) => a[0] - b[0]);
  todo.forEach((t, i) => { todo[i] = t[1]; });
  if (!deps.summarize) return { summarized: 0, pending: todo.length };
  const queue = todo.slice(0, SUMMARY_LOOKUPS_PER_RUN);
  const ready = [];
  let noDescription = 0;
  await Promise.all(Array.from({ length: SUMMARY_CONCURRENCY }, async () => {
    while (queue.length) {
      const r = queue.shift();
      const d = await descriptionFor(r.link, deps);
      if (d === null) continue;
      if (d) ready.push([r, d]);
      else { r.title_tr = { ...r.title_tr, sum: '' }; noDescription++; }
    }
  }));
  const batches = [];
  for (let i = 0; i < ready.length; i += SUMMARY_BATCH) batches.push(ready.slice(i, i + SUMMARY_BATCH));
  let summarized = 0;
  const errors = [];
  await Promise.all(Array.from({ length: 4 }, async () => { while (batches.length) {
    const batch = batches.shift();
    try {
      const out = await deps.summarize(batch.map(([r, d]) => ({ headline: r.title, description: d })));
      batch.forEach(([r], k) => {
        const t = out[k] || {};
        if (SITE_LANGS.every((l) => typeof t[l] === 'string' && t[l].trim())) {
          r.title_tr = { ...r.title_tr, sum: Object.fromEntries(SITE_LANGS.map((l) => [l, t[l].trim().slice(0, 200)])) };
          summarized++;
        }
      });
    } catch (err) {
      // One bad reply (e.g. invalid JSON) shouldn't hold back the whole batch: retry it in halves.
      if (batch.length > 1) batches.push(batch.slice(0, batch.length >> 1), batch.slice(batch.length >> 1));
      else errors.push(err.message);
    }
  } }));
  return { summarized, no_description: noDescription, pending: todo.length - summarized - noDescription, errors: errors.slice(0, 3) };
}

async function run(env = process.env, deps = {}, cfg = WORLD) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, translate: deps.translate || null, summarize: deps.summarize || null };
  if (!deps.translate && env.GEMINI_API_KEY) {
    try { deps.translate = geminiTranslator(env.GEMINI_API_KEY, cfg.classify); } catch (err) { deps.log(`Translations skipped: ${err.message.split('\n')[0]}`); }
  }
  if (!deps.summarize && env.GEMINI_API_KEY && cfg.summaries) {
    try { deps.summarize = geminiSummarizer(env.GEMINI_API_KEY); } catch (err) { deps.log(`Summaries skipped: ${err.message.split('\n')[0]}`); }
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
        const got = await fetchCountry(cc, deps, cfg);
        if (got.top.length) { rows.push(...got.top); pending[cc] = got; } else failed.push({ country: cc, error: 'no stories' });
      } catch (err) { failed.push({ country: cc, error: err.message }); }
    }
  }));
  if (!rows.length) throw new Error(`No stories fetched (${failed.map((f) => `${f.country}: ${f.error}`).join('; ')})`);

  const stored = await loadStoredImages(env, deps, cfg);
  const images = await addImages(rows, stored, deps, cfg.imageLookups);
  const extras = {};
  const short = Object.keys(pending).filter((cc) => rows.filter((r) => r.country_code === cc && r.image_url).length < cfg.photoTarget);
  await Promise.all(Array.from({ length: FEED_CONCURRENCY }, async () => {
    while (short.length) {
      const cc = short.shift();
      extras[cc] = await topUpCandidates(cc, pending[cc].more, pending[cc].seen, deps, cfg);
    }
  }));
  images.topped_up = await topUp(rows, extras, stored, deps, cfg.photoTarget);
  const translations = await addTranslations(rows, env, deps, cfg);
  const summaries = await addSummaries(rows, deps, cfg);

  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${cfg.rpc}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: rows }),
  });
  const written = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase write failed: ${written?.message || `HTTP ${res.status}`}`);

  const perCountry = {};
  for (const r of rows) if (r.image_url) perCountry[r.country_code] = (perCountry[r.country_code] || 0) + 1;
  const summary = { countries: countries.length, rows: written, perCountry, images, translations, ...(summaries ? { summaries } : {}), failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, feedUrl, sectionUrl, EDITIONS, SEARCH, PHOTO_TARGET, WORLD, geminiTranslator };

if (require.main === module) {
  run().catch((err) => {
    console.error(`World news routine failed: ${err.message}`);
    process.exit(1);
  });
}
