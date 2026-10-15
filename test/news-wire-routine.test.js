const test = require('node:test');
const assert = require('node:assert/strict');
const { run, parseItems, ogImage, FEEDS } = require('../scripts/news-wire-routine');

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
    const hl = new URL(url).searchParams.get('hl');
    const lang = hl === 'pt-PT' ? hl : hl.slice(0, 2);
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
  assert.deepEqual(s.langs, { en: 2, pt: 2, 'pt-PT': 2, es: 2, de: 2, ru: 2, uk: 2, ko: 2, ja: 2 });
  const en = payload.filter((r) => r.lang === 'en').map((r) => `${r.category}:${r.title}`).sort();
  assert.deepEqual(en, ['creators:Creator raises fund', 'creators:Shared story']);
  assert.equal(f.calls.at(-1).init.headers.apikey, 'secret');
});

test('keeps going when a feed fails', async () => {
  let payload;
  const f = mockFetch((url, init) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, '1'); }
    if (url.includes('hl=en-US')) return text(200, rss(item('YouTube news', 'Verge', 'https://n.test/1')));
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

test('adds article preview images and reuses stored ones', async () => {
  let payload;
  const f = mockFetch((url, init) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_wire')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/OLD?oc=5', image_url: 'https://img.test/old.jpg' }]));
    if (url.startsWith('https://news.google.com/rss/articles/NEW')) return text(200, '<c-wiz><div data-n-a-sg="SIG" data-n-a-ts="123"></div>');
    if (url.includes('batchexecute')) {
      const inner = JSON.parse(JSON.parse(decodeURIComponent(init.body.slice(6)))[0][0][1]);
      assert.deepEqual(inner.slice(2), ['NEW', 123, 'SIG']);
      return text(200, ")]}'\n\n" + JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', 'https://pub.test/story', 1])]]));
    }
    if (url === 'https://pub.test/story') return text(200, '<head><meta content="/img/a.jpg?x=1&amp;y=2" property="og:image"></head>');
    if (url === 'https://pub.test/img/a.jpg?x=1&y=2') return new Response('x', { status: 206, headers: { 'content-type': 'image/jpeg' } });
    if (url.includes('hl=en-US')) return text(200, rss(item('New story', 'Pub', 'https://news.google.com/rss/articles/NEW?oc=5'), item('Old story', 'Pub', 'https://news.google.com/rss/articles/OLD?oc=5')));
    return text(404, '');
  });
  const s = await run(env, deps(f));
  assert.deepEqual(Object.fromEntries(payload.map((r) => [r.title, r.image_url])), { 'New story': 'https://pub.test/img/a.jpg?x=1&y=2', 'Old story': 'https://img.test/old.jpg' });
  assert.equal(f.calls.filter((c) => c.url.includes('/articles/OLD')).length, 0);
  assert.deepEqual(s.images, { looked: 1, with_image: 2 });
});

test('ogImage only accepts https images', () => {
  assert.equal(ogImage('<meta property="og:image" content="http://x.test/a.jpg">', 'https://x.test/p'), null);
  assert.equal(ogImage('<meta name="twitter:image" content="https://x.test/b.jpg">', 'https://x.test/p'), 'https://x.test/b.jpg');
});

test('drops preview images that browsers would block', async () => {
  let payload;
  const f = mockFetch((url, init) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_wire')) return text(200, '[]');
    const m = url.match(/rss\/articles\/(A|B|C)/);
    if (m) return text(200, `<div data-n-a-sg="S" data-n-a-ts="1" data-id="${m[1]}"></div>`);
    if (url.includes('batchexecute')) {
      const id = JSON.parse(JSON.parse(decodeURIComponent(init.body.slice(6)))[0][0][1])[2];
      return text(200, ")]}'\n\n" + JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', `https://pub.test/${id}`, 1])]]));
    }
    const p = url.match(/^https:\/\/pub\.test\/(A|B|C)$/);
    if (p) return text(200, `<meta property="og:image" content="https://img.test/${p[1]}.jpg">`);
    if (url === 'https://img.test/A.jpg') return new Response('x', { status: 200, headers: { 'content-type': 'image/jpeg', 'cross-origin-resource-policy': 'same-origin' } });
    if (url === 'https://img.test/B.jpg') return text(404, '');
    if (url === 'https://img.test/C.jpg') return new Response('x', { status: 200, headers: { 'content-type': 'image/webp', 'cross-origin-resource-policy': 'cross-origin' } });
    if (url.includes('hl=en-US')) return text(200, rss(...['A', 'B', 'C'].map((id) => item(`Story ${id}`, 'Pub', `https://news.google.com/rss/articles/${id}?oc=5`))));
    return text(404, '');
  });
  await run(env, deps(f));
  assert.deepEqual(Object.fromEntries(payload.map((r) => [r.title, r.image_url])), { 'Story A': '', 'Story B': '', 'Story C': 'https://img.test/C.jpg' });
});
