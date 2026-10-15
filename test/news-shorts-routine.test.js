const test = require('node:test');
const assert = require('node:assert/strict');
const { run, toRows, seconds, shortKind, SEARCHES } = require('../scripts/news-shorts-routine');

const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const page = (status, location) => ({ status, headers: { get: (h) => (h === 'location' ? location : null) } });
const vid = (id, dur, extra = {}) => ({ id, snippet: { title: `T ${id}`, channelId: `UC${id}`, channelTitle: `C ${id}`, publishedAt: '2026-10-15T10:00:00Z', liveBroadcastContent: 'none' }, contentDetails: { duration: dur }, statistics: { viewCount: '1200' }, status: { embeddable: true, privacyStatus: 'public' }, ...extra });

test('parses ISO 8601 durations', () => {
  assert.equal(seconds('PT45S'), 45);
  assert.equal(seconds('PT2M5S'), 125);
  assert.equal(seconds('PT1H'), 3600);
  assert.equal(seconds('P0D'), 0);
  assert.equal(seconds('bogus'), null);
});

test('keeps search order and drops long, live, unembeddable and private videos', () => {
  const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee', 'fffffffffff'];
  const items = [
    vid('bbbbbbbbbbb', 'PT59S'),
    vid('aaaaaaaaaaa', 'PT10M'),
    vid('ccccccccccc', 'PT30S', { status: { embeddable: false, privacyStatus: 'public' } }),
    vid('ddddddddddd', 'PT30S', { snippet: { title: 'L', channelId: 'UCd', channelTitle: 'D', publishedAt: '2026-10-15T10:00:00Z', liveBroadcastContent: 'live' } }),
    vid('eeeeeeeeeee', 'PT30S', { status: { embeddable: true, privacyStatus: 'unlisted' } }),
    vid('fffffffffff', 'PT2M'),
  ];
  const rows = toRows('en', ids, items);
  assert.deepEqual(rows.map((r) => [r.video_id, r.rank, r.duration_s]), [['bbbbbbbbbbb', 1, 59], ['fffffffffff', 2, 120]]);
  assert.equal(rows[0].view_count, 1200);
  assert.equal(rows[0].channel_title, 'C bbbbbbbbbbb');
});

test('tells real Shorts from regular videos; anything else is unknown', async () => {
  const at = (res) => ({ fetch: async () => (res instanceof Error ? Promise.reject(res) : res) });
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(200))), 'short');
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(303, 'https://www.youtube.com/watch?v=aaaaaaaaaaa'))), 'video');
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(302, 'https://consent.youtube.com/m?continue=x'))), 'unknown');
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(429))), 'unknown');
  assert.equal(await shortKind('aaaaaaaaaaa', at(new Error('net'))), 'unknown');
});

test('searches most viewed recent shorts per country, keeps only real Shorts, one RPC; quota stops further countries', async () => {
  let rpc;
  const regions = [];
  const notShort = new Set(['bbbbbbbbbbb']);
  const f = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === 'www.youtube.com') {
      const id = u.pathname.split('/').pop();
      return notShort.has(id) ? page(303, `https://www.youtube.com/watch?v=${id}`) : page(200);
    }
    if (u.pathname.endsWith('/search')) {
      const r = u.searchParams.get('regionCode');
      regions.push(r);
      assert.equal(u.searchParams.get('order'), 'viewCount');
      assert.equal(u.searchParams.get('videoDuration'), 'short');
      assert.equal(u.searchParams.get('q'), null);
      assert.equal(u.searchParams.get('publishedAfter'), '2026-10-13T12:00:00.000Z');
      if (r === 'PT') return json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } });
      const ids = r === 'US' ? ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'] : ['eeeeeeeeeee'];
      return json(200, { items: ids.map((videoId) => ({ id: { videoId } })) });
    }
    if (u.pathname.endsWith('/videos')) {
      const ids = u.searchParams.get('id').split(',');
      return json(200, { items: ids.map((id) => vid(id, id === 'ccccccccccc' ? 'PT20M' : 'PT40S')) });
    }
    if (u.pathname.endsWith('/rpc/replace_news_shorts')) { rpc = JSON.parse(init.body); return json(200, rpc.payload.length); }
    throw new Error(`unexpected ${u}`);
  };
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => Date.parse('2026-10-15T12:00:00Z') });
  assert.deepEqual(regions, ['US', 'BR', 'PT']);
  assert.equal(s.quotaHit, true);
  assert.deepEqual(s.langs, { en: 2, pt: 1 });
  assert.deepEqual(s.check, { short: 3, video: 1, unknown: 0 });
  assert.equal(s.failed.length, SEARCHES.length - 2);
  assert.deepEqual(rpc.payload.filter((r) => r.lang === 'en').map((r) => [r.video_id, r.rank]), [['aaaaaaaaaaa', 1], ['ddddddddddd', 2]]);
  assert.equal(s.rows, 3);
});
