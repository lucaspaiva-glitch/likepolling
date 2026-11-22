// Free part of a search page (/s?find=Name): who it is, Wikipedia attention (last 30 days and last 12 months),
// languages, Google searches in our 14 countries and the latest headlines. Free sources only, no keys.
'use strict';
const entity = require('./entity-report');
const { MAIN } = require('./countries');

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const VIEWS = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
const LANGS = ['es', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'ru', 'uk', 'ar', 'hi', 'id', 'tr', 'pl', 'nl', 'zh'];
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const sum = (a) => a.reduce((t, n) => t + n, 0);

const getJson = (fetchImpl, url) => fetchImpl(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);
const views = (fetchImpl, project, title, gran, start, end) => getJson(fetchImpl, `${VIEWS}/${project}/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/${gran}/${ymd(start)}/${ymd(end)}`)
  .then((j) => (j && j.items ? j.items.map((i) => ({ t: i.timestamp, views: i.views })) : []));

const tag = (raw, name) => {
  const m = raw.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
};
async function headlines(fetchImpl, name) {
  const r = await fetchImpl(`https://news.google.com/rss/search?${new URLSearchParams({ q: `"${name.replace(/"/g, '')}" when:14d`, hl: 'en-US', gl: 'US', ceid: 'US:en' })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!r || !r.ok) return [];
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const source = tag(m[1], 'source');
    let title = tag(m[1], 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const d = Date.parse(tag(m[1], 'pubDate'));
    return { title, source, link: tag(m[1], 'link'), day: Number.isNaN(d) ? null : new Date(d).toISOString().slice(0, 10) };
  }).filter((h) => h.title && /^https:\/\//.test(h.link)).slice(0, 5);
}

async function freePage(fetchImpl, q, { now = new Date(), countryNames } = {}) {
  const s = await getJson(fetchImpl, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/ /g, '_'))}?redirect=true`);
  if (!s || !s.title || s.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return null;
  if (s.type === 'disambiguation') return { disambiguation: true };
  const title = s.titles && s.titles.canonical ? s.titles.canonical.replace(/_/g, ' ') : s.title;
  const end = new Date(now.getTime() - 864e5);
  const start60 = new Date(end.getTime() - 59 * 864e5);
  const mEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const mStart = new Date(Date.UTC(mEnd.getUTCFullYear(), mEnd.getUTCMonth() - 11, 1));
  const name = title.replace(/ \([^)]*\)$/, '');
  const [daily, monthly, links, news, trends] = await Promise.all([
    views(fetchImpl, 'en.wikipedia', title, 'daily', start60, end),
    views(fetchImpl, 'en.wikipedia', title, 'monthly', mStart, mEnd),
    getJson(fetchImpl, `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', titles: title, prop: 'langlinks', lllimit: 'max' })}`)
      .then((j) => (j && j.query && j.query.pages && j.query.pages[0] && j.query.pages[0].langlinks) || []),
    headlines(fetchImpl, name).catch(() => []),
    entity.statesOf(fetchImpl, name, { geos: [''] }).catch(() => null),
  ]);
  const last = daily.slice(-30), prev = daily.slice(0, -30);
  const v30 = sum(last.map((d) => d.views)), p30 = sum(prev.map((d) => d.views));
  const sorted = last.map((d) => d.views).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const peak = last.reduce((b, d) => (!b || d.views > b.views ? d : b), null);
  const other = links.filter((l) => LANGS.includes(l.lang));
  const langViews = await Promise.all(other.map((l) => views(fetchImpl, `${l.lang}.wikipedia`, l.title, 'daily', new Date(end.getTime() - 29 * 864e5), end)
    .then((x) => ({ lang: l.lang, views: sum(x.map((d) => d.views)) }))));
  const langs = [{ lang: 'en', views: v30 }, ...langViews].filter((l) => l.views > 0).sort((a, b) => b.views - a.views);
  const total = sum(langs.map((l) => l.views)) || 1;
  const world = trends && trends[''] ? trends[''] : [];
  const countries = world.filter((c) => MAIN.includes(c.code)).slice(0, 5).map((c) => ({ code: c.code, name: countryNames ? countryNames(c.code) : c.name, value: c.value }));
  return {
    title, name, description: String(s.description || ''), extract: String(s.extract || '').slice(0, 300),
    image: s.thumbnail ? s.thumbnail.source : '', link: s.content_urls && s.content_urls.desktop ? s.content_urls.desktop.page : '',
    views_30d: v30, change_pct: p30 ? Math.round(((v30 - p30) / p30) * 100) : null,
    peak: peak && median ? { day: `${peak.t.slice(0, 4)}-${peak.t.slice(4, 6)}-${peak.t.slice(6, 8)}`, views: peak.views, times: Math.round((peak.views / median) * 10) / 10 } : null,
    months: monthly.map((m) => ({ month: `${m.t.slice(0, 4)}-${m.t.slice(4, 6)}`, views: m.views })),
    languages: links.length + 1,
    top_languages: langs.slice(0, 5).map((l) => ({ lang: l.lang, share: Math.round((l.views / total) * 100) })),
    countries, headlines: news,
  };
}

module.exports = { freePage, headlines };
