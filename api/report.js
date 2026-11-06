// api/report.js: the Country Inspiration Report (see lib/report.js). No accounts and no buyer data:
// Lemon Squeezy sells the report and emails a license key; this checks the key with Lemon Squeezy's
// License API on each visit and never saves it, the email or anything else about the buyer.
//   GET  /api/report?country=BR&compare=PT   the free sample (only Brazil vs Portugal)
//   POST /api/report {"key":"…","instance":"…","countries":"BR,PT"}
//        First visit: the key is activated once, and the chosen countries are saved as the activation's
//        name at Lemon Squeezy. Later visits send the key (+ the activation id the browser kept).
// Env: LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_PRODUCT_ID (keys from other stores/products are refused),
// optional LEMONSQUEEZY_API_KEY (lets a buyer reopen the report on a new device with just the key).
// Gumroad sells it too (GUMROAD_PRODUCT_ID + REPORT_TOKEN_SECRET). Its keys have no activations, so the
// first visit bumps the key's use count and the browser gets a signed "instance" that carries the
// countries (g-BR-PT-<signature>); nothing is stored here either. Lemon Squeezy keys are UUIDs.
'use strict';
const crypto = require('crypto');
const report = require('../lib/report');
const entity = require('../lib/entity-report');

const LICENSE_API = 'https://api.lemonsqueezy.com/v1/licenses/';
const LIMIT_PER_MIN = 10;
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

function fail(status, message, extra) {
  return Object.assign(new report.HttpError(status, message), { extra });
}

function licenseApi(fetchImpl) {
  return async (action, fields) => {
    const res = await fetchImpl(LICENSE_API + action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json().catch(() => null);
    if (!json || res.status >= 500) throw fail(502, 'Lemon Squeezy didn\'t answer. Try again in a minute.');
    return json;
  };
}

// The activation made on the first visit (needs LEMONSQUEEZY_API_KEY); null if none or no API key.
async function findInstance(env, fetchImpl, licenseKeyId) {
  if (!env.LEMONSQUEEZY_API_KEY || !licenseKeyId) return null;
  const res = await fetchImpl(`https://api.lemonsqueezy.com/v1/license-key-instances?filter[license_key_id]=${encodeURIComponent(licenseKeyId)}`, {
    headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY.trim()}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const a = (await res.json().catch(() => null))?.data?.[0]?.attributes;
  return a && a.identifier ? { id: a.identifier, name: a.name } : null;
}

function checkLicense(env, v) {
  const lk = v.license_key;
  const meta = v.meta || {};
  if (!lk || String(meta.store_id) !== String(env.LEMONSQUEEZY_STORE_ID).trim()
    || (env.LEMONSQUEEZY_PRODUCT_ID && String(meta.product_id) !== String(env.LEMONSQUEEZY_PRODUCT_ID).trim())) {
    throw fail(404, 'That key wasn\'t found. Copy it from your Lemon Squeezy receipt email.');
  }
  if (lk.status === 'disabled') throw fail(403, 'This key was refunded or turned off.');
  if (lk.status === 'expired') throw fail(403, 'This report key has expired.');
}

const GUMROAD_VERIFY = 'https://api.gumroad.com/v2/licenses/verify';
const isLemonKey = (k) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
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
  }
  const body = await build(type, picked);
  if (first) await gumroadVerify(env, fetchImpl, key, true, id);
  return { type, body, instance_id: entityToken(env, key, type, picked), expires_at: null };
}

// Returns { countries, instance_id, expires_at } for a valid key, activating it on the first visit.
async function unlock(env, fetchImpl, { key, instance, countries }) {
  const license = licenseApi(fetchImpl);
  let v = await license('validate', instance ? { license_key: key, instance_id: instance } : { license_key: key });
  if (instance && !v.instance) v = await license('validate', { license_key: key });
  checkLicense(env, v);
  const lk = v.license_key;
  let inst = v.instance || null;
  if (!inst && lk.activation_usage > 0) {
    inst = await findInstance(env, fetchImpl, lk.id);
    if (!inst) throw fail(409, 'This key was already opened in another browser. Open the report there, or email lucaspaiva@likepolling.com and we\'ll help.');
  }
  if (!inst) {
    const list = report.parseCountries(countries);
    if (!list.length) throw fail(409, 'Pick the country (or two) for your report.', { need_countries: true });
    const a = await license('activate', { license_key: key, instance_name: list.join(',') });
    inst = a.activated ? a.instance : await findInstance(env, fetchImpl, lk.id);
    if (!inst) throw fail(400, a.error || 'This key couldn\'t be activated.');
  }
  const chosen = report.parseCountries(inst.name);
  if (!chosen.length) throw fail(409, 'No country is set for this key. Email lucaspaiva@likepolling.com and we\'ll fix it.');
  return { countries: chosen, instance_id: inst.id, expires_at: lk.expires_at || null };
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const fetchImpl = deps.fetch || fetch;
    const now = deps.now ? deps.now() : Date.now();
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw fail(500, 'Server is missing its database settings.');
      const get = report.rest(env, fetchImpl);
      if (req.method === 'GET' && entity.TYPES[req.query.type]) {
        const body = await entity.buildEntityReport(get, req.query.type, entity.SAMPLES[req.query.type], { fetchImpl, rest: get, now: new Date(now) });
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
        return res.status(200).json({ ...body, sample: true });
      }
      if (req.method === 'GET') {
        const list = report.parseCountries([req.query.country, req.query.compare].join(','));
        if (!report.isSample(list)) throw fail(403, 'Only the Brazil vs Portugal sample is free. Get a report at likepolling.com/services.');
        const body = await report.buildReport(get, list, new Date(now));
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
        return res.status(200).json({ ...body, sample: true });
      }
      if (req.method === 'POST') {
        if (!env.LEMONSQUEEZY_STORE_ID && !gumroadProducts(env).length) throw fail(503, 'Report sales open soon.');
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        if (!allowed(ip, now)) throw fail(429, 'Too many tries. Wait a minute and try again.');
        const { key, instance, countries, choice } = await parseBody(req);
        const k = String(key || '').trim();
        const i = String(instance || '').trim();
        if (!/^[A-Za-z0-9-]{8,64}$/.test(k)) throw fail(400, 'Paste the license key from your receipt email.');
        const args = { key: k, instance: /^[A-Za-z0-9._-]{8,700}$/.test(i) ? i : '', countries, choice };
        const lemon = isLemonKey(k) && env.LEMONSQUEEZY_STORE_ID;
        const build = (type, picked) => entity.buildEntityReport(get, type, picked, { fetchImpl, rest: get, now: new Date(now) });
        const access = await (lemon ? unlock(env, fetchImpl, args) : unlockGumroad(env, fetchImpl, args, build));
        const body = access.body || await report.buildReport(get, access.countries, new Date(now));
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
module.exports.unlock = unlock;
