// More open data for People and Company reports, all free to reuse:
// - Wikidata (CC0): profile facts, awards and nominations, and social follower counts it records (no YouTube numbers).
// - MusicBrainz (CC0 core data): a musician's releases by year.
// - Google Trends: 30 days of worldwide search interest for the subject and its rivals (unofficial; any failure = no section).
// - Media moments: the biggest daily spikes in Wikipedia views over the last 12 months, each matched to a dated
//   release, award or event from the data above when one falls in the week before.
const WD = 'https://www.wikidata.org/w/api.php';
const MB = 'https://musicbrainz.org/ws/2';
const VIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
const TRENDS = 'https://trends.google.com/trends';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PLATFORMS = { P6552: 'X', P2002: 'X', P2003: 'Instagram', P7085: 'TikTok', P2013: 'Facebook', P3185: 'VK', P11892: 'Threads' };
const PEOPLE = { born: 'P569', from: 'P19', occupation: 'P106', genre: 'P136', label: 'P264', team: 'P54', works: 'P800' };
const COMPANY = { founded: 'P571', founders: 'P112', ceo: 'P169', hq: 'P159', industry: 'P452', employees: 'P1128', owns: 'P1830', subsidiaries: 'P355', part_of: 'P361', exchange: 'P414' };
const MAX = 6;

const live = (c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue;
const day = (t) => (/^\+?(\d{4})-(\d\d)-(\d\d)/.exec(String(t || '')) || []).slice(1).join('-') || null;
const year = (t) => Number((/^\+?(\d{4})/.exec(String(t || '')) || [])[1]) || null;
const qual = (c, p) => c.qualifiers?.[p]?.[0]?.datavalue?.value;
const amount = (v) => Math.round(Number(v?.amount || 0));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function itemOf(get, title) {
  const j = await get(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: title, prop: 'pageprops', ppprop: 'wikibase_item' })}`);
  return j?.query?.pages?.[0]?.pageprops?.wikibase_item || null;
}

async function labels(get, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const j = await get(`${WD}?${new URLSearchParams({ action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'labels', languages: 'en', format: 'json' })}`).catch(() => null);
    for (const [id, e] of Object.entries(j?.entities || {})) if (e.labels?.en?.value) out.set(id, e.labels.en.value);
  }
  return out;
}

// Yearly follower counts per platform (latest count each year). YouTube counts are skipped on purpose.
function followers(claims) {
  const by = new Map();
  for (const c of (claims.P8687 || []).filter(live)) {
    const key = Object.keys(c.qualifiers || {}).find((p) => PLATFORMS[p]);
    const when = day(qual(c, 'P585')?.time);
    const n = amount(c.mainsnak.datavalue.value);
    if (!key || !when || !n) continue;
    const name = PLATFORMS[key], y = Number(when.slice(0, 4));
    const m = by.get(name) || new Map();
    if (!m.has(y) || m.get(y).day < when) m.set(y, { year: y, day: when, followers: n });
    by.set(name, m);
  }
  return [...by].map(([platform, m]) => ({ platform, years: [...m.values()].sort((a, b) => a.year - b.year) }))
    .filter((p) => p.years.length).sort((a, b) => b.years[b.years.length - 1].followers - a.years[a.years.length - 1].followers);
}

// Profile facts, awards, nominations and followers from Wikidata, plus the IDs other sources need.
async function profileOf(get, title, type) {
  const q = await itemOf(get, title);
  if (!q) return null;
  const e = (await get(`${WD}?${new URLSearchParams({ action: 'wbgetentities', ids: q, props: 'claims', format: 'json' })}`))?.entities?.[q];
  const claims = e?.claims || {};
  const list = (p) => (claims[p] || []).filter(live);
  const props = type === 'artist' ? PEOPLE : COMPANY;
  const current = (p) => { const l = list(p); const now = l.filter((c) => !qual(c, 'P582')); return (now.length ? now : l).sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred')); };
  const ids = new Set();
  const pick = {};
  for (const [k, p] of Object.entries(props)) {
    const l = ['ceo', 'team'].includes(k) ? current(p) : list(p);
    const v = l[0]?.mainsnak.datavalue.value;
    if (!v) continue;
    if (v.id) { pick[k] = l.slice(0, k === 'ceo' ? 1 : MAX).map((c) => c.mainsnak.datavalue.value.id).filter(Boolean); pick[k].forEach((id) => ids.add(id)); }
    else if (v.time) pick[k] = { year: year(v.time), day: v.time && /^\+?\d{4}-\d\d-\d\d/.test(v.time) && !/-00/.test(v.time.slice(0, 11)) ? day(v.time) : null };
    else if (v.amount) { const latest = l.slice().sort((a, b) => String(qual(b, 'P585')?.time || '').localeCompare(String(qual(a, 'P585')?.time || '')))[0]; pick[k] = { n: amount(latest.mainsnak.datavalue.value), year: year(qual(latest, 'P585')?.time) }; }
  }
  const honours = (p) => list(p).map((c) => ({ id: c.mainsnak.datavalue.value.id, year: year(qual(c, 'P585')?.time), day: qual(c, 'P585')?.precision >= 11 ? day(qual(c, 'P585').time) : null })).filter((h) => h.id);
  const awards = honours('P166'), noms = honours('P1411');
  const events = list('P793').map((c) => ({ id: c.mainsnak.datavalue.value.id, when: qual(c, 'P585') || qual(c, 'P580') })).filter((x) => x.id && x.when)
    .map((x) => ({ id: x.id, year: year(x.when.time), day: x.when.precision >= 11 ? day(x.when.time) : null }));
  [...awards, ...noms, ...events].forEach((h) => ids.add(h.id));
  const names = await labels(get, [...ids]);
  const nm = (id) => names.get(id) || null;
  const facts = {};
  for (const [k, v] of Object.entries(pick)) facts[k] = Array.isArray(v) ? v.map(nm).filter(Boolean) : v;
  for (const k of Object.keys(facts)) if (Array.isArray(facts[k])) { facts[k] = facts[k].filter((n) => !/^(industry|business|company)$|\/\//i.test(n)); if (!facts[k].length) delete facts[k]; }
  const named = (l) => l.map((h) => ({ name: nm(h.id), year: h.year, day: h.day })).filter((h) => h.name).sort((a, b) => (b.year || 0) - (a.year || 0));
  const site = list('P856')[0]?.mainsnak.datavalue.value;
  const mid = list('P646')[0]?.mainsnak.datavalue.value;
  return { qid: q, topic: /^\/[mg]\/[\w-]+$/.test(mid || '') ? mid : null, facts, awards: named(awards), nominations: named(noms), events: named(events), followers: followers(claims),
    website: /^https?:\/\//.test(site || '') ? site : null, musicbrainz: list('P434')[0]?.mainsnak.datavalue.value || null };
}

// A musician's release groups from MusicBrainz (1 request a second, at most 3 pages).
async function releasesOf(get, mbid, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/.test(mbid || '')) return null;
  const all = [];
  for (let off = 0; off < 300; off += 100) {
    if (off) await sleep(1100);
    const url = `${MB}/release-group?${new URLSearchParams({ artist: mbid, fmt: 'json', limit: '100', offset: String(off) })}`;
    const j = await get(url).catch(() => sleep(2000).then(() => get(url)));
    all.push(...(j?.['release-groups'] || []));
    if (!j || all.length >= (j['release-group-count'] || 0)) break;
  }
  const dated = all.filter((r) => /^\d{4}/.test(r['first-release-date'] || '')).map((r) => ({ title: r.title, type: r['primary-type'] || 'Other', date: r['first-release-date'] }));
  if (!dated.length) return null;
  const types = {};
  for (const r of all) { const t = r['primary-type'] || 'Other'; types[t] = (types[t] || 0) + 1; }
  const thisYear = now.getUTCFullYear(), per = new Map();
  for (const r of dated) { const y = Number(r.date.slice(0, 4)); if (y > thisYear - 10) per.set(y, (per.get(y) || 0) + 1); }
  const newest = dated.sort((a, b) => b.date.localeCompare(a.date));
  return { total: all.length, types, by_year: [...per].map(([y, n]) => ({ year: y, releases: n })).sort((a, b) => a.year - b.year),
    latest: newest.slice(0, 5), recent: newest.filter((r) => /^\d{4}-\d\d-\d\d$/.test(r.date) && Date.parse(r.date) >= now.getTime() - 400 * 864e5) };
}

// Google Trends with its cookie; one retry on 429.
function trends(fetchImpl) {
  let cookie = '';
  const keep = (res) => { const set = typeof res.headers?.getSetCookie === 'function' ? res.headers.getSetCookie() : []; if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; '); };
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
  return async (items) => {
    const ex = await call(`${TRENDS}/api/explore?${new URLSearchParams({ hl: 'en-US', tz: '0', req: JSON.stringify({ comparisonItem: items, category: 0, property: '' }) })}`);
    return { ex, widget: async (w, path) => call(`${TRENDS}/api/widgetdata/${path}?${new URLSearchParams({ hl: 'en-US', tz: '0', req: JSON.stringify(w.request), token: w.token })}`) };
  };
}

// Worldwide Google search interest per day, last 30 days, for up to 4 names (0-100, 100 = the busiest day of any of them).
// Uses each name's Google topic (Wikidata's Freebase ID) when there is one.
async function searchLine(fetchImpl, keep) {
  const list = keep.map((x) => x.n);
  if (!list.length) return null;
  const { ex, widget } = await trends(fetchImpl)(keep.map((x) => ({ keyword: x.t || x.n, geo: '', time: 'today 1-m' })));
  const w = (ex.widgets || []).find((x) => x.id === 'TIMESERIES');
  if (!w) return null;
  const d = await widget(w, 'multiline');
  const rows = (d.default?.timelineData || []).filter((r) => !r.isPartial);
  if (rows.length < 7) return null;
  const days = rows.map((r) => ({ day: new Date(Number(r.time) * 1000).toISOString().slice(0, 10), values: list.map((_, i) => Number(r.value?.[i]) || 0) }));
  const avg = list.map((_, i) => Math.round(days.reduce((t, r) => t + r.values[i], 0) / days.length));
  return avg[0] ? { names: list, days, averages: avg } : null;
}

// Topics first; when Google has no topic data, the plain names (rivals with short names like "On" are left out).
async function searchesOf(fetchImpl, names, topics = []) {
  const all = names.map((n, i) => ({ n, t: topics[i] })).slice(0, 4);
  const withTopics = all.filter((x, i) => i === 0 || x.t);
  if (all[0] && all[0].t) {
    const r = await searchLine(fetchImpl, withTopics).catch(() => null);
    if (r) return r;
  }
  return searchLine(fetchImpl, all.filter((x, i) => i === 0 || x.n.length > 3).map((x) => ({ n: x.n })));
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
async function yearViews(get, project, title, end) {
  const start = new Date(end.getTime() - 364 * 864e5);
  const j = await get(`${VIEWS}/${project}/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${ymd(start)}/${ymd(end)}`);
  return (j?.items || []).map((i) => ({ day: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
}

// The biggest spikes in daily Wikipedia views over 12 months (at least 2× a normal day, 7+ days apart), up to 10.
function moments(series, events = []) {
  if (series.length < 60) return [];
  const sorted = series.map((d) => d.views).sort((a, b) => a - b);
  const normal = sorted[Math.floor(sorted.length / 2)] || 0;
  if (!normal) return [];
  const peaks = series.filter((d, i) => d.views >= 2 * normal && d.views >= 100
    && series.slice(Math.max(0, i - 3), i + 4).every((o) => o.views <= d.views)).sort((a, b) => b.views - a.views);
  const out = [];
  for (const p of peaks) {
    if (out.some((o) => Math.abs(Date.parse(o.day) - Date.parse(p.day)) < 7 * 864e5)) continue;
    out.push(p);
    if (out.length === 10) break;
  }
  return out.map((p) => {
    const t = Date.parse(p.day);
    const near = events.filter((e) => e.day && Date.parse(e.day) <= t + 864e5 && Date.parse(e.day) >= t - 7 * 864e5)
      .sort((a, b) => Math.abs(Date.parse(a.day) - t) - Math.abs(Date.parse(b.day) - t))[0];
    return { day: p.day, views: p.views, times: Math.round((p.views / normal) * 10) / 10, ...(near ? { cause: { kind: near.kind, name: near.name, day: near.day } } : {}) };
  });
}

async function momentsOf(get, title, other, end, events) {
  const [en, alt] = await Promise.all([yearViews(get, 'en.wikipedia', title, end).catch(() => []), other ? yearViews(get, `${other.lang}.wikipedia`, other.title, end).catch(() => []) : []]);
  const by = new Map(en.map((d) => [d.day, d.views]));
  for (const d of alt) by.set(d.day, (by.get(d.day) || 0) + d.views);
  const series = [...by].map(([d, views]) => ({ day: d, views })).sort((a, b) => a.day.localeCompare(b.day));
  return { langs: ['en', ...(alt.length ? [other.lang] : [])], list: moments(series, events) };
}

function eventsFrom(profile, releases) {
  return [
    ...(releases?.recent || []).map((r) => ({ kind: (r.type || 'release').toLowerCase(), name: r.title, day: r.date })),
    ...(profile?.awards || []).map((a) => ({ kind: 'award', name: a.name, day: a.day })),
    ...(profile?.nominations || []).map((a) => ({ kind: 'nomination', name: a.name, day: a.day })),
    ...(profile?.events || []).map((a) => ({ kind: 'event', name: a.name, day: a.day })),
  ].filter((e) => e.day);
}

module.exports = { profileOf, followers, releasesOf, searchesOf, trends, moments, momentsOf, eventsFrom };
