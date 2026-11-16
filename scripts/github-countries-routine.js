#!/usr/bin/env node
// Where AI is built: for each month, the 100 most-starred AI projects created on GitHub that month (GitHub GraphQL
// API, free, official), with the country of each builder read from the location on their profile, into
// public.github_ai_builders_monthly. Each country's 3 biggest projects get plain-language text (Gemini).
//   node scripts/github-countries-routine.js            # last 3 months (weekly)
//   node scripts/github-countries-routine.js 2017-01 [2019-12]   # every month since then [until], one-off history
// Env: SUPABASE_URL, SUPABASE_KEY (secret key), GITHUB_TOKEN (required by GraphQL), GEMINI_API_KEY (optional). Node >= 20.
'use strict';

const { TOPICS, topRepos, plainNames } = require('./github-routine.js');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const ALIASES = {
  US: ['usa', 'us', 'u.s.', 'u.s.a.', 'america', 'united states of america', 'silicon valley', 'bay area', 'san francisco bay area', 'sf', 'nyc',
    'san francisco', 'new york', 'new york city', 'brooklyn', 'manhattan', 'seattle', 'boston', 'los angeles', 'austin', 'chicago', 'san jose', 'palo alto',
    'mountain view', 'menlo park', 'berkeley', 'oakland', 'san diego', 'portland', 'denver', 'atlanta', 'miami', 'washington dc', 'washington, d.c.', 'dc',
    'pittsburgh', 'philadelphia', 'redmond', 'sunnyvale', 'santa clara', 'cupertino', 'california', 'texas', 'florida', 'massachusetts', 'new jersey',
    'illinois', 'colorado', 'oregon', 'virginia', 'north carolina', 'ohio', 'michigan', 'pennsylvania', 'utah', 'arizona', 'minnesota', 'maryland',
    'wisconsin', 'tennessee', 'indiana', 'missouri', 'nevada', 'connecticut', 'washington', 'ny', 'wa', 'tx'],
  CN: ['prc', 'mainland china', 'beijing', 'shanghai', 'shenzhen', 'hangzhou', 'guangzhou', 'chengdu', 'nanjing', 'wuhan', "xi'an", 'xian', 'suzhou',
    'tianjin', 'chongqing', 'xiamen', 'hefei', 'changsha', '北京', '上海', '深圳', '杭州', '广州', '成都', '南京', '武汉', '中国'],
  IN: ['bangalore', 'bengaluru', 'mumbai', 'delhi', 'new delhi', 'hyderabad', 'pune', 'chennai', 'kolkata', 'noida', 'gurgaon', 'gurugram', 'ahmedabad', 'jaipur', 'kochi'],
  JP: ['tokyo', 'osaka', 'kyoto', 'yokohama', 'fukuoka', '東京', '大阪', '日本'],
  KR: ['korea', 'seoul', 'busan', 'pangyo', '서울', '한국', '대한민국'],
  GB: ['uk', 'u.k.', 'england', 'scotland', 'wales', 'britain', 'great britain', 'london', 'manchester', 'edinburgh', 'oxford', 'bristol', 'glasgow', 'birmingham'],
  DE: ['berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'köln', 'stuttgart'],
  FR: ['paris', 'lyon', 'toulouse'], CA: ['toronto', 'vancouver', 'montreal', 'montréal', 'ottawa', 'waterloo', 'calgary'],
  BR: ['brasil', 'são paulo', 'sao paulo', 'rio de janeiro', 'belo horizonte', 'curitiba', 'porto alegre', 'florianópolis', 'florianopolis', 'recife', 'brasília', 'brasilia'],
  AU: ['sydney', 'melbourne', 'brisbane', 'perth'], NL: ['amsterdam', 'rotterdam', 'delft', 'the netherlands', 'holland'], ES: ['madrid', 'barcelona', 'valencia'],
  IT: ['milan', 'milano', 'rome', 'roma', 'turin', 'torino'], CH: ['zurich', 'zürich', 'geneva', 'lausanne'], SE: ['stockholm'], IL: ['tel aviv', 'jerusalem', 'haifa'],
  RU: ['moscow', 'saint petersburg', 'st. petersburg', 'москва'], UA: ['kyiv', 'kiev', 'lviv', 'kharkiv'], PL: ['warsaw', 'kraków', 'krakow', 'wroclaw', 'wrocław'],
  TR: ['istanbul', 'ankara', 'türkiye', 'turkiye'], ID: ['jakarta', 'bandung'], VN: ['hanoi', 'ho chi minh city', 'saigon'], MX: ['mexico city', 'cdmx', 'guadalajara', 'monterrey'],
  AR: ['buenos aires'], TW: ['taipei', 'hsinchu', '台北', '台灣', '台湾'], HK: ['香港'], PT: ['lisbon', 'lisboa', 'porto'], AE: ['dubai', 'abu dhabi', 'uae'], NG: ['lagos'],
  KE: ['nairobi'], EG: ['cairo'], ZA: ['cape town', 'johannesburg'], PK: ['karachi', 'lahore', 'islamabad'], BD: ['dhaka'], TH: ['bangkok'], PH: ['manila'],
  MY: ['kuala lumpur'], CO: ['bogotá', 'bogota', 'medellín', 'medellin'], PE: ['lima'], IE: ['dublin'], AT: ['vienna', 'wien'], BE: ['brussels'], DK: ['copenhagen'],
  NO: ['oslo'], FI: ['helsinki'], CZ: ['prague'], HU: ['budapest'], RO: ['bucharest'], GR: ['athens'], IR: ['tehran'], SA: ['riyadh'], SG: ['新加坡'],
};
const AMBIGUOUS = new Set(['georgia', 'jersey']);
// Not real current countries, or old codes that ICU names like today's country (DD = Germany).
const OLD_CODES = ['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'XK', 'ZZ', 'DD', 'SU', 'YU', 'CS', 'VD', 'ZR', 'TP', 'BU', 'FX', 'YD', 'AN', 'NT', 'QU', 'EA', 'IC', 'DG', 'CP', 'TA', 'AC'];
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const lang of ['en', 'pt', 'es', 'de', 'fr', 'it', 'nl', 'ru', 'uk', 'pl', 'tr', 'id', 'vi', 'zh', 'ja', 'ko']) {
    const dn = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
    for (const a of A) for (const b of A) {
      const cc = a + b, n = dn.of(cc);
      if (n && !/^\d/.test(cc) && !OLD_CODES.includes(cc) && !INDEX.has(n.toLowerCase())) INDEX.set(n.toLowerCase(), cc);
    }
  }
  for (const [cc, list] of Object.entries(ALIASES)) for (const n of list) INDEX.set(n, cc);
  for (const n of AMBIGUOUS) INDEX.delete(n);
  return INDEX;
}

// Free-text profile location -> ISO country code, or null when it doesn't clearly name one place.
function countryOf(location) {
  const s = String(location || '').toLowerCase().normalize('NFC').trim();
  if (!s) return null;
  const idx = index();
  if (idx.has(s)) return idx.get(s);
  const parts = s.split(/[,;|/()·•\-–—]+|\s{2,}/).map((p) => p.trim().replace(/[.!]+$/, '')).filter(Boolean);
  for (const p of parts.reverse()) if (idx.has(p)) return idx.get(p);
  for (const [n, cc] of idx) if (/[^\u0000-\u024f]/.test(n) && s.includes(n)) return cc;
  return null;
}

const clean = (t) => String(t).replace(/[\u0000-\u001f]/g, ' ').toWellFormed();
const monthsFrom = (start, now) => {
  const out = [];
  for (let d = new Date(`${start}-01T00:00:00Z`); d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) out.push(d.toISOString().slice(0, 10));
  return out;
};
const monthEnd = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);

async function main(env = process.env, now = new Date(), argv = process.argv.slice(2)) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY || !env.GITHUB_TOKEN) throw new Error('SUPABASE_URL, SUPABASE_KEY and GITHUB_TOKEN are required.');
  const key = env.SUPABASE_KEY.trim(), base = env.SUPABASE_URL.trim().replace(/\/$/, '');
  const db = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const gql = async (query) => {
    for (let k = 0; k < 4; k++) {
      const r = await fetch('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'LikePolling/1.0 (https://www.likepolling.com)', 'Content-Type': 'application/json' } });
      const j = r.ok ? await r.json() : null;
      if (j && j.data) return j.data;
      await sleep(30000 * (k + 1));
    }
    throw new Error('GitHub GraphQL failed');
  };
  const start = argv[0] && /^\d{4}-\d{2}$/.test(argv[0]) ? argv[0] : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 7);
  let saved = 0;
  const until = argv[1] && /^\d{4}-\d{2}$/.test(argv[1]) ? argv[1] : '9999-12';
  for (const month of monthsFrom(start, now).filter((m) => m.slice(0, 7) <= until)) {
    const lists = [], where = new Map();
    for (const t of TOPICS) {
      const d = await gql(`{ search(query: "topic:${t} created:${month}..${monthEnd(month)} sort:stars-desc", type: REPOSITORY, first: 100) { nodes { ... on Repository {
        nameWithOwner stargazerCount description url isFork owner { ... on User { location } ... on Organization { location } } } } } }`);
      lists.push((d.search.nodes || []).filter((n) => n && n.nameWithOwner).map((n) => {
        where.set(n.nameWithOwner, n.owner && n.owner.location ? clean(n.owner.location).slice(0, 120).toWellFormed() : null);
        return { full_name: n.nameWithOwner, stargazers_count: n.stargazerCount, description: n.description ? clean(n.description) : null, html_url: n.url, fork: n.isFork };
      }));
      await sleep(1200);
    }
    const rows = topRepos(lists, month, 100).map(({ language, day, ...r }) => ({ month: day, ...r, description: r.description && r.description.toWellFormed(), location: where.get(r.full_name) || null, country_code: countryOf(where.get(r.full_name)), plain: null }));
    if (!rows.length) continue;
    const known = await fetch(`${base}/rest/v1/github_ai_builders_monthly?select=full_name,plain&month=eq.${month}&plain=not.is.null`, { headers: db }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    for (const k of known) { const r = rows.find((x) => x.full_name === k.full_name); if (r) r.plain = k.plain; }
    await fetch(`${base}/rest/v1/github_ai_builders_monthly?month=eq.${month}`, { method: 'DELETE', headers: db });
    const w = await fetch(`${base}/rest/v1/github_ai_builders_monthly`, { method: 'POST', body: JSON.stringify(rows), headers: { ...db, Prefer: 'return=minimal' } });
    if (!w.ok && env.DUMP) require("fs").writeFileSync(`/tmp/bad-${month}.json`, JSON.stringify(rows));
    if (!w.ok) throw new Error(`write ${month} ${w.status} ${await w.text()}`);
    saved += rows.length;
    console.log(`${month}: ${rows.length} projects, ${rows.filter((r) => r.country_code).length} with a country`);
  }
  if (env.GEMINI_API_KEY) {
    const all = [];
    for (let o = 0; ; o += 1000) {
      const b = await fetch(`${base}/rest/v1/github_ai_builders_monthly?select=month,full_name,description,country_code,has:plain->en&country_code=not.is.null&order=stars.desc&limit=1000&offset=${o}`, { headers: db }).then((r) => r.json());
      all.push(...b);
      if (b.length < 1000) break;
    }
    const per = {}, todo = [];
    for (const r of all) if ((per[r.country_code] = (per[r.country_code] || 0) + 1) <= 3 && !r.has) todo.push(r);
    const ask = require('./news-world-routine.js').geminiJson(env.GEMINI_API_KEY);
    for (let i = 0; i < todo.length; i += 10) {
      const part = todo.slice(i, i + 10);
      try {
        const out = await plainNames(part, ask);
        for (const [j, p] of out.entries()) if (p) await fetch(`${base}/rest/v1/github_ai_builders_monthly?month=eq.${part[j].month}&full_name=eq.${encodeURIComponent(part[j].full_name)}`, { method: 'PATCH', body: JSON.stringify({ plain: p }), headers: db });
      } catch (e) { console.error(`plain titles skipped: ${String(e.message).split('\n')[0]}`); }
    }
    console.log(`plain text for ${todo.length} top projects`);
  }
  console.log(`github countries: ${saved} projects saved`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, countryOf };
