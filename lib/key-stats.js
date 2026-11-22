// Real numbers for search pages and reports, from official or first-party sources (all free, no keys):
// World Bank (countries), SEC filings + Yahoo Finance share prices (companies), Deezer (musicians),
// TheSportsDB (clubs) and Brazil's election court, TSE (Lula vs Bolsonaro). Any failure = no card.
'use strict';
const entity = require('./entity-report');

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const BROWSER = 'Mozilla/5.0';
const SDB = 'https://www.thesportsdb.com/api/v1/json/123';
const getJson = (fetchImpl, url, ua = UA) => fetchImpl(url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  .then((r) => (r && r.ok ? r.json() : null)).catch(() => null);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const pct = (a, b) => (a != null && b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const WB = [['NY.GDP.MKTP.CD', 'gdp'], ['NY.GDP.MKTP.KD.ZG', 'growth'], ['NY.GDP.PCAP.CD', 'per_person'], ['FP.CPI.TOTL.ZG', 'inflation'], ['SL.UEM.TOTL.ZS', 'unemployment'], ['SP.POP.TOTL', 'population']];
// The World Bank API often answers 502 to uncached queries: saved rows (country_indicators, refreshed weekly) come first,
// and the live API, retried once, fills only what was never saved.
const wbRows = async (fetchImpl, iso2, id) => {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${id}?format=json&per_page=20&mrv=11`;
  for (let i = 0; i < 2; i++) {
    const j = await getJson(fetchImpl, url);
    if (j && Array.isArray(j[1])) return j[1].filter((r) => r.value != null).map((r) => ({ year: Number(r.date), value: r.value })).sort((a, b) => a.year - b.year);
  }
  return [];
};
async function countryStats(fetchImpl, iso2, saved = null) {
  if (!/^[A-Z]{2}$/.test(iso2 || '')) return null;
  const old = saved ? await saved(iso2).catch(() => []) : [];
  const got = await Promise.all(WB.map(async ([id, k]) => {
    const keep = old.filter((r) => r.indicator === id).map((r) => ({ year: Number(r.year), value: Number(r.value) }));
    const live = keep.length ? [] : await wbRows(fetchImpl, iso2, id);
    const by = new Map([...keep, ...live].map((r) => [r.year, r]));
    return [k, [...by.values()].sort((a, b) => a.year - b.year).slice(-11)];
  }));
  const by = Object.fromEntries(got);
  const last = (k) => (by[k] && by[k].length ? by[k][by[k].length - 1] : null);
  const prev = (k) => (by[k] && by[k].length > 1 ? by[k][by[k].length - 2] : null);
  const tile = (k, label, unit, d) => { const l = last(k); return l ? { label, value: unit === 'pct' ? round(l.value) : Math.round(l.value), unit, year: l.year, change: d ? pct(l.value, prev(k) && prev(k).value) : null } : null; };
  const tiles = [tile('gdp', 'Economy size (GDP)', 'usd', true), tile('growth', 'Economic growth', 'pct'), tile('per_person', 'GDP per person', 'usd', true),
    tile('inflation', 'Inflation (prices)', 'pct'), tile('unemployment', 'Unemployment', 'pct'), tile('population', 'Population', 'n', true)].filter(Boolean);
  if (tiles.length < 2) return null;
  const g = (by.growth || []).slice(-10);
  return { kind: 'country', source: 'World Bank', link: `https://data.worldbank.org/country/${iso2.toLowerCase()}`, tiles,
    series: g.length >= 3 ? { label: 'Economic growth per year', unit: 'pct', points: g.map((p) => ({ x: String(p.year), y: round(p.value) })) } : null };
}

// Exchange name (Wikidata) -> Yahoo Finance suffix. US exchanges have none.
const YAHOO = [[/New York|NYSE|NASDAQ|Nasdaq/, ''], [/Madrid|Bolsas y Mercados/, '.MC'], [/Paris/, '.PA'], [/London/, '.L'], [/Frankfurt|Xetra/, '.DE'], [/Tokyo/, '.T'],
  [/B3|São Paulo|Sao Paulo/, '.SA'], [/Lisbon/, '.LS'], [/Milan|Italiana/, '.MI'], [/Amsterdam/, '.AS'], [/Brussels/, '.BR'], [/Hong Kong/, '.HK'], [/Toronto/, '.TO'],
  [/SIX|Swiss/, '.SW'], [/Stockholm/, '.ST'], [/Copenhagen/, '.CO'], [/Oslo/, '.OL'], [/Korea/, '.KS'], [/Australian/, '.AX'], [/Mexican/, '.MX'], [/National Stock Exchange of India/, '.NS']];
async function tickerOf(get, title) {
  const q = (await get(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: title, prop: 'pageprops', ppprop: 'wikibase_item' })}`))?.query?.pages?.[0]?.pageprops?.wikibase_item;
  if (!q) return null;
  const list = ((await get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetclaims', entity: q, property: 'P414', format: 'json' })}`))?.claims?.P414 || [])
    .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue && c.qualifiers?.P249);
  const ids = list.map((c) => c.mainsnak.datavalue.value.id);
  if (!ids.length) return null;
  const ents = (await get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels', languages: 'en', format: 'json' })}`))?.entities || {};
  for (const c of list) {
    const label = ents[c.mainsnak.datavalue.value.id]?.labels?.en?.value || '';
    const hit = YAHOO.find(([re]) => re.test(label));
    const t = String(c.qualifiers.P249[0].datavalue?.value || '').trim().toUpperCase();
    if (hit && /^[A-Z0-9.-]{1,10}$/.test(t)) return { symbol: `${t.replace(/\./g, '-')}${hit[1]}`, exchange: label };
  }
  return null;
}
async function stockOf(fetchImpl, get, title) {
  const t = await tickerOf(get, title).catch(() => null);
  if (!t) return null;
  const j = await getJson(fetchImpl, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?range=5y&interval=1mo`, BROWSER);
  const r = j?.chart?.result?.[0];
  if (!r || !r.meta || String(r.meta.symbol).toUpperCase() !== t.symbol.toUpperCase()) return null;
  const closes = (r.timestamp || []).map((ts, i) => ({ day: new Date(ts * 1000).toISOString().slice(0, 10), close: r.indicators?.quote?.[0]?.close?.[i] })).filter((p) => p.close != null);
  const price = r.meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1].close : null);
  if (price == null || closes.length < 13) return null;
  const yearAgo = closes[closes.length - 13].close, first = closes[0];
  const years = new Map();
  for (const p of closes) years.set(p.day.slice(0, 4), p.close);
  return { symbol: t.symbol, exchange: t.exchange, currency: r.meta.currency || '', price: round(price, 2), change_1y: pct(price, yearAgo), change_5y: pct(price, first.close), since: first.day.slice(0, 7),
    yearly: [...years].map(([y, v]) => ({ x: y, y: round(v, 2) })), link: `https://finance.yahoo.com/quote/${encodeURIComponent(t.symbol)}` };
}
async function companyStats(fetchImpl, { title, parent }) {
  const get = entity.client(fetchImpl);
  const one = async (t) => {
    const [biz, stock] = await Promise.all([entity.business(get, t).catch(() => null), stockOf(fetchImpl, get, t).catch(() => null)]);
    return biz || stock ? { biz, stock, of: t } : null;
  };
  const r = (await one(title)) || (parent && parent !== title ? await one(parent) : null);
  if (!r) return null;
  const tiles = [];
  const ys = r.biz ? r.biz.years : [];
  const y = ys[ys.length - 1], py = ys[ys.length - 2];
  if (y && y.revenue) tiles.push({ label: 'Sales (revenue)', value: y.revenue, unit: 'usd', year: y.year, change: pct(y.revenue, py && py.revenue) });
  if (y && y.profit != null) tiles.push({ label: 'Profit', value: y.profit, unit: 'usd', year: y.year, change: py && py.profit > 0 && y.profit > 0 ? pct(y.profit, py.profit) : null });
  if (r.stock) {
    tiles.push({ label: `Share price (${r.stock.symbol})`, value: r.stock.price, unit: 'price', currency: r.stock.currency, change: r.stock.change_1y, change_label: 'in a year' });
    if (r.stock.change_5y != null) tiles.push({ label: 'Share price change, 5 years', value: r.stock.change_5y, unit: 'pct_signed' });
  }
  if (!tiles.length) return null;
  const series = ys.length >= 3 ? { label: 'Sales per year', unit: 'usd', points: ys.map((v) => ({ x: String(v.year), y: v.revenue })) }
    : r.stock && r.stock.yearly.length >= 3 ? { label: 'Share price per year', unit: 'price', currency: r.stock.currency, points: r.stock.yearly } : null;
  const sources = [r.biz && { name: 'SEC filings', link: r.biz.link }, r.stock && { name: 'Yahoo Finance', link: r.stock.link }].filter(Boolean);
  return { kind: 'company', owner: r.of !== title ? r.of.replace(/ \([^)]*\)$/, '') : null, source: sources.map((s) => s.name).join(' · '), link: sources[0].link, sources, tiles, series };
}

async function musicStats(fetchImpl, name) {
  const j = await getJson(fetchImpl, `https://api.deezer.com/search/artist?${new URLSearchParams({ q: name, limit: '5' })}`);
  const a = ((j && j.data) || []).find((x) => norm(x.name) === norm(name));
  if (!a) return null;
  const [full, top] = await Promise.all([getJson(fetchImpl, `https://api.deezer.com/artist/${a.id}`), getJson(fetchImpl, `https://api.deezer.com/artist/${a.id}/top?limit=5`)]);
  if (!full || !full.nb_fan) return null;
  const songs = ((top && top.data) || []).map((t) => ({ title: t.title, sub: t.album && t.album.title !== t.title ? t.album.title : '' })).filter((s) => s.title);
  return { kind: 'music', source: 'Deezer', link: `https://www.deezer.com/artist/${a.id}`,
    tiles: [{ label: 'Fans on Deezer', value: full.nb_fan, unit: 'n' }, ...(full.nb_album ? [{ label: 'Albums and singles', value: full.nb_album, unit: 'n' }] : [])],
    list: songs.length ? { label: 'Most played on Deezer right now', items: songs } : null };
}

const clubName = (t) => String(t || '').replace(/ \([^)]*\)$/, '').replace(/^((S|F|A|C|R|U|A\.?F|R\.?C\.?D|S\.?S\.?C|S\.?S|U\.?S)\.?\s?(L|C|F|D)?\.?)\s+/i, '').replace(/\s+(F\.?C\.?|C\.?F\.?|A\.?F\.?C\.?|S\.?C\.?)$/i, '').trim();
async function clubStats(fetchImpl, title) {
  const want = clubName(title);
  const j = await getJson(fetchImpl, `${SDB}/searchteams.php?${new URLSearchParams({ t: want })}`);
  const team = ((j && j.teams) || []).find((t) => [t.strTeam, ...(String(t.strTeamAlternate || '').split(','))].some((n) => norm(n) === norm(want) || norm(n) === norm(title.replace(/ \([^)]*\)$/, ''))));
  if (!team) return null;
  const [last, next] = await Promise.all([getJson(fetchImpl, `${SDB}/eventslast.php?id=${team.idTeam}`), getJson(fetchImpl, `${SDB}/eventsnext.php?id=${team.idTeam}`)]);
  const game = (e) => ({ title: e.intHomeScore != null && e.intAwayScore != null ? `${e.strHomeTeam} ${e.intHomeScore}–${e.intAwayScore} ${e.strAwayTeam}` : `${e.strHomeTeam} vs ${e.strAwayTeam}`, sub: `${e.strLeague} · ${e.dateEvent}` });
  const played = ((last && last.results) || []).filter((e) => e.intHomeScore != null).slice(0, 5).map(game);
  const coming = ((next && next.events) || []).slice(0, 3).map(game);
  const tiles = [team.strLeague && { label: 'League', value: team.strLeague, unit: 'text' }, team.intFormedYear && { label: 'Founded', value: Number(team.intFormedYear), unit: 'year' },
    team.strStadium && { label: 'Stadium', value: team.strStadium, unit: 'text' }, team.strCountry && { label: 'Country', value: team.strCountry, unit: 'text' }].filter(Boolean);
  if (!tiles.length) return null;
  const items = [...played.map((g) => ({ ...g, sub: `Result · ${g.sub}` })), ...coming.map((g) => ({ ...g, sub: `Next · ${g.sub}` }))];
  return { kind: 'club', source: 'TheSportsDB', link: `https://www.thesportsdb.com/team/${team.idTeam}`, tiles, list: items.length ? { label: 'Latest and next matches', items } : null };
}

// Brazil's 2022 presidential runoff, final count from the TSE open-data file Historico_Totalizacao_Presidente_BR_2T_2022.csv.
const BR_2022 = { registered: 156454011, voted: 124252796, lula: 60345999, bolsonaro: 58206354, blank: 1769678, null: 3930765, lead_for_good_at: 68.3 };
function electionStats() {
  const valid = BR_2022.lula + BR_2022.bolsonaro;
  return { kind: 'election', source: 'TSE, Brazil’s election court', link: 'https://dadosabertos.tse.jus.br/dataset/resultados-2022',
    tiles: [{ label: 'Lula, votes', value: BR_2022.lula, unit: 'n', note: `${round((BR_2022.lula / valid) * 100, 2)}% of valid votes` },
      { label: 'Bolsonaro, votes', value: BR_2022.bolsonaro, unit: 'n', note: `${round((BR_2022.bolsonaro / valid) * 100, 2)}% of valid votes` },
      { label: 'Winning margin', value: BR_2022.lula - BR_2022.bolsonaro, unit: 'n', note: 'votes' },
      { label: 'Turnout', value: round((BR_2022.voted / BR_2022.registered) * 100), unit: 'pct', note: `${(BR_2022.voted / 1e6).toFixed(1)}M of ${(BR_2022.registered / 1e6).toFixed(1)}M voters` }],
    split: { label: '2022 runoff, 30 October 2022', a: { name: 'Lula', votes: BR_2022.lula }, b: { name: 'Bolsonaro', votes: BR_2022.bolsonaro } },
    note: `Bolsonaro led the count until ${BR_2022.lead_for_good_at}% of polling stations were in. Lula led from then on.` };
}

const MUSIC = /singer|rapper|musician|band|songwriter|\bdj\b|composer|music group|boy band|girl group|duo|record producer/i;
async function keyStats(fetchImpl, { cat, title, description = '', iso2, parent, election, saved } = {}) {
  try {
    if (election === 'br-2022') return electionStats();
    if (cat === 'country') return await countryStats(fetchImpl, iso2, saved);
    if (cat === 'person') return MUSIC.test(description) ? await musicStats(fetchImpl, String(title).replace(/ \([^)]*\)$/, '')) : null;
    if (cat === 'sport') return (await clubStats(fetchImpl, title)) || (await companyStats(fetchImpl, { title, parent }));
    if (cat === 'brand') return await companyStats(fetchImpl, { title, parent });
  } catch { return null; }
  return null;
}

module.exports = { WB, wbRows, keyStats, countryStats, companyStats, musicStats, clubStats, electionStats, clubName, tickerOf, BR_2022 };
