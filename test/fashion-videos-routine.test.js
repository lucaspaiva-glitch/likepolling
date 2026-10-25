const test = require('node:test');
const assert = require('node:assert/strict');
const { run, FOLLOWS } = require('../scripts/fashion-videos-routine');

const NOW = Date.parse('2026-10-25T12:00:00Z');
const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const ch = (c) => ({ id: `UC${c.repeat(22)}`, handle: `@${c}` });
const channels = { IT: [ch('i')], ES: [ch('e')], FR: [ch('f')], GB: [ch('g')], US: [ch('u')] };
// [video, hours ago, views]
const uploads = { i: [['i1', 10, 10000]], e: [['e1', 10, 5000]], f: [['f1', 10, 20000], ['f2', 20, 100]], g: [['g1', 10, 1000]], u: [['u1', 5, 500]] };

function mockFetch() {
  const calls = [];
  const all = Object.fromEntries(Object.entries(uploads).flatMap(([c, l]) => l.map(([id, h, v]) => [id, { c, h, v }])));
  const fn = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/playlistItems')) {
      const c = new URL(u).searchParams.get('playlistId')[2];
      return json(200, { items: uploads[c].map(([id, h]) => ({ contentDetails: { videoId: id, videoPublishedAt: hoursAgo(h) } })) });
    }
    if (u.includes('/videos')) {
      const ids = new URL(u).searchParams.get('id').split(',');
      return json(200, { items: ids.map((id) => ({ id, snippet: { title: `T ${id}`, channelId: `UC${all[id].c.repeat(22)}`, channelTitle: all[id].c, publishedAt: hoursAgo(all[id].h), liveBroadcastContent: 'none' }, statistics: { viewCount: String(all[id].v) } })) });
    }
    if (u.includes('/rpc/replace_fashion_videos')) return json(200, 12);
    throw new Error(`unexpected ${u}`);
  };
  fn.calls = calls;
  return fn;
}

test('Portugal follows Italy, Spain, France and the UK', () => {
  assert.deepEqual(FOLLOWS.PT, ['IT', 'ES', 'FR', 'GB']);
});

test('ranks each country and gives Portugal the combined ranking of the countries it follows', async () => {
  const f = mockFetch();
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => NOW, channels });
  const rpc = f.calls.find((c) => c.url.includes('/rpc/replace_fashion_videos'));
  const { videos } = JSON.parse(rpc.init.body);
  const pt = videos.filter((v) => v.country_code === 'PT');
  assert.deepEqual(pt.map((v) => [v.video_id, v.rank, v.channel_country]), [['f1', 1, 'FR'], ['i1', 2, 'IT'], ['e1', 3, 'ES'], ['g1', 4, 'GB'], ['f2', 5, 'FR']]);
  assert.deepEqual(videos.filter((v) => v.country_code === 'US').map((v) => v.video_id), ['u1']);
  assert.equal(s.countries, 6);
  assert.equal(s.youtube_units, 6);
  assert.equal(f.calls.filter((c) => c.url.includes('googleapis')).length, 6);
});
