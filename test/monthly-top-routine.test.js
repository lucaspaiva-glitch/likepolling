const test = require('node:test');
const assert = require('node:assert/strict');
const { run, toRows, monthStart, COUNTRIES } = require('../scripts/monthly-top-routine');

const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const now = new Date('2026-10-12T08:23:00Z');
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const video = (id, views, publishedAt = '2026-10-05T10:00:00Z') => ({ id, snippet: { title: `T ${id}`, channelId: `UC${id}`, channelTitle: `C ${id}`, publishedAt, thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } }, statistics: { viewCount: String(views), likeCount: '10' } });
const hits = (...ids) => ({ items: ids.map((videoId) => ({ id: { kind: 'youtube#video', videoId } })) });

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

test('covers 10 countries and starts the period on the 1st of the month (UTC)', () => {
  assert.equal(COUNTRIES.length, 10);
  assert.ok(COUNTRIES.some(([c]) => c === 'PT'));
  assert.equal(monthStart(new Date('2026-10-31T23:59:00Z')).toISOString(), '2026-10-01T00:00:00.000Z');
});

test('keeps the 10 most viewed uploads from this month, highest first', () => {
  const items = Array.from({ length: 14 }, (_, i) => video(`v${i}`, (i + 1) * 100));
  items.push(video('old', 999999, '2026-09-30T23:00:00Z'));
  const rows = toRows('BR', monthStart(now), items);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.rank, r.video_id, r.view_count]), [[1, 'v13', 1400], [2, 'v12', 1300]]);
  assert.ok(!rows.some((r) => r.video_id === 'old'));
  assert.equal(rows[0].period_start, '2026-10-01');
});

test('searches by view count in the country language and writes one RPC', async () => {
  let rpcBody;
  const f = mockFetch([
    ['/search?', (u) => json(200, u.includes('regionCode=BR') ? hits('a', 'b') : hits('c'))],
    ['/videos?', (u) => json(200, { items: u.includes('id=a%2Cb') ? [video('a', 5), video('b', 9)] : [video('c', 3)] })],
    ['/rpc/replace_youtube_monthly_top', (u, init) => { rpcBody = JSON.parse(init.body); return json(200, 3); }],
  ]);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now, countries: [['BR', 'pt'], ['US', 'en']] });
  assert.equal(s.updated, 2);
  assert.equal(s.rows, 3);
  const br = f.calls.find((c) => c.url.includes('/search?') && c.url.includes('regionCode=BR')).url;
  assert.ok(br.includes('order=viewCount') && br.includes('relevanceLanguage=pt') && br.includes('type=video'));
  assert.ok(br.includes(`publishedAfter=${encodeURIComponent('2026-10-01T00:00:00.000Z')}`));
  assert.deepEqual(rpcBody.payload.filter((r) => r.country_code === 'BR').map((r) => r.video_id), ['b', 'a']);
  assert.deepEqual(rpcBody.tracked, ['BR', 'US']);
  assert.equal(f.calls.find((c) => c.url.includes('/rpc/')).init.headers.apikey, 'secret');
});

test('keeps going when one country fails and stops on quota exhaustion', async () => {
  const f = mockFetch([
    ['regionCode=AA', () => json(200, hits('a'))],
    ['regionCode=BB', () => json(400, { error: { message: 'bad region', errors: [{ reason: 'invalidRegionCode' }] } })],
    ['regionCode=', () => json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } })],
    ['/videos?', () => json(200, { items: [video('a', 5)] })],
    ['/rpc/', () => json(200, 1)],
  ]);
  const countries = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'].map((c) => [c, 'en']);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now, countries });
  assert.equal(s.quotaHit, true);
  assert.equal(s.updated, 1);
  assert.ok(s.failed.some((x) => x.code === 'BB' && x.error === 'bad region'));
  assert.ok(f.calls.filter((c) => c.url.includes('/search?')).length <= 4);
});

test('fails without writing when nothing could be fetched or env is missing', async () => {
  const f = mockFetch([['/search?', () => json(200, { items: [] })]]);
  await assert.rejects(run(env, { fetch: f, sleep: async () => {}, log: () => {}, now, countries: [['BR', 'pt']] }), /No monthly data fetched/);
  assert.ok(!f.calls.some((c) => c.url.includes('/rpc/')));
  await assert.rejects(run({}, { fetch: f }), /Missing env vars/);
});
