// api/report.js: the Extended Country, People and Company reports (lib/report.js, lib/entity-report.js). No accounts and
// no buyer data: Gumroad sells the report and emails a license key; this checks the key with Gumroad's License API on
// each visit and never saves it, the email or anything else about the buyer.
//   GET  /api/report?country=BR&compare=PT   the free sample (only Brazil vs Portugal)
//   GET  /api/report?page=shakira             one of the free search-page samples (PAGES)
//   GET  /api/report?about=Title              free basics for any search page (Wikipedia)
//   POST /api/report {"key":"…","instance":"…","countries":"BR,PT"}
// Env: GUMROAD_PRODUCT_ID / GUMROAD_ARTIST_PRODUCT_ID / GUMROAD_COMPANY_PRODUCT_ID + REPORT_TOKEN_SECRET. Gumroad keys
// have no activations, so the first visit bumps the key's use count and the browser gets a signed "instance" that
// carries the countries (g-BR-PT-<signature>); nothing is stored here either.
'use strict';
const crypto = require('crypto');
const report = require('../lib/report');
const entity = require('../lib/entity-report');
const free = require('../lib/free-page');
const stats = require('../lib/key-stats');

const LIMIT_PER_MIN = 10;
// Free search-page samples, one per category, full history unlocked.
const PAGES = {
  shakira: { type: 'artist', subject: 'Shakira', peers: [], stats: { cat: 'person', title: 'Shakira', description: 'singer' } },
  zara: { type: 'company', subject: 'Zara (retailer)', peers: [], stats: { cat: 'brand', title: 'Zara (retailer)', parent: 'Inditex' } },
  brazil: { country: 'BR', stats: { cat: 'country', iso2: 'BR' } },
  benfica: { type: 'company', subject: 'S.L. Benfica', peers: [], stats: { cat: 'sport', title: 'S.L. Benfica' } },
  'lula-vs-bolsonaro': { type: 'artist', subject: 'Luiz Inácio Lula da Silva', peers: ['Jair Bolsonaro'], stats: { election: 'br-2022' } },
};
const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
// World Bank rows saved weekly by scripts/worldbank-routine.js, used when the live API is down.
const savedIndicators = (get) => (iso2) => get(`country_indicators?select=indicator,year,value&country_code=eq.${iso2}&order=year.asc`);

// Free part of a search page, plus a rough category for the colors and the right Gumroad product.
async function about(fetchImpl, q, saved = null) {
  const countryOf = (title) => report.COUNTRIES.find((c) => COUNTRY_NAMES.of(c) === title || (c === 'US' && title === 'United States') || (c === 'GB' && title === 'United Kingdom'));
  const classify = (desc, title) => (countryOf(title) ? 'country'
    : entity.TYPES.artist.words.test(desc) || /politician|president|minister|chancellor|mayor|governor|senator|congress|parliament|party leader|monarch|king of|queen of|player|coach|person/i.test(desc) ? 'person'
      : /club|team|football|league/i.test(desc) ? 'sport' : entity.TYPES.company.words.test(desc) ? 'brand' : 'topic');
  const body = await free.freePage(fetchImpl, q, { countryNames: (c) => COUNTRY_NAMES.of(c), classify, iso2Of: countryOf, saved });
  if (!body) throw fail(404, 'Nothing found for that search.');
  if (body.disambiguation) throw fail(404, 'That name means several things. Try a fuller name.');
  return { ...body, country: countryOf(body.title) || null };
}
const hits = new Map();

function allowed(ip, now = Date.now()) {
  const key = `${ip}|${Math.floor(now / 60000)}`;
  if (hits.size > 5000) hits.clear();
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  return n <= LIMIT_PER_MIN;
}

async function parseBody(req) {
  let body = req.body;
  if (body === undefined && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    body = Buffer.concat(chunks).toString('utf8').slice(0, 10000);
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { return JSON.parse(body) || {}; } catch { return {}; } }
  return body || {};
}

// Keeps every state-level Google Trends result in region_interest_daily, so the history grows with each report.
async function saveStates(env, fetchImpl, body) {
  await saveMentions(env, fetchImpl, body);
  await saveExtras(env, fetchImpl, body);
  const st = body && body.states;
  if (!st || !body.subject) return;
  const day = String(body.generated_at || new Date().toISOString()).slice(0, 10);
  const subject = String(body.subject.title || '').slice(0, 120);
  const rows = Object.entries(st).flatMap(([cc, list]) => list.map((r) => ({ day, subject, country_code: cc, region_code: r.code, region_name: r.name, value: r.value })));
  if (!rows.length || !subject) return;
  await fetchImpl(`${String(env.SUPABASE_URL).trim().replace(/\/$/, '')}/rest/v1/region_interest_daily?on_conflict=day,subject,country_code,region_code`, {
    method: 'POST', signal: AbortSignal.timeout(6000), body: JSON.stringify(rows),
    headers: { apikey: env.SUPABASE_KEY.trim(), Authorization: `Bearer ${env.SUPABASE_KEY.trim()}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  }).catch(() => null);
}

// Time capsule: every report (paid or sample) is kept as a dated snapshot, one per day per subject.
async function saveSnapshot(env, fetchImpl, body) {
  if (!body) return;
  const kind = body.subject ? String(body.type || 'entity') : 'country';
  const subjects = body.subject ? String(body.subject.title || '').slice(0, 200) : (body.countries || []).map((c) => c.country).join(',');
  if (!subjects) return;
  const row = { day: String(body.generated_at || new Date().toISOString()).slice(0, 10), kind, subjects, body };
  await fetchImpl(`${String(env.SUPABASE_URL).trim().replace(/\/$/, '')}/rest/v1/report_snapshots?on_conflict=day,kind,subjects`, {
    method: 'POST', signal: AbortSignal.timeout(6000), body: JSON.stringify([row]),
    headers: { apikey: env.SUPABASE_KEY.trim(), Authorization: `Bearer ${env.SUPABASE_KEY.trim()}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
  }).catch(() => null);
}

async function saveExtras(env, fetchImpl, body) {
  if (!body || !body.subject || !(body.profile || body.releases || body.searches || body.moments || body.products)) return;
  const row = { day: String(body.generated_at || new Date().toISOString()).slice(0, 10), subject: String(body.subject.title || '').slice(0, 120),
    profile: body.profile || null, releases: body.releases || null, searches: body.searches || null, moments: body.moments || null, products: body.products || null };
  await fetchImpl(`${String(env.SUPABASE_URL).trim().replace(/\/$/, '')}/rest/v1/entity_extras_daily?on_conflict=day,subject`, {
    method: 'POST', signal: AbortSignal.timeout(6000), body: JSON.stringify([row]),
    headers: { apikey: env.SUPABASE_KEY.trim(), Authorization: `Bearer ${env.SUPABASE_KEY.trim()}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  }).catch(() => null);
}

async function saveMentions(env, fetchImpl, body) {
  const m = body && body.mentions;
  if (!m || !body.subject) return;
  const row = { day: String(body.generated_at || new Date().toISOString()).slice(0, 10), subject: String(body.subject.title || '').slice(0, 120),
    news_articles: m.news ? m.news.articles : null, news_countries: m.news ? m.news.countries : null,
    posts: m.social ? m.social.posts : null, post_likes: m.social ? m.social.likes : null, post_langs: m.social ? m.social.langs : null };
  await fetchImpl(`${String(env.SUPABASE_URL).trim().replace(/\/$/, '')}/rest/v1/mentions_daily?on_conflict=day,subject`, {
    method: 'POST', signal: AbortSignal.timeout(6000), body: JSON.stringify([row]),
    headers: { apikey: env.SUPABASE_KEY.trim(), Authorization: `Bearer ${env.SUPABASE_KEY.trim()}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  }).catch(() => null);
}

function fail(status, message, extra) {
  return Object.assign(new report.HttpError(status, message), { extra });
}

const GUMROAD_VERIFY = 'https://api.gumroad.com/v2/licenses/verify';
const sign = (env, key, list) => crypto.createHmac('sha256', String(env.REPORT_TOKEN_SECRET).trim())
  .update(`${key}|${list.join(',')}`).digest('hex').slice(0, 32);
const gumroadToken = (env, key, list) => `g-${list.join('-')}-${sign(env, key, list)}`;

function readGumroadToken(env, key, token) {
  const m = /^g-((?:[A-Z]{2}-){1,2})([0-9a-f]{32})$/.exec(token || '');
  if (!m) return null;
  const list = report.parseCountries(m[1].slice(0, -1).split('-').join(','));
  if (!list.length) return null;
  const a = Buffer.from(m[2]), b = Buffer.from(sign(env, key, list));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? list : null;
}

// Gumroad products by report type. A key belongs to exactly one of them.
const gumroadProducts = (env) => [['country', env.GUMROAD_PRODUCT_ID], ['artist', env.GUMROAD_ARTIST_PRODUCT_ID], ['company', env.GUMROAD_COMPANY_PRODUCT_ID]]
  .map(([type, id]) => [type, String(id || '').trim()]).filter(([, id]) => id);

async function gumroadVerify(env, fetchImpl, key, increment, productId) {
  const res = await fetchImpl(GUMROAD_VERIFY, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: String(increment) }).toString(),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => null);
  if (!json || res.status >= 500) throw fail(502, 'Gumroad didn\'t answer. Try again in a minute.');
  if (!json.success || !json.purchase) throw fail(404, 'That key wasn\'t found. Copy it from your receipt email.');
  const p = json.purchase;
  if (p.refunded || p.disputed || p.chargebacked) throw fail(403, 'This key was refunded or turned off.');
  return json;
}

const USED_ELSEWHERE = 'This key was already opened in another browser. Open the report there (or use the link it shows), or email lucaspaiva@likepolling.com and we\'ll help.';

// Finds which product (report type) the key belongs to.
async function findGumroad(env, fetchImpl, key) {
  for (const [type, id] of gumroadProducts(env)) {
    try {
      return { type, id, v: await gumroadVerify(env, fetchImpl, key, false, id) };
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  throw fail(404, 'That key wasn\'t found. Copy it from your receipt email.');
}

// Artist/company access token: g-a.<base64url choice>.<signature> (or g-c. for companies).
const b64 = (s) => Buffer.from(s).toString('base64url');
const entityToken = (env, key, type, choice) => { const p = b64(JSON.stringify(choice)); return `g-${type[0]}.${p}.${sign(env, key, [type, p])}`; };
function readEntityToken(env, key, type, token) {
  const m = /^g-([ac])\.([A-Za-z0-9_-]+)\.([0-9a-f]{32})$/.exec(token || '');
  if (!m || m[1] !== type[0]) return null;
  const a = Buffer.from(m[3]), b = Buffer.from(sign(env, key, [type, m[2]]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return entity.parseChoice(JSON.parse(Buffer.from(m[2], 'base64url').toString())); } catch { return null; }
}

async function unlockGumroad(env, fetchImpl, { key, instance, countries, choice }, build) {
  if (!env.REPORT_TOKEN_SECRET || !gumroadProducts(env).length) throw fail(404, 'That key wasn\'t found. Copy it from your receipt email.');
  const { type, id, v } = await findGumroad(env, fetchImpl, key);
  if (type === 'country') {
    let list = readGumroadToken(env, key, instance);
    if (!list) {
      if (v.uses > 0) throw fail(409, USED_ELSEWHERE);
      list = report.parseCountries(countries);
      if (!list.length) throw fail(409, 'Pick the country (or two) for your report.', { need_countries: true });
      await gumroadVerify(env, fetchImpl, key, true, id);
    }
    return { type, countries: list, instance_id: gumroadToken(env, key, list), expires_at: null };
  }
  let picked = readEntityToken(env, key, type, instance);
  const first = !picked;
  if (first) {
    if (v.uses > 0) throw fail(409, USED_ELSEWHERE);
    picked = entity.parseChoice(choice);
    if (!picked) throw fail(409, `Pick the ${type} for your report.`, { need_choice: type });
    if (!picked.confirm) {
      const r = await entity.resolveSubject(type, picked.subject, { fetchImpl });
      const brand = !r.page && type === 'company' ? await entity.findBrandSubject(picked.subject, { fetchImpl, rest: report.rest(env, fetchImpl) }).catch(() => null) : null;
      if (brand) throw fail(409, 'Is this the one? Your report is set once per key.', { need_choice: type, confirm: { title: brand.title, description: brand.description || brand.website || '', image: brand.image, brand: true }, options: r.options });
      if (!r.page) throw fail(404, `We couldn't find "${picked.subject}" on Wikipedia. Pick it from the suggestions.`, { need_choice: type, options: r.options });
      throw fail(409, 'Is this the one? Your report is set once per key.', { need_choice: type, confirm: r.page, options: r.options });
    }
  }
  const body = await build(type, picked);
  if (first) await gumroadVerify(env, fetchImpl, key, true, id);
  return { type, body, instance_id: entityToken(env, key, type, picked), expires_at: null };
}

// Returns { countries, instance_id, expires_at } for a valid key, activating it on the first visit.
function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const fetchImpl = deps.fetch || fetch;
    const now = deps.now ? deps.now() : Date.now();
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw fail(500, 'Server is missing its database settings.');
      const get = report.rest(env, fetchImpl);
      if (req.method === 'GET' && req.query.about) {
        const body = await about(fetchImpl, String(req.query.about).slice(0, 120), savedIndicators(get));
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
        return res.status(200).json(body);
      }
      const page = req.method === 'GET' && Object.prototype.hasOwnProperty.call(PAGES, req.query.page) && PAGES[req.query.page];
      if (page) {
        const [built, keyStats] = await Promise.all([page.country ? report.buildReport(get, [page.country], new Date(now), { fetchImpl })
          : entity.buildEntityReport(get, page.type, page, { fetchImpl, rest: get, now: new Date(now) }), stats.keyStats(fetchImpl, { ...page.stats, saved: savedIndicators(get) })]);
        const body = { ...built, key_stats: keyStats };
        if (!page.country) await saveStates(env, fetchImpl, body);
        await saveSnapshot(env, fetchImpl, body);
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
        return res.status(200).json({ ...body, sample: true, page: req.query.page });
      }
      if (req.method === 'GET' && entity.TYPES[req.query.type]) {
        const body = await entity.buildEntityReport(get, req.query.type, entity.SAMPLES[req.query.type], { fetchImpl, rest: get, now: new Date(now) });
        await saveStates(env, fetchImpl, body);
        await saveSnapshot(env, fetchImpl, body);
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
        return res.status(200).json({ ...body, sample: true });
      }
      if (req.method === 'GET') {
        const list = report.parseCountries([req.query.country, req.query.compare].join(','));
        if (!report.isSample(list)) throw fail(403, 'Only the Brazil vs Portugal sample is free. Get a report at likepolling.com/services.');
        const body = await report.buildReport(get, list, new Date(now), { fetchImpl });
        await saveSnapshot(env, fetchImpl, body);
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
        return res.status(200).json({ ...body, sample: true });
      }
      if (req.method === 'POST') {
        if (!gumroadProducts(env).length) throw fail(503, 'Report sales open soon.');
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        if (!allowed(ip, now)) throw fail(429, 'Too many tries. Wait a minute and try again.');
        const { key, instance, countries, choice } = await parseBody(req);
        const k = String(key || '').trim();
        const i = String(instance || '').trim();
        if (!/^[A-Za-z0-9-]{8,64}$/.test(k)) throw fail(400, 'Paste the license key from your receipt email.');
        const args = { key: k, instance: /^[A-Za-z0-9._-]{8,700}$/.test(i) ? i : '', countries, choice };
        const build = (type, picked) => entity.buildEntityReport(get, type, picked, { fetchImpl, rest: get, now: new Date(now) });
        const access = await unlockGumroad(env, fetchImpl, args, build);
        const body = access.body || await report.buildReport(get, access.countries, new Date(now), { fetchImpl });
        if (access.body) await saveStates(env, fetchImpl, access.body);
        await saveSnapshot(env, fetchImpl, body);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ ...body, sample: false, instance_id: access.instance_id, expires_at: access.expires_at });
      }
      throw fail(405, 'Use GET or POST.');
    } catch (err) {
      if (!(err instanceof report.HttpError)) console.error('[report]', err);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Try again in a minute.', ...(err.extra || {}) });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.PAGES = PAGES;
