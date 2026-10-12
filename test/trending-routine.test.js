const test = require('node:test');
const assert = require('node:assert/strict');
const { run, toRows } = require('../scripts/trending-routine');

const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const video = (id, views) => ({ id, snippet: { title: `T ${id}`, channelId: `UC${id}`, channelTitle: `C ${id}`, categoryId: '24', publishedAt: '2026-10-12T10:00:00Z', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } }, statistics: { viewCount: String(views), likeCount: '10' } });

function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    for (const [match, handler] of routes) if (u.includes(match)) return handler(u, init, calls);
    throw new Error(`unexpected ${u}`);
  };
  fn.calls = calls;
  return fn;
}

test('maps chart items to ranked rows', () => {
  const rows = toRows('BR', [video('a', 900), { id: 'b', snippet: { title: 'x', channelId: 'UCb', channelTitle: 'B' }, statistics: {} }]);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].view_count, 900);
  assert.equal(rows[0].thumbnail_url, 'https://i.ytimg.com/vi/a/mqdefault.jpg');
  assert.equal(rows[1].rank, 2);
  assert.equal(rows[1].like_count, null);
});

test('fetches every tracked country and replaces the snapshot in one RPC', async () => {
  let rpcBody;
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, [{ country_code: 'BR' }, { country_code: 'US' }])],
    ['regionCode=BR', () => json(200, { items: [video('a', 5)] })],
    ['regionCode=US', () => json(200, { items: [video('b', 7), video('c', 3)] })],
    ['/rpc/replace_youtube_trending', (u, init) => { rpcBody = JSON.parse(init.body); return json(200, 3); }],
  ]);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {} });
  assert.equal(s.updated, 2);
  assert.equal(s.rows, 3);
  assert.equal(rpcBody.payload.length, 3);
  assert.ok(f.calls.some((c) => c.url.includes('chart=mostPopular') && c.url.includes('maxResults=10')));
  assert.equal(f.calls.find((c) => c.url.includes('/rpc/')).init.headers.apikey, 'secret');
});

test('retries rate limits and server errors, keeps going when one country fails', async () => {
  let brAttempts = 0;
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, [{ country_code: 'BR' }, { country_code: 'XX' }])],
    ['regionCode=BR', () => (++brAttempts < 3 ? json(brAttempts === 1 ? 503 : 403, { error: { message: 'slow down', errors: [{ reason: 'rateLimitExceeded' }] } }) : json(200, { items: [video('a', 5)] }))],
    ['regionCode=XX', () => json(400, { error: { message: 'bad region', errors: [{ reason: 'invalidRegionCode' }] } })],
    ['/rpc/replace_youtube_trending', () => json(200, 1)],
  ]);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {} });
  assert.equal(brAttempts, 3);
  assert.deepEqual(s.failed, [{ code: 'XX', error: 'bad region' }]);
  assert.equal(s.updated, 1);
});

test('stops calling YouTube once the daily quota is exhausted', async () => {
  const countries = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'].map((c) => ({ country_code: c }));
  let ytCalls = 0;
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, countries)],
    ['googleapis.com', (u) => { ytCalls++; return u.includes('regionCode=AA') ? json(200, { items: [video('a', 1)] }) : json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }); }],
    ['/rpc/replace_youtube_trending', () => json(200, 1)],
  ]);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {} });
  assert.equal(s.quotaHit, true);
  assert.ok(ytCalls <= 5, `made ${ytCalls} YouTube calls`);
  assert.equal(s.failed.length, 7);
});

test('fails without writing when nothing could be fetched or env is missing', async () => {
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, [{ country_code: 'BR' }])],
    ['regionCode=BR', () => json(400, { error: { message: 'nope', errors: [{ reason: 'badRequest' }] } })],
  ]);
  await assert.rejects(run(env, { fetch: f, sleep: async () => {}, log: () => {} }), /No trending data fetched/);
  assert.ok(!f.calls.some((c) => c.url.includes('/rpc/')));
  await assert.rejects(run({}, { fetch: f }), /Missing env vars/);
});
