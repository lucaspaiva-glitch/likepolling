// Extended People and Company reports from Google Trends and official sources, no Wikipedia:
// weekly Google searches over 5 years for the subject and up to 3 similar names (Deezer's related artists or
// Yahoo Finance's similar stocks, or the buyer's picks), the countries and US/Brazil states searching most,
// news coverage (GDELT), trending days (Like Polling's saved Google Trends), SEC sales and profit, share price,
// YouTube views per video, MusicBrainz releases and Open Food Facts products.
'use strict';
const topic = require('./google-topic');
const entity = require('./entity-report');
const extras = require('./entity-extras');
const { keyStats } = require('./key-stats');
const { readAll, HttpError } = require('./report');
const { indexed } = require('./news-coverage');

const DAYS = 30;
const MAX_PEERS = 3;
const BROWSER = 'Mozilla/5.0';
const getJson = (fetchImpl, url, ua = BROWSER) => fetchImpl(url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  .then((r) => (r && r.ok ? r.json() : null)).catch(() => null);
const WANT = { artist: (c) => c === 'person', company: (c) => c === 'brand' || c === 'sport' };
const fits = (type, t) => (WANT[type] || (() => true))(topic.catOf(t.type, t.title));

// The topic a typed name means for this report type, plus up to 4 other suggestions.
async function resolveTopic(fetchImpl, type, name, s = topic.session(fetchImpl)) {
  const list = await topic.topicsOf(s, name).catch(() => []);
  const page = list.find((t) => fits(type, t)) || null;
  return { page: page && { title: page.title, description: page.type, mid: page.mid }, options: list.filter((t) => t !== page).slice(0, 4).map((t) => ({ title: t.title, description: t.type, mid: t.mid })) };
}

// Similar names from the source that knows the field best.
const KIND_STOP = /^(company|brand|inc|corporation|business|group|the|and|of|a|in|manufacturing|multinational|american|public|holding|conglomerate|retail)$/i;
const kindWords = (t) => String(t || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !KIND_STOP.test(w));
// Same field: the Google topic types share a real word ("Fashion brand" and "Clothing brand" do not, "Fashion company" does).
const sameField = (a, b) => { const w = new Set(kindWords(a)); return kindWords(b).some((x) => w.has(x)); };
async function peersOf(fetchImpl, s, type, stats, kind = '') {
  let names = [];
  if (stats && stats.kind === 'music' && stats.deezer_id) {
    const j = await getJson(fetchImpl, `https://api.deezer.com/artist/${stats.deezer_id}/related?limit=8`);
    names = ((j && j.data) || []).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0)).map((a) => a.name);
  } else if (stats && stats.stock && stats.stock.symbol) {
    const j = await getJson(fetchImpl, `https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(stats.stock.symbol)}`);
    const syms = (j?.finance?.result?.[0]?.recommendedSymbols || []).map((r) => r.symbol).slice(0, 5);
    names = (await Promise.all(syms.map((sym) => getJson(fetchImpl, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`)
      .then((c) => c?.chart?.result?.[0]?.meta?.longName || c?.chart?.result?.[0]?.meta?.shortName || null)))).filter(Boolean);
  }
  const out = [];
  for (const n of names) {
    if (out.length >= MAX_PEERS) break;
    const t = (await topic.topicsOf(s, n).catch(() => [])).find((x) => fits(type, x));
    if (t && !out.some((o) => o.mid === t.mid) && (type === 'artist' || !kind || sameField(kind, t.type))) out.push(t);
  }
  return out;
}

async function buildTopicReport(get, type, choice, { fetchImpl = fetch, rest = null, now = new Date() } = {}) {
  if (!entity.TYPES[type]) throw new HttpError(400, 'Unknown report type.');
  const end = new Date(now.getTime() - 864e5);
  const cutDate = new Date(end.getTime() - (DAYS - 1) * 864e5);
  const cut = cutDate.toISOString().slice(0, 10);
  const s = topic.session(fetchImpl);
  const subj = choice.mid ? { mid: choice.mid, title: choice.title || choice.subject, type: choice.kind || '' } : (await resolveTopic(fetchImpl, type, choice.subject, s)).page;
  if (!subj) throw Object.assign(new HttpError(404, `We couldn't find "${choice.subject}". Pick it from the suggestions.`), { extra: { options: (await resolveTopic(fetchImpl, type, choice.subject, s)).options } });
  const subject = { mid: subj.mid, title: subj.title, type: subj.type || subj.description || '' };
  const cat = topic.catOf(subject.type, subject.title);
  const ids = await topic.idsOf(fetchImpl, { mid: subject.mid }).catch(() => null);
  const stats = choice.stats && choice.stats.election ? await keyStats(fetchImpl, choice.stats) : await keyStats(fetchImpl, { cat, title: subject.title, description: subject.type, ids, rest }).catch(() => null);
  const peers = [];
  for (const p of choice.peers || []) {
    const t = typeof p === 'object' && p.mid ? { mid: p.mid, title: p.title, type: p.kind || '' } : (await resolveTopic(fetchImpl, type, p, s)).page;
    if (t && t.mid !== subject.mid) peers.push({ mid: t.mid, title: t.title, type: t.type || t.description || '' });
  }
  const chosen = peers.length > 0;
  if (!chosen) peers.push(...(await peersOf(fetchImpl, s, type, stats, subject.type).catch(() => [])));
  const all = [subject, ...peers];
  const term = subject.title.replace(/,? (Inc|Ltd|Corp|Corporation|plc|S\.A|AG|SE|Co|Group)\.?$/i, '').replace(/^The /, '').replace(/[,.*()"]/g, ' ').trim();
  const others = Promise.all([
    entity.mentionsOf(fetchImpl, subject.title, cutDate, now).catch(() => null),
    rest && term.length >= 4 ? readAll(rest, `trends_daily?select=country_code,day,traffic&query=ilike.${encodeURIComponent(`*${term}*`)}&day=gte.${cut}`).catch(() => []) : [],
    type === 'company' && rest ? entity.youtubeYearly(rest, subject.title, now).catch(() => null) : null,
    ids && ids.musicbrainz ? extras.releasesOf(entity.client(fetchImpl), ids.musicbrainz, now).catch(() => null) : null,
    type === 'company' ? extras.productsOf(fetchImpl, subject.title, subject.type).catch(() => null) : null,
  ]);
  // Google allows few requests at once: the three Trends questions go one after another.
  const five = await topic.interest(s, all.map((p) => p.mid), 'today 5-y').catch(() => ({ weeks: [] }));
  const year = await topic.interest(s, [subject.mid], 'today 12-m').catch(() => ({ weeks: [], world: [] }));
  const states = await entity.statesOf(fetchImpl, subject.mid, { geos: ['US', 'BR'] }).catch(() => null);
  const [mentions, trendRows, youtube, releases, products] = await others;
  const sums = all.map((p, i) => topic.sumUp(five.weeks, i, { months: 60 }) || {});
  const nowTotal = sums.reduce((t, x) => t + (x.now || 0), 0);
  const row = (p, i) => ({ title: p.title, mid: p.mid, description: p.type, ...sums[i], share_pct: nowTotal && all.length > 1 ? Math.round(((sums[i].now || 0) / nowTotal) * 100) : null });
  const by = new Map();
  for (const r of trendRows || []) { const c = by.get(r.country_code) || { country: r.country_code, days: new Set(), traffic: 0 }; c.days.add(r.day); c.traffic += Number(r.traffic) || 0; by.set(r.country_code, c); }
  const trends = [...by.values()].map((c) => ({ country: c.country, days: c.days.size, traffic: c.traffic })).sort((a, b) => b.days - a.days || b.traffic - a.traffic);
  const yr = topic.sumUp(year.weeks) || {};
  return {
    type, generated_at: now.toISOString(), period_days: DAYS, from: cut, to: end.toISOString().slice(0, 10),
    subject: { ...row(subject, 0), image: (stats && stats.image) || '', website: (ids && ids.website) || null, cat, spikes: yr.spikes || sums[0].spikes || [], peak: yr.peak || sums[0].peak || null },
    peers: peers.map((p, i) => row(p, i + 1)), peers_chosen: chosen,
    searches: five.weeks.length ? { names: all.map((p) => p.title), weeks: five.weeks } : null,
    world: (year.world || []).slice(0, 10), states, mentions: entity.talk(mentions), trends, youtube_yearly: youtube,
    releases: releases ? (({ recent, ...r }) => r)(releases) : null, products, business: (stats && stats.business) || null,
    through_time: indexed((mentions && mentions.by_month) || []), key_stats: stats,
  };
}

module.exports = { buildTopicReport, resolveTopic, peersOf, MAX_PEERS };
