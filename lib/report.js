// Country Inspiration Report: what one country (or two, side by side) read and talked about over the
// last 30 days, from Like Polling's own daily records of open data only: Wikimedia page views (free
// for commercial use) and The GDELT Project (free with credit). Used by api/report.js (the page) and
// scripts/report-ideas-routine.js (Gemini's weekly "ideas to copy").
// Deliberately NOT included: YouTube API data (selling access to it needs YouTube's written approval)
// and Google News headlines (they belong to the publishers). Those stay free on the homepage.
'use strict';

const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
  'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
const DAYS = 30;
const SAMPLE = ['BR', 'PT'];
// CAMEO root codes (GDELT), in plain words. 01-08 = cooperation, 09-20 = conflict.
const TOPICS = {
  '01': 'Public statements', '02': 'Appeals and requests', '03': 'Plans to cooperate', '04': 'Talks and meetings',
  '05': 'Diplomacy', '06': 'Business and material cooperation', '07': 'Aid', '08': 'Concessions',
  '09': 'Investigations', '10': 'Demands', '11': 'Criticism', '12': 'Rejections', '13': 'Threats', '14': 'Protests',
  '15': 'Military posture', '16': 'Cutting ties', '17': 'Coercion', '18': 'Assaults', '19': 'Fighting', '20': 'Mass violence',
};
// Wikipedia home pages (all languages we track) are not "articles people read about".
const MAIN_PAGES = new Set(['Main_Page', 'Hauptseite', 'Pagina_principale', 'Página_principal', 'Заглавная_страница', 'Головна_сторінка',
  'メインページ', 'Strona_główna', 'Hoofdpagina', 'Halaman_Utama', 'หน้าหลัก', 'Trang_Chính', 'Anasayfa', 'Portada', 'Accueil_principal', '-']);

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
const ADULT = /porn|xxx|xvideos|xnxx|xhamster|onlyfans|hentai|chaturbate|redtube|youporn/i;
const cleanArticle = (a) => a && !a.includes(':') && !MAIN_PAGES.has(a) && !ADULT.test(a);
const wikiLink = (project, article) => `https://${project}.org/wiki/${encodeURIComponent(article)}`;

// Most-read pages over the period, and "rising": pages that only entered the daily top 30 in the
// last 7 days.
function wikipedia(rows, now, max = 12) {
  const by = new Map();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const total = new Map();
  for (const r of rows) {
    if (!cleanArticle(r.article)) continue;
    total.set(r.day, (total.get(r.day) || 0) + (Number(r.views_ceil) || 0));
    const k = r.article; // same page in two Wikipedias (e.g. pt and en) counts once
    const a = by.get(k) || { project: r.project, article: r.article, views: 0, days: new Set(), first: r.day };
    a.views += Number(r.views_ceil) || 0;
    a.days.add(r.day);
    a.byDay = a.byDay || new Map();
    a.byDay.set(r.day, (a.byDay.get(r.day) || 0) + (Number(r.views_ceil) || 0));
    if (r.day < a.first) a.first = r.day;
    by.set(k, a);
  }
  const all = [...by.values()].sort((x, y) => y.views - x.views)
    .map((a) => ({ title: a.article.replace(/_/g, ' '), project: a.project, article: a.article, views: a.views, days: a.days.size, first_day: a.first,
      series: days.map((d) => a.byDay.get(d) || 0), link: wikiLink(a.project, a.article) }));
  return { top: all.slice(0, max), rising: all.filter((a) => a.first_day >= weekAgo).slice(0, 8), days, daily_total: days.map((d) => total.get(d) || 0) };
}

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

async function buildCountry(get, cc, now = new Date(), { ideas = true } = {}) {
  const sinceDay = new Date(now.getTime() - DAYS * 864e5).toISOString().slice(0, 10);
  const q = `country_code=eq.${cc}`;
  const [wiki, gdelt, pairs, insight] = await Promise.all([
    readAll(get, `wiki_top_daily?select=day,project,article,views_ceil&${q}&rank=lte.30&day=gte.${sinceDay}&order=day.desc`),
    readAll(get, `gdelt_country_daily?select=day,root_code,articles&${q}&day=gte.${sinceDay}&order=day.desc`),
    readAll(get, `gdelt_pairs_daily?select=actor1_cc,actor2_cc,articles&or=(actor1_cc.eq.${cc},actor2_cc.eq.${cc})&day=gte.${sinceDay}&order=day.desc`),
    ideas ? get(`report_insights?select=ideas,generated_at&${q}&limit=1`).catch(() => []) : [],
  ]);
  const w = wikipedia(wiki, now);
  const ps = partners(pairs, cc, 50);
  return {
    country: cc,
    wikipedia: w.top,
    wikipedia_rising: w.rising,
    wikipedia_days: w.days,
    wikipedia_daily_total: w.daily_total,
    news_focus: newsFocus(gdelt),
    news_daily: newsDaily(gdelt),
    news_partners: ps.slice(0, 6),
    all_partners: ps,
    ideas: Array.isArray(insight[0]?.ideas) ? insight[0].ideas : [],
    ideas_at: insight[0]?.generated_at || null,
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

async function buildReport(get, list, now = new Date(), { fetchImpl = null } = {}) {
  const [countries, g] = await Promise.all([Promise.all(list.map((cc) => buildCountry(get, cc, now))), fetchImpl ? gdp(fetchImpl, list, now).catch(() => ({})) : {}]);
  for (const c of countries) if (g[c.country] && g[c.country].length >= 3) c.gdp = g[c.country];
  const out = { generated_at: now.toISOString(), period_days: DAYS, countries };
  if (countries.length === 2) {
    const [a, b] = countries;
    const inB = new Set(b.wikipedia.concat(b.wikipedia_rising).map((x) => `${x.project}|${x.article}`));
    out.shared = {
      read_in_both: [...new Map(a.wikipedia.concat(a.wikipedia_rising).filter((x) => inB.has(`${x.project}|${x.article}`)).map((x) => [x.link, x])).values()],
      articles_together: a.all_partners.find((p) => p.country === b.country)?.articles || 0,
    };
  }
  for (const c of countries) delete c.all_partners;
  return out;
}

module.exports = { COUNTRIES, SAMPLE, DAYS, TOPICS, HttpError, rest, readAll, parseCountries, isSample, buildCountry, buildReport, wikipedia, newsFocus, newsDaily, partners };
