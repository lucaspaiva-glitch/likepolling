const test = require('node:test');
const assert = require('node:assert/strict');
const { run, aggregate, parseFeed, parseTraffic, creatorNames } = require('../scripts/google-trends-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const noSleep = async () => {};

function feed(items) {
  return `<?xml version="1.0"?><rss><channel>${items.map((i) => `
    <item><title>${i.q}</title><ht:approx_traffic>${i.t}</ht:approx_traffic>
    <pubDate>${i.d || 'Mon, 12 Oct 2026 12:40:00 -0700'}</pubDate>
    ${(i.news || []).map((n) => `<ht:news_item><ht:news_item_title>${n.title}</ht:news_item_title>
      <ht:news_item_url>${n.url}</ht:news_item_url><ht:news_item_source>${n.source}</ht:news_item_source></ht:news_item>`).join('')}
    </item>`).join('')}</channel></rss>`;
}

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

function mockFetch(feeds, calls = []) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes('youtube_active_users')) return res(200, Object.keys(feeds).map((c) => ({ country_code: c })));
    if (u.includes('youtube_trending')) return res(200, [{ channel_title: 'IShowSpeed' }, { channel_title: 'Bad Bunny - Topic' }]);
    if (u.includes('entities')) return res(200, [{ name: 'MrBeast' }]);
    if (u.includes('rpc/replace_google_trending')) return res(200, JSON.parse(init.body).payload.length);
    const code = new URL(u).searchParams.get('geo');
    const f = feeds[code];
    return typeof f === 'number' ? res(f, 'error') : res(200, feed(f));
  };
}

test('parseTraffic reads Google volume buckets', () => {
  assert.equal(parseTraffic('2000+'), 2000);
  assert.equal(parseTraffic('20K+'), 20000);
  assert.equal(parseTraffic('1,000+'), 1000);
  assert.equal(parseTraffic(''), 0);
});

test('parseFeed decodes items and news', () => {
  const [item] = parseFeed(feed([{ q: 'harry &amp; meghan', t: '1000+', news: [{ title: 'A &quot;story&quot;', url: 'https://n.test/a', source: 'CNN' }] }]));
  assert.equal(item.query, 'harry & meghan');
  assert.equal(item.traffic_min, 1000);
  assert.equal(item.published_at, '2026-10-12T19:40:00.000Z');
  assert.deepEqual(item.news, [{ title: 'A "story"', url: 'https://n.test/a', source: 'CNN' }]);
});

test('creatorNames skips Topic and VEVO channels', () => {
  const set = creatorNames(['IShowSpeed', 'Bad Bunny - Topic', 'TaylorSwiftVEVO', 'ab']);
  assert.deepEqual([...set], ['ishowspeed']);
});

test('aggregate merges countries, ranks by volume and flags creators', () => {
  const feeds = [
    { code: 'US', items: parseFeed(feed([{ q: 'diesel fuel', t: '2000+' }, { q: 'IShowSpeed', t: '500+' }])) },
    { code: 'BR', items: parseFeed(feed([{ q: 'ishowspeed', t: '5000+', news: [{ title: 'Speed in Rio', url: 'https://n.test/s', source: 'G1' }] }])) },
    { code: 'GB', items: parseFeed(feed([{ q: 'Some Person', t: '200+', news: [{ title: 'YouTuber Some Person goes viral', url: 'https://n.test/p', source: 'BBC' }] }])) },
  ];
  const rows = aggregate(feeds, creatorNames(['IShowSpeed']));
  assert.deepEqual(rows.map((r) => [r.rank, r.query, r.traffic_min, r.top_country, r.countries, r.is_creator]), [
    [1, 'IShowSpeed', 5000, 'BR', ['BR', 'US'], true],
    [2, 'diesel fuel', 2000, 'US', ['US'], false],
    [3, 'Some Person', 200, 'GB', ['GB'], true],
  ]);
  assert.equal(rows[0].news_url, 'https://n.test/s');
  assert.equal(rows[1].news_url, null);
});

test('run writes one combined snapshot', async () => {
  const calls = [];
  const logs = [];
  const summary = await run(env, {
    fetch: mockFetch({ US: [{ q: 'MrBeast', t: '1000+' }], PT: [{ q: 'benfica', t: '2000+' }] }, calls),
    sleep: noSleep,
    log: (l) => logs.push(l),
  });
  const writes = calls.filter((c) => c.url.includes('rpc/replace_google_trending'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].init.headers.Authorization, 'Bearer secret');
  const payload = JSON.parse(writes[0].init.body).payload;
  assert.deepEqual(payload.map((r) => [r.query, r.is_creator]), [['benfica', false], ['MrBeast', true]]);
  assert.deepEqual(summary, { countries: 2, updated: 2, rows: 2, creators: 1, failed: [] });
  assert.equal(logs.length, 1);
});

test('run retries 429, skips a failing country and still writes', async () => {
  let tries = 0;
  const base = mockFetch({ US: [{ q: 'a', t: '100+' }], JP: 404 });
  const fetchFn = async (url, init) => (String(url).includes('geo=US') && tries++ === 0 ? res(429, 'slow down') : base(url, init));
  const summary = await run(env, { fetch: fetchFn, sleep: noSleep, log: () => {} });
  assert.equal(summary.rows, 1);
  assert.deepEqual(summary.failed, [{ code: 'JP', error: 'HTTP 404' }]);
});

test('run does not write when every feed fails', async () => {
  const calls = [];
  await assert.rejects(run(env, { fetch: mockFetch({ US: 500 }, calls), sleep: noSleep, log: () => {} }), /No trending searches fetched/);
  assert.equal(calls.filter((c) => c.url.includes('rpc/')).length, 0);
});

test('run requires env vars', async () => {
  await assert.rejects(run({}, { fetch: async () => res(200, []) }), /Missing env vars: SUPABASE_URL, SUPABASE_KEY/);
});
