// Country Inspiration Report: what one country (or two, side by side) searched and talked about over the
// last 30 days, from Like Polling's own daily records of open data only: Google Trends searches and
// The GDELT Project (free with credit). Used by api/report.js (the page) and
// scripts/report-ideas-routine.js (Gemini's weekly "ideas to copy").
// Deliberately NOT included: YouTube API data (selling access to it needs YouTube's written approval)
// and Google News headlines (they belong to the publishers). Those stay free on the homepage.
'use strict';
const { indexed } = require('./news-coverage');

// The 14 main countries (lib/countries.js) minus Russia and China, which have no YouTube data.
const COUNTRIES = ['BR', 'DE', 'ES', 'FR', 'GB', 'IN', 'JP', 'KR', 'MX', 'PT', 'UA', 'US'];
const DAYS = 30;
const SAMPLE = ['BR', 'PT'];
// CAMEO root codes (GDELT), in plain words. 01-08 = cooperation, 09-20 = conflict.
const TOPICS = {
  '01': 'Public statements', '02': 'Appeals and requests', '03': 'Plans to cooperate', '04': 'Talks and meetings',
  '05': 'Diplomacy', '06': 'Business and material cooperation', '07': 'Aid', '08': 'Concessions',
  '09': 'Investigations', '10': 'Demands', '11': 'Criticism', '12': 'Rejections', '13': 'Threats', '14': 'Protests',
  '15': 'Military posture', '16': 'Cutting ties', '17': 'Coercion', '18': 'Assaults', '19': 'Fighting', '20': 'Mass violence',
};
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function rest(env, fetchImpl) {
  const base = `${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/`;
  const key = env.SUPABASE_KEY.trim();
  const once = async (path) => {
    const res = await fetchImpl(base + path, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new HttpError(502, `Database read failed (${res.status})`);
    return res.json();
  };
  return (path) => once(path).catch(() => once(path));
}

async function readAll(get, path, page = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += page) {
    const batch = await get(`${path}&limit=${page}&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

function parseCountries(value) {
  const list = [...new Set(String(value || '').toUpperCase().split(/[\s,]+/).filter((c) => COUNTRIES.includes(c)))];
  return list.slice(0, 2);
}

const isSample = (list) => list.length === 2 && [...list].sort().join() === SAMPLE.join();
function newsFocus(rows) {
  const by = new Map();
  let total = 0;
  for (const r of rows) { const n = Number(r.articles) || 0; total += n; by.set(r.root_code, (by.get(r.root_code) || 0) + n); }
  if (!total) return { articles: 0, cooperation_pct: null, topics: [] };
  const coop = [...by].filter(([c]) => Number(c) <= 8).reduce((a, [, n]) => a + n, 0);
  const topics = [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([code, n]) => ({ topic: TOPICS[code] || code, pct: Math.round((n / total) * 100) }));
  return { articles: total, cooperation_pct: Math.round((coop / total) * 100), topics };
}

// Articles per day, every topic together (the GDELT rows carry their day).
function newsDaily(rows) {
  const by = new Map();
  for (const r of rows) if (r.day) by.set(r.day, (by.get(r.day) || 0) + (Number(r.articles) || 0));
  return [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, articles]) => ({ day, articles }));
}

function partners(rows, cc, max = 6) {
  const by = new Map();
  for (const r of rows) {
    const other = r.actor1_cc === cc ? r.actor2_cc : r.actor1_cc;
    if (!other || other === cc) continue;
    by.set(other, (by.get(other) || 0) + (Number(r.articles) || 0));
  }
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, max).map(([country, articles]) => ({ country, articles }));
}

// Google Trends searches saved by scripts/trends-routine.js: total approximate searches and trending days per search.
function searches(rows, max = 10) {
  const by = new Map();
  for (const r of rows || []) {
    const k = String(r.query || '').toLowerCase();
    if (!k) continue;
    const s = by.get(k) || { query: r.query, days: new Set(), traffic: 0 };
    s.days.add(r.day); s.traffic += Number(r.traffic) || 0;
    by.set(k, s);
  }
  const top = [...by.values()].map((s) => ({ query: s.query, days: s.days.size, traffic: s.traffic })).sort((a, b) => b.traffic - a.traffic || b.days - a.days).slice(0, max);
  return { top, days: new Set((rows || []).map((r) => r.day)).size };
}

// Time capsule: each month since we started, the country's top searches and news coverage (open data only).
function throughTime(trends, gdelt, per = 3) {
  const months = new Map();
  const m = (k) => months.get(k) || months.set(k, { searched: new Map(), articles: 0 }).get(k);
  for (const t of trends || []) {
    const k = String(t.day || '').slice(0, 7);
    const q = String(t.query || '');
    if (!k || !q) continue;
    const r = m(k).searched.get(q.toLowerCase()) || { query: q, traffic: 0 };
    r.traffic += Number(t.traffic) || 0;
    m(k).searched.set(q.toLowerCase(), r);
  }
  for (const g of gdelt || []) {
    const k = String(g.day || '').slice(0, 7);
    if (k) m(k).articles += Number(g.articles) || 0;
  }
  return [...months].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, v]) => ({
    month,
    searches: [...v.searched.values()].sort((a, b) => b.traffic - a.traffic).slice(0, per),
    news_articles: v.articles,
  }));
}

// What is new (or gone) in the top 6 searches since an earlier snapshot of the same country.
function sinceLast(c, prev, day, max = 3) {
  if (!prev || !day) return null;
  const diff = (now, before) => {
    const had = new Set(before.map((x) => x.toLowerCase()));
    return now.filter((x) => !had.has(x.toLowerCase())).slice(0, max);
  };
  const asked = (x) => ((x.searches && x.searches.top) || []).slice(0, 6).map((q) => q.query);
  const out = { day, new_searches: diff(asked(c), asked(prev)), gone_searches: diff(asked(prev), asked(c)) };
  return out.new_searches.length || out.gone_searches.length ? out : { ...out, same: true };
}

async function buildCountry(get, cc, now = new Date(), { ideas = true, history = false } = {}) {
  const sinceDay = new Date(now.getTime() - DAYS * 864e5).toISOString().slice(0, 10);
  const q = `country_code=eq.${cc}`;
  const today = now.toISOString().slice(0, 10);
  const [gdelt, pairs, insight, trends, hols] = await Promise.all([
    readAll(get, `gdelt_country_daily?select=day,root_code,articles&${q}&day=gte.${sinceDay}&order=day.desc`),
    readAll(get, `gdelt_pairs_daily?select=actor1_cc,actor2_cc,articles&or=(actor1_cc.eq.${cc},actor2_cc.eq.${cc})&day=gte.${sinceDay}&order=day.desc`),
    ideas ? get(`report_insights?select=ideas,generated_at&${q}&limit=1`).catch(() => []) : [],
    readAll(get, `trends_daily?select=day,query,traffic&${q}&day=gte.${sinceDay}&order=day.desc`).catch(() => []),
    get(`holidays?select=day,local_name,name&${q}&day=gte.${today}&order=day.asc&limit=6`).catch(() => []),
  ]);
  const [trendsAll, gdeltAll] = history ? await Promise.all([
    readAll(get, `trends_daily?select=day,query,traffic&${q}&order=day.asc`).catch(() => []),
    readAll(get, `gdelt_country_daily?select=day,articles&${q}&order=day.asc`).catch(() => []),
  ]) : [[], []];
  const ps = partners(pairs, cc, 50);
  return {
    country: cc,
    news_focus: newsFocus(gdelt),
    news_daily: newsDaily(gdelt),
    news_partners: ps.slice(0, 6),
    all_partners: ps,
    ideas: (Array.isArray(insight[0]?.ideas) ? insight[0].ideas : []).filter((i) => !/wikipedia/i.test(JSON.stringify(i))),
    ideas_at: insight[0]?.generated_at || null,
    searches: searches(trends),
    holidays: (Array.isArray(hols) ? hols : []).map((h) => ({ day: h.day, local_name: h.local_name, name: h.name })),
    ...(history ? { through_time: throughTime(trendsAll, gdeltAll) } : {}),
  };
}

// Yearly GDP (current US$), GDP per person and real growth from the World Bank's open API.
async function gdp(fetchImpl, list, now) {
  const y = now.getUTCFullYear();
  const res = await fetchImpl(`https://api.worldbank.org/v2/country/${list.join(';')}/indicator/NY.GDP.MKTP.CD;NY.GDP.PCAP.CD;NY.GDP.MKTP.KD.ZG?source=2&format=json&per_page=1000&date=${y - 11}:${y}`, { signal: AbortSignal.timeout(10000) });
  if (!res || !res.ok) return {};
  const rows = (await res.json())?.[1] || [];
  const out = {};
  const key = { 'NY.GDP.MKTP.CD': 'usd', 'NY.GDP.PCAP.CD': 'per_person', 'NY.GDP.MKTP.KD.ZG': 'growth_pct' };
  for (const r of rows) {
    if (r.value == null || !key[r.indicator?.id]) continue;
    const c = (out[r.country?.id] ||= {});
    (c[r.date] ||= { year: Number(r.date) })[key[r.indicator.id]] = key[r.indicator.id] === 'growth_pct' ? Math.round(r.value * 10) / 10 : Math.round(r.value);
  }
  for (const cc of Object.keys(out)) out[cc] = Object.values(out[cc]).filter((v) => v.usd).sort((a, b) => a.year - b.year).slice(-10);
  return out;
}

// Each month's count of the world's top 100 new AI projects made in this country, and its 3 biggest.
function aiBuilders(months, rows) {
  if (months.length < 2 || !rows.length) return null;
  const top = new Map();
  for (const r of rows) { const y = String(r.month).slice(0, 4); if (!top.has(y)) top.set(y, r); }
  const years = [...new Set(months.map((m) => String(m.month).slice(0, 4)))].sort();
  return {
    by_year: years.map((year) => { const r = top.get(year); return { year, top: r ? { full_name: r.full_name, description: r.description, stars: r.stars, url: r.url, plain: r.plain || null } : null }; }),
    total: rows.length,
  };
}

// Each month's top World News story per country, from the time capsule archive: among the stories that reached #1
// that month, the one that stayed longest (same rule as the month_top_stories database function).
function topStories(rows) {
  const out = {};
  for (const r of rows || []) {
    const m = String(r.first_seen || '').slice(0, 7);
    if (!m || !r.title_en) continue;
    const stay = Date.parse(r.last_seen) - Date.parse(r.first_seen) || 0;
    const by = (out[r.country_code] = out[r.country_code] || {});
    if (!by[m] || stay > by[m].stay) by[m] = { stay, title: r.title_en, title_tr: r.title_tr || null, link: r.link };
  }
  return out;
}

async function buildReport(get, list, now = new Date(), { fetchImpl = null } = {}) {
  const [countries, g, cov] = await Promise.all([Promise.all(list.map((cc) => buildCountry(get, cc, now, { history: true }))), fetchImpl ? gdp(fetchImpl, list, now).catch(() => ({})) : {},
    get(`news_coverage_monthly?select=country_code,month,share&country_code=in.(${list.join(',')})&order=month.asc`).catch(() => [])]);
  countries.forEach((c) => {
    if (g[c.country] && g[c.country].length >= 3) c.gdp = g[c.country];
    const pts = indexed((Array.isArray(cov) ? cov : []).filter((r) => r.country_code === c.country));
    if (pts.length > 1) c.news_by_month = pts;
  });
  const [bMonths, bRows] = await Promise.all([get('github_ai_builders_monthly?select=month&rank=eq.1&order=month.asc&limit=1000').catch(() => []),
    readAll(get, `github_ai_builders_monthly?select=month,full_name,description,stars,url,plain,country_code&country_code=in.(${list.join(',')})&order=stars.desc`).catch(() => [])]);
  const tops = topStories(await readAll(get, `news_archive?select=country_code,first_seen,last_seen,title_en,title_tr,link&section=eq.world&best_rank=eq.1&country_code=in.(${list.join(',')})&order=first_seen.asc`).catch(() => []));
  for (const c of countries) {
    for (const m of c.through_time || []) {
      const t = (tops[c.country] || {})[m.month];
      if (t) m.top_story = { title: t.title, title_tr: t.title_tr, link: t.link };
    }
  }
  countries.forEach((c) => { const b = aiBuilders(Array.isArray(bMonths) ? bMonths : [], bRows.filter((r) => r.country_code === c.country)); if (b) c.ai_builders = b; });
  const prev = await get(`report_snapshots?select=day,countries:body->countries&kind=eq.country&subjects=eq.${encodeURIComponent(list.join(','))}&day=lt.${now.toISOString().slice(0, 10)}&order=day.desc&limit=1`).catch(() => []);
  const before = Array.isArray(prev) && prev[0];
  for (const c of countries) {
    const s = sinceLast(c, before && (before.countries || []).find((p) => p.country === c.country), before && before.day);
    if (s) c.since_last = s;
  }
  const out = { generated_at: now.toISOString(), period_days: DAYS, countries };
  if (countries.length === 2) {
    const [a, b] = countries;
    const inB = new Set(((b.searches && b.searches.top) || []).map((x) => x.query.toLowerCase()));
    out.shared = {
      searched_in_both: ((a.searches && a.searches.top) || []).filter((x) => inB.has(x.query.toLowerCase())).map((x) => x.query),
      articles_together: a.all_partners.find((p) => p.country === b.country)?.articles || 0,
    };
  }
  for (const c of countries) delete c.all_partners;
  return out;
}

module.exports = { COUNTRIES, SAMPLE, DAYS, TOPICS, HttpError, rest, readAll, parseCountries, isSample, buildCountry, buildReport, throughTime, topStories, sinceLast, aiBuilders, newsFocus, newsDaily, partners, searches, gdp };
