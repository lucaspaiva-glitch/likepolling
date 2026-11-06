// Extended Artist and Company reports, built live from open Wikimedia data only:
// English Wikipedia views (this month vs last), views in other languages, how many
// languages have a page, edits this month, and the days the page was in a country's
// daily top 30 (Like Polling's own wiki_top_daily records). Peers are similar pages
// (Wikipedia "morelike" search) unless the buyer picks them. No YouTube or news data.
const { HttpError, readAll } = require('./report');

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const VIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
const DAYS = 30;
const MAX_PEERS = 4;
const LANGS = ['es', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'uk', 'ar', 'hi', 'id', 'tr', 'pl', 'nl', 'zh'];
const TYPES = {
  artist: { label: 'Artist', words: /\b(singer|rapper|musician|band|group|songwriter|DJ|producer|composer|duo|artist|actor|actress|entertainer|performer|idol|vocalist|guitarist|pianist)\b/i },
  company: { label: 'Company', words: /\b(company|corporation|brand|manufacturer|retailer|business|conglomerate|airline|bank|multinational|chain|firm|maker|platform|enterprise|group|cooperative|subsidiary|startup)\b/i },
};
const SAMPLES = { artist: { subject: 'Anitta (singer)', peers: [] }, company: { subject: 'Nike, Inc.', peers: [] } };

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const sum = (a) => a.reduce((t, n) => t + n, 0);
const cleanTitle = (t) => String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

function parseChoice(value) {
  const v = value && typeof value === 'object' ? value : {};
  const subject = cleanTitle(v.subject);
  const peers = [...new Set((Array.isArray(v.peers) ? v.peers : []).map(cleanTitle).filter((p) => p && p !== subject))].slice(0, MAX_PEERS - 1);
  return subject ? { subject, peers } : null;
}

function client(fetchImpl) {
  return async (url) => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  };
}

const api = (params) => `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params })}`;

async function pages(get, titles) {
  if (!titles.length) return [];
  const j = await get(api({ action: 'query', titles: titles.join('|'), prop: 'description|pageimages|info', piprop: 'thumbnail', pithumbsize: '240' }));
  const q = j?.query || {};
  const map = new Map();
  for (const r of q.normalized || []) map.set(r.from, r.to);
  for (const r of q.redirects || []) map.set(r.from, r.to);
  const final = (t) => { let x = t; for (let i = 0; i < 3 && map.has(x); i++) x = map.get(x); return x; };
  const by = new Map((q.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => [p.title, p]));
  return titles.map((t) => {
    const p = by.get(final(t));
    return p ? { title: p.title, description: p.description || '', image: p.thumbnail?.source || null, languages: 1, link: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` } : null;
  });
}

async function langLinks(get, title) {
  const j = await get(api({ action: 'query', titles: title, prop: 'langlinks', lllimit: 'max' }));
  return (j?.query?.pages?.[0]?.langlinks || []).map((l) => ({ lang: l.lang, title: l.title }));
}

async function similar(get, title, type) {
  const j = await get(api({ action: 'query', list: 'search', srsearch: `morelike:${title}`, srlimit: '20', srnamespace: '0', srprop: '' }));
  const titles = (j?.query?.search || []).map((s) => s.title).filter((t) => t !== title && !/^List of|discography|filmography|\(album\)|\(song\)|\(film\)/i.test(t));
  const info = (await pages(get, titles.slice(0, 20))).filter((p) => p && TYPES[type].words.test(p.description)).slice(0, 8);
  const reach = await Promise.all(info.map((p) => langLinks(get, p.title).then((l) => l.length).catch(() => 0)));
  return info.map((p, i) => [p.title, reach[i]]).filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, MAX_PEERS - 1).map(([t]) => t);
}

async function daily(get, project, title, start, end) {
  const j = await get(`${VIEWS}/${project}/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${ymd(start)}/${ymd(end)}`);
  return (j?.items || []).map((i) => ({ day: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
}

async function edits(get, title, since) {
  const j = await get(api({ action: 'query', titles: title, prop: 'revisions', rvprop: 'timestamp', rvlimit: '500', rvend: since.toISOString() }));
  return (j?.query?.pages?.[0]?.revisions || []).length;
}

function split(series, cut) {
  const now = series.filter((d) => d.day >= cut), before = series.filter((d) => d.day < cut);
  const a = sum(now.map((d) => d.views)), b = sum(before.map((d) => d.views));
  return { series: now, views: a, previous: b, change_pct: b ? Math.round(((a - b) / b) * 100) : null };
}

async function buildEntityReport(get, type, choice, { fetchImpl = fetch, rest = null, now = new Date() } = {}) {
  if (!TYPES[type]) throw new HttpError(400, 'Unknown report type.');
  const w = client(fetchImpl);
  const end = new Date(now.getTime() - 864e5);
  const cutDate = new Date(end.getTime() - (DAYS - 1) * 864e5);
  const start = new Date(cutDate.getTime() - DAYS * 864e5);
  const cut = cutDate.toISOString().slice(0, 10);
  const [subject] = await pages(w, [choice.subject]);
  if (!subject) throw new HttpError(404, `We couldn't find "${choice.subject}" on Wikipedia. Pick it from the suggestions.`);
  let peerTitles = choice.peers.length ? choice.peers : await similar(w, subject.title, type).catch(() => []);
  const peerInfo = (await pages(w, peerTitles)).filter((p) => p && p.title !== subject.title);
  const all = [subject, ...peerInfo];
  const [links, series, editCount] = await Promise.all([
    langLinks(w, subject.title).catch(() => []),
    Promise.all(all.map((p) => daily(w, 'en.wikipedia', p.title, start, end).catch(() => []))),
    edits(w, subject.title, cutDate).catch(() => null),
  ]);
  const peerLinks = await Promise.all(peerInfo.map((p) => langLinks(w, p.title).then((l) => l.length + 1).catch(() => p.languages)));
  subject.languages = links.length + 1;
  peerInfo.forEach((p, i) => { p.languages = peerLinks[i]; });
  const stats = all.map((p, i) => ({ ...p, ...split(series[i], cut) }));
  const wanted = links.filter((l) => LANGS.includes(l.lang));
  const langViews = await Promise.all(wanted.map((l) => daily(w, `${l.lang}.wikipedia`, l.title, cutDate, end).then((s) => ({ lang: l.lang, title: l.title, views: sum(s.map((d) => d.views)) })).catch(() => null)));
  const languages = [{ lang: 'en', title: subject.title, views: stats[0].views }, ...langViews.filter(Boolean)].filter((l) => l.views > 0).sort((a, b) => b.views - a.views);
  let countries = [];
  if (rest) {
    const pairs = [{ project: 'en.wikipedia', article: subject.title }, ...wanted.map((l) => ({ project: `${l.lang}.wikipedia`, article: l.title }))]
      .map((p) => `and(project.eq.${p.project},article.eq."${p.article.replace(/ /g, '_').replace(/"/g, '')}")`);
    const rows = await readAll(rest, `wiki_top_daily?select=country_code,day,views_ceil&rank=lte.30&day=gte.${cut}&or=(${encodeURIComponent(pairs.join(','))})&order=day.desc`).catch(() => []);
    const by = new Map();
    for (const r of rows) { const c = by.get(r.country_code) || { country: r.country_code, days: new Set(), views: 0 }; c.days.add(r.day); c.views += Number(r.views_ceil) || 0; by.set(r.country_code, c); }
    countries = [...by.values()].map((c) => ({ country: c.country, days: c.days.size, views: c.views })).sort((a, b) => b.days - a.days || b.views - a.views);
  }
  const ranked = [...stats].sort((a, b) => b.views - a.views);
  const peak = stats[0].series.reduce((m, d) => (!m || d.views > m.views ? d : m), null);
  return {
    type, generated_at: now.toISOString(), period_days: DAYS, from: cut, to: end.toISOString().slice(0, 10),
    subject: { ...stats[0], edits: editCount, rank: ranked.findIndex((p) => p.title === subject.title) + 1, peak },
    peers: stats.slice(1).map(({ series: s, ...p }) => ({ ...p, series: s })),
    languages, countries, peers_chosen: choice.peers.length > 0,
  };
}

module.exports = { TYPES, SAMPLES, MAX_PEERS, parseChoice, buildEntityReport };
