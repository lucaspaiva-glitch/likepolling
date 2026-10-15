const test = require('node:test');
const assert = require('node:assert/strict');
const { run, parseItems, FEEDS } = require('../scripts/news-wire-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const NOW = Date.parse('2026-10-15T00:00:00Z');
const item = (title, source, link, date = 'Wed, 14 Oct 2026 22:06:00 GMT') =>
  `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>${date}</pubDate><description>&lt;a href=&quot;x&quot;&gt;</description><source url="https://s.test">${source}</source></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss><channel><title>feed</title>${items.join('')}</channel></rss>`;
const text = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  fn.calls = calls;
  return fn;
}
const deps = (f) => ({ fetch: f, sleep: async () => {}, log: () => {}, now: () => NOW });

test('parseItems decodes entities and strips the source suffix', () => {
  const [it] = parseItems(rss(item('YouTube &amp; creators: &#8216;GIFs&#8217;', '9to5Google', 'https://news.google.com/a')));
  assert.equal(it.title, 'YouTube & creators: \u2018GIFs\u2019');
  assert.equal(it.source, '9to5Google');
  assert.equal(it.link, 'https://news.google.com/a');
  assert.equal(it.published_at, '2026-10-14T22:06:00.000Z');
});

test('fetches every feed, filters spam, dedupes and writes one RPC', async () => {
  let payload;
  const f = mockFetch((url, init) => {
    if (url.includes('/rpc/replace_news_wire')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    const q = decodeURIComponent(new URL(url).searchParams.get('q'));
    const lang = new URL(url).searchParams.get('hl').slice(0, 2);
    if (q.includes('intitle:YouTube')) return text(200, rss(
      item('YouTube adds GIFs', 'Verge', `https://n.test/${lang}/1`),
      item('Shared story', 'WSJ', `https://n.test/${lang}/shared`),
      item('Jogo ao vivo no YouTube', 'Spam', `https://n.test/${lang}/spam`),
      item('A reel', 'Instagram', `https://n.test/${lang}/ig`),
      item('Old news', 'Verge', `https://n.test/${lang}/old`, 'Mon, 05 Oct 2026 10:00:00 GMT'),
    ));
    return text(200, rss(item('Shared story', 'WSJ', `https://n.test/${lang}/shared`), item('Creator raises fund', 'Ankler', `https://n.test/${lang}/2`)));
  });
  const s = await run(env, deps(f));
  assert.equal(f.calls.filter((c) => c.url.startsWith('https://news.google.com/rss/search')).length, FEEDS.length);
  assert.deepEqual(s.langs, { en: 3, pt: 3, es: 3, de: 3, ru: 3, uk: 3, ko: 3, ja: 3 });
  const en = payload.filter((r) => r.lang === 'en').map((r) => `${r.category}:${r.title}`).sort();
  assert.deepEqual(en, ['creators:Creator raises fund', 'youtube:Shared story', 'youtube:YouTube adds GIFs']);
  assert.equal(f.calls.at(-1).init.headers.apikey, 'secret');
});

test('keeps going when a feed fails', async () => {
  let payload;
  const f = mockFetch((url, init) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, '1'); }
    if (url.includes('hl=en-US') && url.includes('intitle')) return text(200, rss(item('YouTube news', 'Verge', 'https://n.test/1')));
    return text(404, '');
  });
  const s = await run(env, deps(f));
  assert.equal(payload.length, 1);
  assert.equal(s.failed.length, FEEDS.length - 1);
});

test('fails without writing when no feed returns articles', async () => {
  const f = mockFetch((url) => (url.includes('/rpc/') ? text(200, '0') : text(503, '')));
  await assert.rejects(run(env, deps(f)), /No news fetched/);
  assert.ok(!f.calls.some((c) => c.url.includes('/rpc/')));
});

test('requires env vars', async () => {
  await assert.rejects(run({}, deps(async () => text(200, ''))), /Missing env vars: SUPABASE_URL, SUPABASE_KEY/);
});
