const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../scripts/music-chart-routine');

const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const video = (id, views) => ({ id, snippet: { title: `T ${id}`, channelId: `UC${id}`, channelTitle: `C ${id}`, categoryId: '10', publishedAt: '2026-10-12T10:00:00Z', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } }, statistics: { viewCount: String(views), likeCount: '10' } });

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

test('fetches the Music chart for every tracked country and writes one RPC', async () => {
  let rpcBody;
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, [{ country_code: 'BR' }, { country_code: 'PT' }])],
    ['regionCode=BR', () => json(200, { items: [video('a', 5), video('b', 3)] })],
    ['regionCode=PT', () => json(200, { items: [video('c', 7)] })],
    ['/rpc/replace_youtube_music_chart', (u, init) => { rpcBody = JSON.parse(init.body); return json(200, 3); }],
  ]);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {} });
  assert.equal(s.updated, 2);
  assert.equal(s.rows, 3);
  assert.deepEqual(rpcBody.payload.map((r) => `${r.country_code}${r.rank}:${r.video_id}`).sort(), ['BR1:a', 'BR2:b', 'PT1:c']);
  const br = f.calls.find((c) => c.url.includes('regionCode=BR')).url;
  assert.ok(br.includes('chart=mostPopular') && br.includes('videoCategoryId=10') && br.includes('maxResults=10'));
  assert.equal(f.calls.find((c) => c.url.includes('/rpc/')).init.headers.apikey, 'secret');
});

test('keeps going when a country has no Music chart and stops on quota exhaustion', async () => {
  const countries = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'].map((c) => ({ country_code: c }));
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, countries)],
    ['regionCode=AA', () => json(200, { items: [video('a', 1)] })],
    ['regionCode=BB', () => json(404, { error: { message: 'chart not found', errors: [{ reason: 'videoChartNotFound' }] } })],
    ['googleapis.com', () => json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } })],
    ['/rpc/replace_youtube_music_chart', () => json(200, 1)],
  ]);
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {} });
  assert.equal(s.quotaHit, true);
  assert.equal(s.updated, 1);
  assert.ok(s.failed.some((x) => x.code === 'BB' && x.error === 'chart not found'));
  assert.ok(f.calls.filter((c) => c.url.includes('googleapis.com')).length <= 6);
});

test('fails without writing when nothing could be fetched or env is missing', async () => {
  const f = mockFetch([
    ['/rest/v1/youtube_active_users', () => json(200, [{ country_code: 'BR' }])],
    ['regionCode=BR', () => json(200, { items: [] })],
  ]);
  await assert.rejects(run(env, { fetch: f, sleep: async () => {}, log: () => {} }), /No music chart data fetched/);
  assert.ok(!f.calls.some((c) => c.url.includes('/rpc/')));
  await assert.rejects(run({}, { fetch: f }), /Missing env vars/);
});
