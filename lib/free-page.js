// Free part of a search page (/s?find=Name): who it is and how much it is searched (Google Trends), the countries
// searching most, the latest headlines (Google News) and real numbers from official sources (key-stats). No Wikipedia.
'use strict';
const topic = require('./google-topic');
const { keyStats } = require('./key-stats');
const { MAIN } = require('./countries');

const UA = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';

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

// Shorter name for headlines: "The Coca-Cola Company" -> "Coca-Cola".
const searchName = (name) => name.replace(/^The /, '').replace(/,? (Company|Corporation|Inc\.?|Incorporated|S\.A\.|Ltd\.?|plc|AG|SE|Group|Holdings)$/i, '').trim() || name;

// Google's suggestions for the search box: name and type, typed things first.
async function suggest(fetchImpl, q) {
  const list = await topic.topicsOf(topic.session(fetchImpl), q).catch(() => []);
  return list.sort((a, b) => topic.GENERIC.test(a.type) - topic.GENERIC.test(b.type)).slice(0, 6);
}

async function freePage(fetchImpl, q, { mid = '', countryNames, countryOf = () => null, saved = null, rest = null } = {}) {
  const s = topic.session(fetchImpl);
  const list = await topic.topicsOf(s, q).catch(() => []);
  const t = (mid && (list.find((x) => x.mid === mid) || { mid, title: q, type: '' })) || topic.pickTopic(list);
  if (!t) return null;
  const name = t.title;
  const cat = topic.catOf(t.type, name, countryOf);
  const [att, news, ids] = await Promise.all([
    topic.interest(s, [t.mid]).catch(() => null),
    headlines(fetchImpl, searchName(name)).catch(() => []),
    cat === 'topic' ? null : topic.idsOf(fetchImpl, { mid: t.mid, qid: t.qid }).catch(() => null),
  ]);
  const iso2 = cat === 'country' ? countryOf(name) || (ids && ids.iso2) || null : null;
  const stats = await keyStats(fetchImpl, { cat, title: name, description: t.type, iso2, ids, saved, rest }).catch(() => null);
  const world = (att && att.world) || [];
  const label = (c) => (countryNames ? countryNames(c.code) : c.name) || c.name;
  return {
    title: name, name, mid: t.mid, description: t.type, cat, country: iso2,
    image: (stats && stats.image) || '', website: (ids && ids.website) || null,
    searches: att ? topic.sumUp(att.weeks) : null,
    countries: world.filter((c) => MAIN.includes(c.code)).slice(0, 5).map((c) => ({ code: c.code, name: label(c), value: c.value })),
    world: world.slice(0, 5).map((c) => ({ code: c.code, name: label(c), value: c.value })),
    headlines: news, key_stats: stats,
  };
}

module.exports = { freePage, headlines, suggest, searchName };
