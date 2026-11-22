// Who a search means and how much it is searched, from Google Trends (free, no key): the autocomplete gives the
// topic (Google's ID, name and type), explore gives weekly search interest and the countries searching most.
// Behind the scenes, the topic ID finds the same thing on Wikidata for the IDs other sources need
// (SEC number, stock ticker, MusicBrainz, Deezer, country code). Nothing from Wikipedia.
'use strict';
const TRENDS = 'https://trends.google.com/trends';
const WD = 'https://www.wikidata.org/w/api.php';
const BROWSER = 'Mozilla/5.0';
const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const avg = (a) => (a.length ? a.reduce((t, n) => t + n, 0) / a.length : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const round1 = (v) => Math.round(v * 10) / 10;

// One Google Trends session: a cookie from the explore page, one retry on 429.
function session(fetchImpl) {
  let cookie = '';
  const keep = (res) => { const set = typeof res?.headers?.getSetCookie === 'function' ? res.headers.getSetCookie() : []; if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; '); };
  const start = fetchImpl(`${TRENDS}/explore?geo=US&hl=en-US`, { headers: { 'User-Agent': BROWSER }, signal: AbortSignal.timeout(6000) }).then(keep).catch(() => {});
  const call = async (url, retry = true) => {
    await start;
    const res = await fetchImpl(url, { headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US', ...(cookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(8000) });
    keep(res);
    if (res.status === 429 && retry) { await sleep(1200); return call(url, false); }
    if (!res.ok) throw new Error(`trends ${res.status}`);
    const t = await res.text();
    return JSON.parse(t.slice(t.indexOf('{')));
  };
  const explore = (items) => call(`${TRENDS}/api/explore?${new URLSearchParams({ hl: 'en-US', tz: '0', req: JSON.stringify({ comparisonItem: items, category: 0, property: '' }) })}`);
  const widget = (w, path) => call(`${TRENDS}/api/widgetdata/${path}?${new URLSearchParams({ hl: 'en-US', tz: '0', req: JSON.stringify(w.request), token: w.token })}`);
  return { call, explore, widget, fetchImpl };
}

// Google's topics for a typed name; typos are fixed by Google ("the cola cola company" -> The Coca-Cola Company).
async function topicsOf(s, q) {
  const list = await s.call(`${TRENDS}/api/autocomplete/${encodeURIComponent(String(q).trim().slice(0, 100))}?hl=en-US&tz=0`)
    .then((j) => ((j && j.default && j.default.topics) || []).filter((t) => t.mid && t.title).map((t) => ({ mid: t.mid, title: t.title, type: String(t.type || '') })))
    .catch(() => []);
  if (list.length || !s.fetchImpl) return list;
  const fixed = await spelled(s.fetchImpl, q).catch(() => '');
  const found = fixed && fixed !== String(q).trim().toLowerCase() ? await wikidataTopics(s.fetchImpl, fixed).catch(() => []) : [];
  return found.length ? found : wikidataTopics(s.fetchImpl, q).catch(() => []);
}
// Google's search suggestions fix typos even when Trends is busy ("the cola cola company" -> "the coca cola company").
async function spelled(fetchImpl, q) {
  const res = await fetchImpl(`https://suggestqueries.google.com/complete/search?${new URLSearchParams({ client: 'firefox', hl: 'en', q: String(q).trim().slice(0, 100) })}`, { headers: { 'User-Agent': BROWSER }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) return '';
  const j = await res.json();
  return String((j && j[1] && j[1][0]) || '').toLowerCase();
}
// When Google blocks us (429), Wikidata's search finds the same topics by name: its label, short description and Google ID.
async function wikidataTopics(fetchImpl, q) {
  const get = async (params) => {
    const res = await fetchImpl(`${WD}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`wikidata ${res.status}`);
    return res.json();
  };
  const found = ((await get({ action: 'wbsearchentities', search: String(q).trim().slice(0, 100), language: 'en', uselang: 'en', type: 'item', limit: '10' })).search || []);
  if (!found.length) return [];
  const ents = (await get({ action: 'wbgetentities', ids: found.map((f) => f.id).join('|'), props: 'claims' })).entities || {};
  const midOf = (e) => { const c = e && e.claims && (e.claims.P646 || e.claims.P2671); return c && c[0] && c[0].mainsnak && c[0].mainsnak.datavalue ? c[0].mainsnak.datavalue.value : null; };
  const list = found.map((f) => ({ mid: midOf(ents[f.id]), qid: f.id, title: f.label || '', type: String(f.description || '') })).filter((t) => t.mid && t.title);
  // Places and plain words come after people, brands and clubs ("zara" -> the retailer, not Zaragoza).
  const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const score = (t) => (catOf(t.type, t.title) !== 'topic' ? 2 : 0) + (key(t.title) === key(q) ? 1 : 0);
  return list.map((t, i) => [t, score(t), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([t]) => t);
}
// A typed thing beats a plain "Topic" ("Nike" -> Footwear company, not the Greek goddess search term).
const GENERIC = /^(topic|search term)$/i;
const pickTopic = (list) => list.find((t) => t.type && !GENERIC.test(t.type)) || list[0] || null;

const PERSON = /\b(singer|songwriter|rapper|musician|actor|actress|footballer|soccer player|player|athlete|politician|president|prime minister|minister|chancellor|mayor|governor|senator|congress\w*|businessman|businesswoman|entrepreneur|author|writer|novelist|influencer|youtuber|coach|manager|model|dancer|comedian|presenter|host|journalist|monarch|king|queen|prince|princess|chef|designer|artist|band|group|duo|trio|dj|producer|director|tennis|golfer|boxer|fighter|driver|cyclist|swimmer|gymnast|investor|engineer|scientist|surfer|skater|streamer|composer|pianist|guitarist|drummer|vocalist|idol)\b/i;
const CLUB = /\b(club|team)\b/i;
const BRAND = /\b(company|brand|corporation|manufacturer|retailer|business|airline|bank|chain|maker|platform|conglomerate|store|automaker|car|website|app|software|restaurant|label|network|firm|enterprise|startup|group)\b/i;
const COUNTRY = /^(country|sovereign state|island country|nation)\b|\bcountry in\b/i;
function catOf(type, title = '', countryOf = () => null) {
  if (countryOf(title) || COUNTRY.test(type)) return 'country';
  if (CLUB.test(type) && !PERSON.test(type.replace(/\b(club|team)\b/gi, ''))) return 'sport';
  if (PERSON.test(type)) return 'person';
  if (BRAND.test(type)) return 'brand';
  return 'topic';
}

// Weekly Google search interest (0-100, 100 = the busiest week of any of them) for up to 5 topics, plus the
// countries searching most when there is one topic.
async function interest(s, mids, time = 'today 12-m') {
  const ex = await s.explore(mids.slice(0, 5).map((keyword) => ({ keyword, geo: '', time })));
  const ws = (ex && ex.widgets) || [];
  const ts = ws.find((w) => w.id === 'TIMESERIES');
  const gm = mids.length === 1 ? ws.find((w) => w.id === 'GEO_MAP') : null;
  const [d, g] = await Promise.all([ts ? s.widget(ts, 'multiline') : null, gm ? s.widget(gm, 'comparedgeo').catch(() => null) : null]);
  const weeks = ((d && d.default && d.default.timelineData) || []).filter((r) => !r.isPartial)
    .map((r) => ({ day: new Date(Number(r.time) * 1000).toISOString().slice(0, 10), values: mids.map((_, i) => Number(r.value && r.value[i]) || 0) }));
  const world = ((g && g.default && g.default.geoMapData) || []).filter((x) => x.geoCode && Number(x.value && x.value[0]) > 0)
    .map((x) => ({ code: String(x.geoCode), name: String(x.geoName || ''), value: Number(x.value[0]) })).sort((a, b) => b.value - a.value);
  return { weeks, world };
}

// What a weekly line says: now vs a month and a year before, the busiest week, the spikes, monthly averages.
function sumUp(weeks, i = 0, { months = 12 } = {}) {
  const v = weeks.map((w) => w.values[i]);
  if (v.length < 12 || !v.some((x) => x > 0)) return null;
  const now = avg(v.slice(-4)), before = avg(v.slice(-8, -4)), yearAgo = v.length >= 56 ? avg(v.slice(-56, -52)) : null;
  const year = weeks.slice(-52).map((w) => ({ day: w.day, value: w.values[i] }));
  const med = median(year.map((w) => w.value));
  const peak = year.reduce((m, w) => (!m || w.value > m.value ? w : m), null);
  const spikes = [];
  for (const w of [...year].sort((a, b) => b.value - a.value)) {
    if (!med || w.value < 2 * med || spikes.length >= 6) break;
    if (spikes.every((x) => Math.abs(Date.parse(x.day) - Date.parse(w.day)) >= 21 * 864e5)) spikes.push({ day: w.day, value: w.value, times: round1(w.value / med) });
  }
  const by = new Map();
  for (const w of weeks) { const m = w.day.slice(0, 7); const o = by.get(m) || []; o.push(w.values[i]); by.set(m, o); }
  const monthly = [...by].map(([m, a]) => ({ month: m, value: Math.round(avg(a)) })).slice(-months);
  return { now: Math.round(now), change_pct: before ? Math.round(((now - before) / before) * 100) : null,
    yoy_pct: yearAgo ? Math.round(((now - yearAgo) / yearAgo) * 100) : null,
    peak: peak && peak.value ? { day: peak.day, value: peak.value, times: med ? round1(peak.value / med) : null } : null, spikes, months: monthly };
}

// Wikidata IDs for a Google topic (P646 Freebase ID for /m/, P2671 for /g/), read behind the scenes only.
const wdGet = (fetchImpl, params) => fetchImpl(`${WD}?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  .then((r) => (r && r.ok ? r.json() : null)).catch(() => null);
async function qidOf(fetchImpl, mid) {
  const p = String(mid).startsWith('/g/') ? 'P2671' : 'P646';
  const j = await wdGet(fetchImpl, { action: 'query', list: 'search', srsearch: `haswbstatement:${p}=${mid}`, srlimit: '1' });
  const q = j && j.query && j.query.search && j.query.search[0] && j.query.search[0].title;
  return /^Q\d+$/.test(q || '') ? q : null;
}
async function idsOf(fetchImpl, { mid, qid } = {}) {
  const q = qid || (mid ? await qidOf(fetchImpl, mid) : null);
  if (!q) return null;
  const e = (await wdGet(fetchImpl, { action: 'wbgetentities', ids: q, props: 'claims' }))?.entities?.[q];
  if (!e) return null;
  const cl = (p) => ((e.claims && e.claims[p]) || []).filter((c) => c.rank !== 'deprecated' && c.mainsnak && c.mainsnak.datavalue);
  const str = (p) => { const c = cl(p)[0]; return c ? String(c.mainsnak.datavalue.value) : null; };
  const listings = cl('P414').filter((c) => c.qualifiers && c.qualifiers.P249).map((c) => ({ id: c.mainsnak.datavalue.value.id, ticker: String(c.qualifiers.P249[0].datavalue?.value || '').trim().toUpperCase() }));
  const parent = cl('P749')[0] || null;
  const need = [...new Set([...listings.map((l) => l.id), parent && parent.mainsnak.datavalue.value.id].filter(Boolean))];
  const labels = need.length ? (await wdGet(fetchImpl, { action: 'wbgetentities', ids: need.join('|'), props: 'labels', languages: 'en' }))?.entities || {} : {};
  const label = (id) => labels[id]?.labels?.en?.value || null;
  return { qid: q, cik: str('P5531'), iso2: str('P297'), musicbrainz: str('P434'), deezer: str('P2722'), website: str('P856'),
    listings: listings.map((l) => ({ exchange: label(l.id) || '', ticker: l.ticker })).filter((l) => l.ticker),
    parent: parent ? { qid: parent.mainsnak.datavalue.value.id, name: label(parent.mainsnak.datavalue.value.id) } : null };
}

module.exports = { session, topicsOf, pickTopic, catOf, interest, sumUp, qidOf, idsOf, GENERIC };
