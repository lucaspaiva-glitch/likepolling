#!/usr/bin/env node
// GDELT memory: once a day, reads the previous UTC day's 96 GDELT 2.0 event files (one per 15 min)
// and saves daily totals into public.gdelt_country_daily (events per tracked country and CAMEO topic,
// by where the event happened) and public.gdelt_pairs_daily (events between two tracked countries).
//   node scripts/gdelt-routine.js            (yesterday)   DAY=2026-10-27 node scripts/gdelt-routine.js
// Data: The GDELT Project (https://www.gdeltproject.org), free for any use with credit.
// The raw files are used instead of GDELT's search API, which limits clients to 1 request per 5 s.
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Optional DAY. Node >= 20, no deps.
'use strict';

const zlib = require('zlib');

const FILES = 'https://data.gdeltproject.org/gdeltv2';
const CONCURRENCY = 4;
const MAX_RETRIES = 3;
// The 41 tracked countries: ISO code -> [FIPS 10-4 code used by ActionGeo_CountryCode, ISO-3 code used by actor fields].
const COUNTRIES = {
  AR: ['AR', 'ARG'], AU: ['AS', 'AUS'], BD: ['BG', 'BGD'], BE: ['BE', 'BEL'], BR: ['BR', 'BRA'], CA: ['CA', 'CAN'],
  CL: ['CI', 'CHL'], CO: ['CO', 'COL'], DE: ['GM', 'DEU'], DZ: ['AG', 'DZA'], EC: ['EC', 'ECU'], EG: ['EG', 'EGY'],
  ES: ['SP', 'ESP'], FR: ['FR', 'FRA'], GB: ['UK', 'GBR'], ID: ['ID', 'IDN'], IE: ['EI', 'IRL'], IN: ['IN', 'IND'],
  IQ: ['IZ', 'IRQ'], IT: ['IT', 'ITA'], JP: ['JA', 'JPN'], KE: ['KE', 'KEN'], KR: ['KS', 'KOR'], MA: ['MO', 'MAR'],
  MX: ['MX', 'MEX'], MY: ['MY', 'MYS'], NG: ['NI', 'NGA'], NL: ['NL', 'NLD'], PE: ['PE', 'PER'], PH: ['RP', 'PHL'],
  PK: ['PK', 'PAK'], PL: ['PL', 'POL'], PT: ['PO', 'PRT'], SA: ['SA', 'SAU'], TH: ['TH', 'THA'], TR: ['TU', 'TUR'],
  TW: ['TW', 'TWN'], UA: ['UP', 'UKR'], US: ['US', 'USA'], VN: ['VM', 'VNM'], ZA: ['SF', 'ZAF'],
};
const BY_FIPS = Object.fromEntries(Object.entries(COUNTRIES).map(([iso, [fips]]) => [fips, iso]));
const BY_ISO3 = Object.fromEntries(Object.entries(COUNTRIES).map(([iso, [, iso3]]) => [iso3, iso]));
// GDELT 2.0 event columns (0-based).
const COL = { ACTOR1_CC: 7, ACTOR2_CC: 17, ROOT_CODE: 28, NUM_ARTICLES: 33, ACTION_CC: 53 };

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function supabaseHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// Extracts the first file of a zip archive (GDELT zips hold one CSV), via the central directory.
function unzipFirst(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('bad zip central directory');
  const method = buf.readUInt16LE(cd + 10);
  const size = buf.readUInt32LE(cd + 20);
  const local = buf.readUInt32LE(cd + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported zip method ${method}`);
}

// The 96 file stamps of a day: YYYYMMDD000000 ... YYYYMMDD234500.
function fileStamps(day) {
  const d = day.replace(/-/g, '');
  return Array.from({ length: 96 }, (_, i) => `${d}${String(Math.floor(i / 4)).padStart(2, '0')}${String((i % 4) * 15).padStart(2, '0')}00`);
}

function yesterday(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
}

// Adds one file's events to the running totals.
function addEvents(csv, totals) {
  for (const line of csv.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    if (f.length < 54) continue;
    const articles = Number(f[COL.NUM_ARTICLES]) || 0;
    const root = f[COL.ROOT_CODE];
    const where = BY_FIPS[f[COL.ACTION_CC]];
    if (where && /^\d{2}$/.test(root)) {
      const t = totals.countries.get(`${where}|${root}`) || { events: 0, articles: 0 };
      t.events++; t.articles += articles;
      totals.countries.set(`${where}|${root}`, t);
    }
    const a1 = BY_ISO3[f[COL.ACTOR1_CC]];
    const a2 = BY_ISO3[f[COL.ACTOR2_CC]];
    if (a1 && a2 && a1 !== a2) {
      const t = totals.pairs.get(`${a1}|${a2}`) || { events: 0, articles: 0 };
      t.events++; t.articles += articles;
      totals.pairs.set(`${a1}|${a2}`, t);
    }
  }
}

function toPayload(day, totals) {
  const countries = [...totals.countries].map(([k, t]) => { const [country_code, root_code] = k.split('|'); return { day, country_code, root_code, ...t }; });
  const pairs = [...totals.pairs].map(([k, t]) => { const [actor1_cc, actor2_cc] = k.split('|'); return { day, actor1_cc, actor2_cc, ...t }; });
  return { countries, pairs };
}

// Returns the file's bytes, or null when GDELT has no file for that slot (404).
async function fetchFile(url, deps) {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url);
    if (res.status === 404) return null;
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (!(res.status === 429 || res.status >= 500) || attempt >= MAX_RETRIES) throw new Error(`HTTP ${res.status}`);
    await deps.sleep(2 ** attempt * 1000 + Math.floor(Math.random() * 250));
  }
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || new Date() };
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  const day = env.DAY || yesterday(deps.now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`DAY must be YYYY-MM-DD, got ${day}`);

  const totals = { countries: new Map(), pairs: new Map() };
  const queue = fileStamps(day);
  let read = 0;
  const absent = [];
  const failed = [];
  async function worker() {
    while (queue.length) {
      const stamp = queue.shift();
      try {
        const zip = await fetchFile(`${FILES}/${stamp}.export.CSV.zip`, deps);
        if (!zip) { absent.push(stamp); continue; }
        addEvents(unzipFirst(zip).toString('utf8'), totals);
        read++;
      } catch (err) {
        failed.push({ stamp, error: err.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // A day with many unreadable files would be saved as a misleading low count; keep the previous rows instead.
  if (read < 80) throw new Error(`Only ${read} of 96 GDELT files read for ${day} (${absent.length} missing, ${failed.length} failed); nothing written`);

  const payload = toPayload(day, totals);
  const res = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/rpc/replace_gdelt_daily`, {
    method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify(payload),
  });
  const written = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase write failed: HTTP ${res.status} ${written?.message || ''}`);
  const summary = { day, files: read, absent: absent.length, failed, countryRows: payload.countries.length, pairRows: payload.pairs.length, rows: written };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, unzipFirst, fileStamps, addEvents, toPayload, yesterday, COUNTRIES };

if (require.main === module) {
  run().catch((err) => {
    console.error(`GDELT routine failed: ${err.message}`);
    process.exit(1);
  });
}
