const test = require('node:test');
const assert = require('node:assert/strict');
const { run, toRows, seconds, SEARCHES } = require('../scripts/news-shorts-routine');

const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
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

test('searches every language and replaces rows in one RPC; quota stops further searches', async () => {
  let rpc;
  let searches = 0;
  const f = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/search?')) {
      searches++;
      if (searches === 3) return json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } });
      const lang = new URL(u).searchParams.get('relevanceLanguage');
      assert.equal(new URL(u).searchParams.get('videoDuration'), 'short');
      return json(200, { items: [{ id: { videoId: `${lang}aaaaaaaaaa`.slice(0, 11) } }] });
    }
    if (u.includes('/videos?')) return json(200, { items: [vid(new URL(u).searchParams.get('id'), 'PT40S')] });
    if (u.includes('/rpc/replace_news_shorts')) { rpc = JSON.parse(init.body); return json(200, rpc.payload.length); }
    throw new Error(`unexpected ${u}`);
  };
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => Date.parse('2026-10-16T00:00:00Z') });
  assert.equal(searches, 3);
  assert.equal(s.quotaHit, true);
  assert.deepEqual(Object.keys(s.langs), ['en', 'pt']);
  assert.equal(s.failed.length, SEARCHES.length - 2);
  assert.equal(rpc.payload.length, 2);
  assert.equal(s.rows, 2);
});
