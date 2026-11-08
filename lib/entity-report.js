// Extended Artist and Company reports, built live from open Wikimedia data only:
// English Wikipedia views (this month vs last), views in other languages, how many
// languages have a page, edits this month, and the days the page was in a country's
// daily top 30 (Like Polling's own wiki_top_daily records). Peers are similar pages
// (Wikipedia "morelike" search) unless the buyer picks them. No YouTube or news data.
// The "field" is the narrowest Wikipedia category the subject shares with most of its
// similar pages (e.g. Nike -> Athletic shoe brands), ranked by English Wikipedia views.
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
// Broader than TYPES.words: only used to rank name suggestions and to spot a wrong-type page (Apple -> the fruit).
const FIT = {
  artist: /\b(singer|rapper|musician|band|group|songwriter|DJ|producer|composer|duo|trio|artist|actor|actress|entertainer|performer|idol|vocalist|guitarist|pianist|drummer|YouTuber|influencer|comedian)\b/i,
  company: /\b(company|corporation|brand|manufacturer|retailer|business|conglomerate|airline|bank|multinational|chain|firm|maker|platform|enterprise|group|cooperative|subsidiary|startup|fashion house|label|store|network|service|operator|developer|publisher|franchise|restaurant|carrier|holding|beverage|drink|automaker|clothing|apparel|cosmetics|beer|website|app|marketplace|streaming)\b/i,
};
const FIELD = { min: 10, max: 800, size: 24, top: 10 };
const GENERIC = /births|deaths|establish|Living people|alumni|people from|^People |based in|listed on|Dow Jones|award|winners|recipients|records artists|activists|philanthrop|\d0s|LGBTQ|bisexual|gay |lesbian|feminis|-language|initial public|headquartered|^\d|from |Wikipedia|articles|in the |members of|Fortune|S&P|NASDAQ|FTSE|Stoxx|DAX|Nikkei|family|Multinational|companies of the United States$|^Companies |brands of [A-Z]|artists$/i;
const SAMPLES = { artist: { subject: 'Anitta (singer)', peers: [] }, company: { subject: 'Nike, Inc.', peers: [] } };

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const sum = (a) => a.reduce((t, n) => t + n, 0);
const cleanTitle = (t) => String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

function parseChoice(value) {
  const v = value && typeof value === 'object' ? value : {};
  const subject = cleanTitle(v.subject);
  const peers = [...new Set((Array.isArray(v.peers) ? v.peers : []).map(cleanTitle).filter((p) => p && p !== subject))].slice(0, MAX_PEERS - 1);
  return subject ? { subject, peers, ...(v.confirm === true ? { confirm: true } : {}) } : null;
}

function client(fetchImpl) {
  return async (url) => {
    const go = () => fetchImpl(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    let res = await go();
    if (res.status === 429) { await new Promise((ok) => setTimeout(ok, 1500)); res = await go(); }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  };
}

const api = (params) => `${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params })}`;

async function pages(get, titles) {
  if (!titles.length) return [];
  const j = await get(api({ action: 'query', titles: titles.join('|'), prop: 'description|pageimages|info|pageprops', ppprop: 'disambiguation', piprop: 'thumbnail', pithumbsize: '240' }));
  const q = j?.query || {};
  const map = new Map();
  for (const r of q.normalized || []) map.set(r.from, r.to);
  for (const r of q.redirects || []) map.set(r.from, r.to);
  const final = (t) => { let x = t; for (let i = 0; i < 3 && map.has(x); i++) x = map.get(x); return x; };
  const by = new Map((q.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => [p.title, p]));
  return titles.map((t) => {
    const p = by.get(final(t));
    return p ? { title: p.title, description: p.description || '', image: p.thumbnail?.source || null, languages: 1, link: link(p.title), ...(p.pageprops ? { disambig: true } : {}) } : null;
  });
}

const link = (t) => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

// Pages matching a typed name, the right type first (Wikipedia search; no disambiguation or list pages).
async function options(get, type, name) {
  const j = await get(api({ action: 'query', generator: 'search', gsrsearch: name, gsrlimit: '10', prop: 'description|pageimages|pageprops', ppprop: 'disambiguation', piprop: 'thumbnail', pithumbsize: '120' })).catch(() => null);
  const fit = FIT[type] || /$^/;
  return (j?.query?.pages || []).filter((p) => p.title && !p.missing && !p.pageprops && !/^Lists? of /.test(p.title))
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p, i) => ({ title: p.title, description: p.description || '', image: p.thumbnail?.source || null, link: link(p.title), fit: fit.test(p.description || ''), i }))
    .sort((a, b) => b.fit - a.fit || a.i - b.i).slice(0, 5).map(({ i, ...o }) => o);
}

// The page a typed name most likely means. "Nike" (a "may refer to" page) -> "Nike, Inc."; "Apple" as a company -> "Apple Inc.".
async function resolve(get, type, name) {
  const asked = cleanTitle(name);
  const [p] = await pages(get, [asked]);
  const opts = await options(get, type, asked);
  let page = p && !p.disambig ? p : null;
  if (!page || !(FIT[type] || /$^/).test(page.description)) {
    const alt = opts.find((o) => o.fit && o.title.toLowerCase().startsWith(asked.toLowerCase().replace(/[,.]+$/, '')));
    if (alt) page = { title: alt.title, description: alt.description, image: alt.image, languages: 1, link: alt.link };
  }
  return { page, options: opts.filter((o) => !page || o.title !== page.title).slice(0, 4) };
}

async function resolveSubject(type, name, { fetchImpl = fetch } = {}) {
  if (!TYPES[type]) throw new HttpError(400, 'Unknown report type.');
  return resolve(client(fetchImpl), type, name);
}

const notFound = (name, opts) => Object.assign(new HttpError(404, `We couldn't find "${cleanTitle(name)}" on Wikipedia. Pick it from the suggestions.`), { extra: { options: opts } });

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

async function field(get, title, type) {
  const base = title.replace(/ \([^)]*\)$/, '').replace(/,? (Inc|Ltd|Corp|Corporation|plc|S\.A|AG|SE|Co|Group)\.?$/i, '');
  const s = await get(api({ action: 'query', titles: title, prop: 'categories', clshow: '!hidden', cllimit: 'max' }));
  const cats = (s?.query?.pages?.[0]?.categories || []).map((c) => c.title).filter((c) => !GENERIC.test(c.slice(9)) && !c.includes(base)).slice(0, 50);
  if (!cats.length) return null;
  const nb = ((await get(api({ action: 'query', list: 'search', srsearch: `morelike:${title}`, srlimit: '30', srnamespace: '0', srprop: '' })))?.query?.search || []).map((x) => x.title).filter((t) => t !== title);
  const batches = [];
  for (let i = 0; i < nb.length; i += 10) batches.push(nb.slice(i, i + 10));
  const [info, ...shared] = await Promise.all([get(api({ action: 'query', titles: cats.join('|'), prop: 'categoryinfo' })),
    ...batches.map((b) => get(api({ action: 'query', titles: b.join('|'), prop: 'categories', clshow: '!hidden', cllimit: 'max', clcategories: cats.join('|') })))]);
  const size = new Map((info?.query?.pages || []).map((p) => [p.title, p.categoryinfo?.pages || 0]));
  const hits = new Map();
  for (const j of shared) for (const p of j?.query?.pages || []) for (const c of p.categories || []) hits.set(c.title, (hits.get(c.title) || 0) + 1);
  const best = cats.filter((c) => (hits.get(c) || 0) >= 2 && size.get(c) >= FIELD.min && size.get(c) <= FIELD.max)
    .sort((a, b) => hits.get(b) / Math.sqrt(size.get(b)) - hits.get(a) / Math.sqrt(size.get(a)))[0];
  if (!best) return null;
  const [m, ll] = await Promise.all([get(api({ action: 'query', generator: 'categorymembers', gcmtitle: best, gcmnamespace: '0', gcmlimit: 'max', prop: 'info|description' })),
    get(api({ action: 'query', titles: best, prop: 'langlinks', lllimit: 'max' })).catch(() => null)]);
  const members = (m?.query?.pages || []).filter((p) => p.title === title || (!/^List of|discography|filmography/i.test(p.title) && TYPES[type].words.test(p.description || '')));
  const titles = [title, ...members.filter((p) => p.title !== title).sort((a, b) => (b.length || 0) - (a.length || 0)).slice(0, FIELD.size - 1).map((p) => p.title)];
  const names = Object.fromEntries((ll?.query?.pages?.[0]?.langlinks || []).map((l) => [l.lang, l.title.replace(/^[^:]+:/, '')]));
  return { name: best.slice(9), names, titles, members: Math.max(members.length, titles.length) };
}

async function daily(get, project, title, start, end) {
  const j = await get(`${VIEWS}/${project}/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${ymd(start)}/${ymd(end)}`);
  return (j?.items || []).map((i) => ({ day: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
}

async function edits(get, title, since) {
  const j = await get(api({ action: 'query', titles: title, prop: 'revisions', rvprop: 'timestamp', rvlimit: '500', rvend: since.toISOString() }));
  return (j?.query?.pages?.[0]?.revisions || []).length;
}

// Yearly sales and profit from the company's US SEC filings (EDGAR, public data), found through
// Wikidata's SEC CIK (P5531). Like Polling's saved history (company_financials, filled weekly) comes first;
// the live SEC is the fallback. Companies without SEC filings get null and no section in the report.
const WD = 'https://www.wikidata.org/w/api.php';
const SEC = 'https://data.sec.gov/api/xbrl/companyconcept';
const SALES = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'];
const claims = async (get, q, p) => ((await get(`${WD}?${new URLSearchParams({ action: 'wbgetclaims', entity: q, property: p, format: 'json' })}`))?.claims?.[p] || [])
  .filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);

function yearly(j) {
  const by = new Map();
  for (const x of j?.units?.USD || []) {
    if (x.form !== '10-K' || !x.start || !x.end || x.val == null) continue;
    const d = (Date.parse(x.end) - Date.parse(x.start)) / 864e5;
    if (d < 350 || d > 380) continue;
    const y = Number(x.end.slice(0, 4));
    const o = by.get(y);
    if (!o || x.filed > o.filed) by.set(y, x);
  }
  return new Map([...by].map(([y, x]) => [y, x.val]));
}

async function business(get, title, rest = null) {
  const q = (await get(api({ action: 'query', titles: title, prop: 'pageprops', ppprop: 'wikibase_item' })))?.query?.pages?.[0]?.pageprops?.wikibase_item;
  if (!q) return null;
  const [ciks, lists] = await Promise.all([claims(get, q, 'P5531'), claims(get, q, 'P414').catch(() => [])]);
  const cik = String(ciks[0]?.mainsnak.datavalue.value || '');
  if (!/^\d{1,10}$/.test(cik)) return null;
  const id = cik.padStart(10, '0');
  const saved = rest ? await readAll(rest, `company_financials?select=year,revenue,profit&cik=eq.${Number(cik)}&revenue=not.is.null&order=year.desc`).catch(() => []) : [];
  let years = saved.slice(0, 10).reverse().map((r) => ({ year: Number(r.year), revenue: Number(r.revenue), profit: r.profit == null ? null : Number(r.profit) }));
  if (years.length < 3) {
    const concept = (c) => get(`${SEC}/CIK${id}/us-gaap/${c}.json`).then(yearly).catch(() => new Map());
    const [profit, ...sales] = await Promise.all(['NetIncomeLoss', ...SALES].map(concept));
    years = [...new Set(sales.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b).slice(-10)
      .map((year) => ({ year, revenue: sales.map((m) => m.get(year)).find((v) => v != null), profit: profit.get(year) ?? null }));
  }
  if (years.length < 3) return null;
  const pick = lists.find((l) => l.qualifiers?.P249) || lists[0];
  const ex = pick?.mainsnak.datavalue.value?.id;
  const label = ex ? await get(`${WD}?${new URLSearchParams({ action: 'wbgetentities', ids: ex, props: 'labels', languages: 'en', format: 'json' })}`).catch(() => null) : null;
  return { cik: id, exchange: label?.entities?.[ex]?.labels?.en?.value || null, ticker: pick?.qualifiers?.P249?.[0]?.datavalue?.value || null, years,
    link: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${id}&type=10-K` };
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
  if (!subject || subject.disambig) throw notFound(choice.subject, (await options(w, type, choice.subject)).slice(0, 4));
  const memo = new Map();
  const enDaily = (t) => { if (!memo.has(t)) memo.set(t, daily(w, 'en.wikipedia', t, start, end).catch(() => [])); return memo.get(t); };
  const fieldInfo = await field(w, subject.title, type).catch(() => null);
  let fieldStats = fieldInfo ? (await Promise.all(fieldInfo.titles.map((t) => enDaily(t).then((s) => ({ title: t, ...split(s, cut) }))))).filter((p) => p.views > 0) : [];
  if (fieldStats.length < 5 || !fieldStats.some((p) => p.title === subject.title)) fieldStats = [];
  fieldStats.sort((a, b) => b.views - a.views);
  let peerTitles = choice.peers.length ? choice.peers
    : fieldStats.length ? fieldStats.filter((p) => p.title !== subject.title).slice(0, MAX_PEERS - 1).map((p) => p.title)
      : await similar(w, subject.title, type).catch(() => []);
  const peerInfo = (await pages(w, peerTitles)).filter((p) => p && !p.disambig && p.title !== subject.title);
  const all = [subject, ...peerInfo];
  const [links, series, editCount, biz] = await Promise.all([
    langLinks(w, subject.title).catch(() => []),
    Promise.all(all.map((p) => enDaily(p.title))),
    edits(w, subject.title, cutDate).catch(() => null),
    type === 'company' ? business(w, subject.title, rest).catch(() => null) : null,
  ]);
  const peerLinks = await Promise.all(peerInfo.map((p) => langLinks(w, p.title).then((l) => l.length + 1).catch(() => p.languages)));
  subject.languages = links.length + 1;
  peerInfo.forEach((p, i) => { p.languages = peerLinks[i]; });
  const stats = all.map((p, i) => ({ ...p, ...split(series[i], cut) }));
  const wanted = links.filter((l) => LANGS.includes(l.lang));
  const langViews = await Promise.all(wanted.map((l) => daily(w, `${l.lang}.wikipedia`, l.title, cutDate, end).then((s) => ({ lang: l.lang, title: l.title, views: sum(s.map((d) => d.views)) })).catch(() => null)));
  const languages = [{ lang: 'en', title: subject.title, views: stats[0].views }, ...langViews.filter(Boolean)].filter((l) => l.views > 0).sort((a, b) => b.views - a.views);
  let countries = [], trends = [];
  const term = subject.title.replace(/ \([^)]*\)$/, '').replace(/,? (Inc|Ltd|Corp|Corporation|plc|S\.A|AG|SE|Co|Group)\.?$/i, '').replace(/[,.*()"]/g, ' ').trim();
  if (rest && term.length >= 4) {
    const rows = await readAll(rest, `trends_daily?select=country_code,day,traffic&query=ilike.${encodeURIComponent(`*${term}*`)}&day=gte.${cut}`).catch(() => []);
    const by = new Map();
    for (const r of rows) { const c = by.get(r.country_code) || { country: r.country_code, days: new Set(), traffic: 0 }; c.days.add(r.day); c.traffic += Number(r.traffic) || 0; by.set(r.country_code, c); }
    trends = [...by.values()].map((c) => ({ country: c.country, days: c.days.size, traffic: c.traffic })).sort((a, b) => b.days - a.days || b.traffic - a.traffic);
  }
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
    languages, countries, trends, peers_chosen: choice.peers.length > 0, business: biz,
    field: fieldStats.length ? (() => {
      const total = sum(fieldStats.map((p) => p.views)), before = sum(fieldStats.map((p) => p.previous));
      return { name: fieldInfo.name, names: fieldInfo.names, members: fieldInfo.members, compared: fieldStats.length,
        rank: fieldStats.findIndex((p) => p.title === subject.title) + 1, share_pct: Math.round((stats[0].views / (total || 1)) * 100),
        change_pct: before ? Math.round(((total - before) / before) * 100) : null,
        ranked: fieldStats.slice(0, FIELD.top).map((p) => ({ title: p.title, views: p.views, change_pct: p.change_pct, me: p.title === subject.title })) };
    })() : null,
  };
}

// Free Artist/Company pulse: the last 7 days only, one subject, no peers. Open Wikimedia data plus
// Like Polling's own wiki_top_daily / trends_daily records. No AI, a handful of small requests.
async function buildEntityPulse(type, title, { fetchImpl = fetch, rest = null, now = new Date() } = {}) {
  if (!TYPES[type]) throw new HttpError(400, 'Use ?type=artist or ?type=company.');
  const w = client(fetchImpl);
  const end = new Date(now.getTime() - 2 * 864e5);
  const cutDate = new Date(end.getTime() - 6 * 864e5);
  const start = new Date(cutDate.getTime() - 7 * 864e5);
  const cut = cutDate.toISOString().slice(0, 10);
  const { page: subject, options: others } = await resolve(w, type, title);
  if (!subject) throw notFound(title, others);
  const [series, links] = await Promise.all([daily(w, 'en.wikipedia', subject.title, start, end).catch(() => []), langLinks(w, subject.title).catch(() => [])]);
  const week = split(series, cut);
  const wanted = links.filter((l) => LANGS.includes(l.lang));
  const term = subject.title.replace(/ \([^)]*\)$/, '').replace(/,? (Inc|Ltd|Corp|Corporation|plc|S\.A|AG|SE|Co|Group)\.?$/i, '').replace(/[,.*()"]/g, ' ').trim();
  let countries = [], searches = [];
  if (rest) {
    const pairs = [{ project: 'en.wikipedia', article: subject.title }, ...wanted.map((l) => ({ project: `${l.lang}.wikipedia`, article: l.title }))]
      .map((p) => `and(project.eq.${p.project},article.eq."${p.article.replace(/ /g, '_').replace(/"/g, '')}")`);
    const [wiki, tr] = await Promise.all([
      readAll(rest, `wiki_top_daily?select=country_code,day&rank=lte.30&day=gte.${cut}&or=(${encodeURIComponent(pairs.join(','))})`).catch(() => []),
      term.length >= 4 ? readAll(rest, `trends_daily?select=country_code,day,query,traffic&query=ilike.${encodeURIComponent(`*${term}*`)}&day=gte.${cut}`).catch(() => []) : [],
    ]);
    const by = new Map();
    const add = (c, d, k) => { const x = by.get(c) || { country: c, read: new Set(), searched: new Set() }; x[k].add(d); by.set(c, x); };
    wiki.forEach((r) => add(r.country_code, r.day, 'read'));
    tr.forEach((r) => add(r.country_code, r.day, 'searched'));
    countries = [...by.values()].map((c) => ({ country: c.country, read_days: c.read.size, search_days: c.searched.size }))
      .sort((a, b) => b.read_days + b.search_days - a.read_days - a.search_days).slice(0, 12);
    const q = new Map();
    for (const r of tr) { const k = String(r.query).toLowerCase(); const x = q.get(k) || { query: r.query, traffic: 0 }; x.traffic += Number(r.traffic) || 0; q.set(k, x); }
    searches = [...q.values()].sort((a, b) => b.traffic - a.traffic).slice(0, 6);
  }
  return {
    type, generated_at: now.toISOString(), from: cut, to: end.toISOString().slice(0, 10),
    subject: { title: subject.title, description: subject.description, image: subject.image, link: subject.link, languages: links.length + 1 },
    views: { week: week.views, previous: week.previous, change_pct: week.change_pct, days: week.series },
    countries, searches, options: others,
  };
}

module.exports = { TYPES, SAMPLES, MAX_PEERS, parseChoice, resolveSubject, buildEntityReport, buildEntityPulse, business };
