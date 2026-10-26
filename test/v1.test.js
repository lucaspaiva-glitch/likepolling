const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, parseChannelRef, chartRow } = require('../api/v1');

const NOW = Date.parse('2026-10-20T22:00:00Z');
const env = { SUPABASE_URL: 'https://db.example', SUPABASE_KEY: 'k' };

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
}

// Fake Supabase REST: routes on table name, records every request path.
function mockFetch(tables) {
  const calls = [];
  const fn = async (url) => {
    const path = decodeURIComponent(String(url).replace('https://db.example/rest/v1/', ''));
    calls.push(path);
    const table = path.split('?')[0];
    const rows = typeof tables[table] === 'function' ? tables[table](path) : tables[table] || [];
    return { ok: true, status: 200, json: async () => rows };
  };
  fn.calls = calls;
  return fn;
}

const entity = { id: 'mrbeast', name: 'MrBeast', handles: { youtube: '@MrBeast', youtube_channel_id: 'UCX6OQ3DkcsbYNE6H8uQQuVA', youtube_avatar: 'https://yt3/a.jpg' } };
const metric = (createdAt) => ({
  entity_id: 'mrbeast', primary_volume: 603460424, comment_volume: 376675, created_at: createdAt,
  details: {
    profile: { country: 'US', created: '2012-02-20T00:43:50Z', videoCount: 1008, subscribers: 522000000, views: 143064001077 },
    videos: [{ id: 'a', t: 'Long one', p: '2026-10-01T00:00:00Z', v: 400000000, l: 1, c: 2, d: 1143 }, { id: 'b', t: 'Short one', p: '2026-10-02T00:00:00Z', v: 203460424, l: 1, c: 2, d: 40 }],
  },
});

const run = async (query, deps, headers = {}) => {
  const res = mockRes();
  await createHandler({ env, now: () => NOW, ...deps })({ method: 'GET', query, headers }, res);
  return res;
};

test('parseChannelRef accepts channel IDs and handles only', () => {
  assert.deepEqual(parseChannelRef({ id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' }), { id: 'UCX6OQ3DkcsbYNE6H8uQQuVA' });
  assert.deepEqual(parseChannelRef({ handle: '@MrBeast' }), { handle: 'MrBeast' });
  assert.equal(parseChannelRef({ handle: 'a,b)' }), null);
  assert.equal(parseChannelRef({ id: 'nope' }), null);
});

test('channel: saved data with stored values and stated formulas, edge-cached', async () => {
  const fetch = mockFetch({ entities: [entity], entity_metrics: [metric('2026-10-20T20:00:00Z')] });
  const res = await run({ route: 'channel', handle: '@MrBeast' }, { fetch });
  assert.equal(res.statusCode, 200);
  const b = res.body;
  assert.equal(b.channel.subscribers, 522000000);
  assert.equal(b.metrics.views_30d, 603460424);
  assert.deepEqual(b.metrics.earnings_usd, { low: 1208138, high: 2014242, rpm_low: 2, rpm_high: 3.34 });
  assert.equal(b.metrics.avg_views_per_video, 301730212);
  assert.deepEqual(b.videos.map((v) => v.shorts_length), [false, true]);
  assert.equal(b.stale, false);
  assert.match(res.headers['cache-control'], /s-maxage=600/);
  assert.ok(fetch.calls[0].includes('handles->>youtube.ilike.@MrBeast'));
});

test('channel: stale data is refreshed only when refresh=1 is asked', async () => {
  let refreshed = 0;
  const metricsHandler = (req, res) => { refreshed++; res.status(200).json({ entity: { id: 'mrbeast' }, channel: { id: entity.handles.youtube_channel_id } }); };
  const old = mockFetch({ entities: [entity], entity_metrics: [metric('2026-10-19T00:00:00Z')] });
  const plain = await run({ route: 'channel', id: entity.handles.youtube_channel_id }, { fetch: old, metricsHandler });
  assert.equal(plain.body.stale, true);
  assert.equal(refreshed, 0);
  let n = 0;
  const fresh = mockFetch({ entities: [entity], entity_metrics: () => [metric(n++ ? '2026-10-20T21:59:00Z' : '2026-10-19T00:00:00Z')] });
  const res = await run({ route: 'channel', id: entity.handles.youtube_channel_id, refresh: '1' }, { fetch: fresh, metricsHandler }, { 'x-forwarded-for': '1.1.1.1' });
  assert.equal(refreshed, 1);
  assert.equal(res.body.stale, false);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('channel: unknown channel is a 404 the client can offer to refresh', async () => {
  const res = await run({ route: 'channel', handle: 'nobody' }, { fetch: mockFetch({ entities: [] }) });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.found, false);
  assert.equal(res.body.can_refresh, true);
});

test('channel: refreshes are rate limited per IP', async () => {
  const metricsHandler = (req, res) => res.status(404).json({ error: 'No YouTube channel found' });
  const deps = { fetch: mockFetch({ entities: [] }), metricsHandler };
  let last;
  for (let i = 0; i < 21; i++) last = await run({ route: 'channel', handle: `nobody${i}`, refresh: '1' }, deps, { 'x-forwarded-for': '9.9.9.9' });
  assert.equal(last.statusCode, 429);
});

test('chartRow: speed and like rate come from stored counts', () => {
  const r = chartRow({ rank: 1, video_id: 'v', view_count: 240000, like_count: 12000, published_at: '2026-10-20T00:00:00Z', fetched_at: '2026-10-21T00:00:00Z' });
  assert.equal(r.views_per_hour, 10000);
  assert.equal(r.views_per_day, 240000);
  assert.equal(r.like_rate, 0.05);
});

test('trending: validates the country and flags the fastest video', async () => {
  const rows = [
    { rank: 1, video_id: 'slow', view_count: 1000, published_at: '2026-10-10T00:00:00Z', fetched_at: '2026-10-20T00:00:00Z' },
    { rank: 2, video_id: 'fast', view_count: 900, published_at: '2026-10-19T23:00:00Z', fetched_at: '2026-10-20T00:00:00Z' },
  ];
  const res = await run({ route: 'trending', country: 'br' }, { fetch: mockFetch({ youtube_trending: (p) => (p.includes('select=fetched_at') ? [{ fetched_at: '2026-10-20T00:00:00Z' }] : rows) }) });
  assert.equal(res.body.country, 'BR');
  assert.equal(res.body.fastest_video_id, 'fast');
  assert.equal((await run({ route: 'trending', country: 'XX' }, { fetch: mockFetch({}) })).statusCode, 400);
});

test('worldwide: counts countries per video across pages', async () => {
  const rows = Array.from({ length: 1500 }, (_, i) => ({ country_code: `C${i % 41}`, rank: 1, video_id: i < 30 ? 'gta' : `v${i}`, view_count: 10, published_at: '2026-10-20T00:00:00Z', fetched_at: '2026-10-20T01:00:00Z' }));
  const fetch = mockFetch({ youtube_trending: (p) => { const o = Number(p.match(/offset=(\d+)/)[1]); return rows.slice(o, o + 1000); } });
  const res = await run({ route: 'worldwide' }, { fetch });
  assert.equal(res.body.items[0].video_id, 'gta');
  assert.equal(res.body.items[0].country_count, 30);
  assert.equal(res.body.countries_total, 41);
  assert.equal(fetch.calls.length, 2);
});

test('CORS is limited to likepolling.com and configured extension origins', async () => {
  const fetch = mockFetch({ youtube_trending: [] });
  const site = await run({ route: 'trending', country: 'US' }, { fetch }, { origin: 'https://www.likepolling.com' });
  assert.equal(site.headers['access-control-allow-origin'], 'https://www.likepolling.com');
  const other = await run({ route: 'trending', country: 'US' }, { fetch }, { origin: 'https://evil.example' });
  assert.equal(other.headers['access-control-allow-origin'], undefined);
});

test('education: videos, subjects and the countries that have data', async () => {
  const fetch = mockFetch({
    education_videos: (p) => (p.includes('rank=eq.1') ? [{ country_code: 'BR' }, { country_code: 'US' }]
      : [{ rank: 1, video_id: 'v', title: 'T', channel_id: 'UC1', channel_title: 'C', thumbnail_url: 't', view_count: '900', like_count: null, published_at: '2026-10-24T00:00:00Z', views_per_hour: '75', subject: 'math', fetched_at: '2026-10-24T12:00:00Z' }]),
    education_subjects: [{ rank: 1, subject: 'math', score: 7, video_count: 2, news_count: 1, example_video_id: 'v', example_video_title: 'T', example_news_title: 'N', example_news_link: 'https://n', example_news_source: 'S', fetched_at: '2026-10-24T12:00:01Z' }],
  });
  const res = await run({ route: 'education', country: 'br' }, { fetch });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.countries, ['BR', 'US']);
  assert.equal(res.body.videos[0].views, 900);
  assert.equal(res.body.videos[0].views_per_hour, 75);
  assert.equal(res.body.subjects[0].subject, 'math');
  assert.equal(res.body.subjects[0].fetched_at, undefined);
  assert.equal(res.body.updated_at, '2026-10-24T12:00:01Z');
  assert.match(res.body.formulas.subject_score, /× 3/);
  assert.ok(fetch.calls.some((c) => c.includes('country_code=eq.BR')));
  assert.equal((await run({ route: 'education', country: 'XX' }, { fetch })).statusCode, 400);
});

test('news: headlines per country, fashion only when AI confirmed, separate from videos', async () => {
  const seen = [];
  const fetch = mockFetch({
    news_world: (p) => (seen.push(p), [{ rank: 1, title: 'Notícia', title_tr: null, source: 'RTP', link: 'https://n/1', image_url: '', published_at: '2026-10-25T10:00:00Z', fetched_at: '2026-10-25T11:00:00Z' }]),
    news_fashion: (p) => (seen.push(p), [{ rank: 3, title: 'Moda', title_tr: { en: 'Fashion', fashion: true }, source: 'Vogue', link: 'https://n/2', image_url: 'https://i/2.jpg', published_at: '2026-10-25T09:00:00Z', fetched_at: '2026-10-25T11:00:00Z' }]),
  });
  const res = await run({ route: 'news', country: 'pt' }, { fetch });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.kind, 'news headlines (not videos)');
  assert.deepEqual(res.body.items[0], { rank: 1, title: 'Notícia', title_en: null, source: 'RTP', link: 'https://n/1', image_url: null, published_at: '2026-10-25T10:00:00Z' });
  const f = await run({ route: 'news', country: 'PT', topic: 'fashion' }, { fetch });
  assert.deepEqual([f.body.items[0].rank, f.body.items[0].title_en], [1, 'Fashion']);
  assert.match(seen[1], /title_tr->>fashion=eq\.true/);
  assert.equal((await run({ route: 'news', country: 'PT', topic: 'sports' }, { fetch })).statusCode, 400);
});
