const test = require('node:test');
const assert = require('node:assert/strict');
const { run, feedUrl, EDITIONS, SEARCH } = require('../scripts/news-world-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const item = (title, source, link) =>
  `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>Thu, 15 Oct 2026 22:06:00 GMT</pubDate><source url="https://s.test">${source}</source></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const text = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const deps = (f) => ({ fetch: f, sleep: async () => {}, log: () => {} });

test('covers the 41 Trending Index countries; editions vs country searches', () => {
  assert.equal(Object.keys(EDITIONS).length, 41);
  assert.equal(feedUrl('US'), 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
  assert.match(feedUrl('EC'), /^https:\/\/news\.google\.com\/rss\/search\?q=Ecuador%20when%3A1d&hl=es-419&gl=EC&ceid=EC:es-419$/);
  assert.deepEqual(Object.keys(SEARCH).sort(), ['DZ', 'EC', 'IQ']);
});

test('keeps Google News order, drops blocked sources and repeats, writes one RPC', async () => {
  let payload;
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_world')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_world')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', image_url: 'https://img.test/1.jpg' }]));
    if (url.includes('/rest/v1/news_wire')) return text(200, '[]');
    if (url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, rss(
      item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`),
      item('A clip', 'YouTube', `https://news.google.com/rss/articles/${cc}-yt`),
      item('Second story', 'Paper', `https://news.google.com/rss/articles/${cc}-2`),
      item('first story', 'Other', `https://news.google.com/rss/articles/${cc}-dup`),
    ));
  };
  const s = await run(env, deps(f));
  assert.equal(s.rows, 82);
  assert.deepEqual(s.failed, []);
  const us = payload.filter((r) => r.country_code === 'US');
  assert.deepEqual(us.map((r) => [r.rank, r.title, r.source]), [[1, 'First story', 'Wire'], [2, 'Second story', 'Paper']]);
  assert.equal(us[0].image_url, 'https://img.test/1.jpg');
  assert.equal(us[1].image_url, null);
});

test('keeps going when a country fails, and fails when none load', async () => {
  let payload;
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    if (url.includes('gl=JP')) return text(403, 'no');
    return text(200, rss(item('Story', 'Wire', `https://news.google.com/rss/articles/${new URL(url).searchParams.get('gl')}`)));
  };
  const s = await run(env, deps(f));
  assert.deepEqual(s.failed, [{ country: 'JP', error: 'HTTP 403' }]);
  assert.ok(!payload.some((r) => r.country_code === 'JP'));
  await assert.rejects(run(env, deps(async () => text(403, 'no'))), /No stories fetched/);
  await assert.rejects(run({}, deps(async () => text(200, ''))), /Missing env vars/);
});

test('translates new headlines once and reuses stored translations', async () => {
  let payload;
  const tr = (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${t}`]));
  const asked = [];
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('title_tr=not.is.null')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', title: 'First story', title_tr: tr('stored') }]));
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, rss(item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`)));
  };
  const s = await run(env, { ...deps(f), translate: async (titles) => { asked.push(...titles); return titles.map(tr); } });
  assert.equal(s.translations.translated, 40);
  assert.equal(asked.length, 40);
  assert.equal(payload.find((r) => r.country_code === 'US').title_tr.ja, 'ja:stored');
  assert.equal(payload.find((r) => r.country_code === 'JP').title_tr.pt, 'pt:First story');
});
