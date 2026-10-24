const test = require('node:test');
const assert = require('node:assert/strict');
const { run, rankVideos, scoreSubjects, newsUrl } = require('../scripts/education-routine');

const NOW = Date.parse('2026-10-24T12:00:00Z');
const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => body });
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const channels = { BR: [{ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', handle: '@a' }, { id: 'UCbbbbbbbbbbbbbbbbbbbbbb', handle: '@b' }], US: [{ id: 'UCcccccccccccccccccccccc', handle: '@c' }] };
const uploads = { UUaaaaaaaaaaaaaaaaaaaaaa: [['a1', 10], ['a2', 20], ['a3', 30], ['old', 24 * 40]], UUbbbbbbbbbbbbbbbbbbbbbb: [['b1', 5]], UUcccccccccccccccccccccc: [['c1', 2]] };
const stats = { a1: [1000, 'A'], a2: [4000, 'A'], a3: [9000, 'A'], b1: [100, 'B'], c1: [5000, 'C'], old: [100, 'A'] };
const rss = (titles) => `<rss><channel>${titles.map((t, i) => `<item><title>${t} - Src</title><link>https://news.example/${i}</link><source url="x">Src</source><pubDate>Fri, 24 Oct 2026 10:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;

function mockFetch(over = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (over.match && u.includes(over.match)) return over.respond(u);
    if (u.includes('/playlistItems')) {
      const pl = new URL(u).searchParams.get('playlistId');
      return json(200, { items: (uploads[pl] || []).map(([id, h]) => ({ contentDetails: { videoId: id, videoPublishedAt: hoursAgo(h) } })) });
    }
    if (u.includes('/videos')) {
      const ids = new URL(u).searchParams.get('id').split(',');
      const h = Object.fromEntries(Object.values(uploads).flat());
      return json(200, { items: ids.map((id) => ({ id, snippet: { title: `T ${id}`, channelId: `UC${stats[id][1]}`, channelTitle: stats[id][1], publishedAt: hoursAgo(h[id]), liveBroadcastContent: 'none', thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } }, statistics: { viewCount: String(stats[id][0]) } })) });
    }
    if (u.includes('news.google.com')) return json(200, rss(u.includes('gl=BR') ? ['Vestibular abre inscrições', 'Nova vacina'] : ['School funding']));
    if (u.includes('/rpc/replace_education')) return json(200, 9);
    throw new Error(`unexpected ${u}`);
  };
  fn.calls = calls;
  return fn;
}

test('ranks by views per hour with at most 2 videos per channel', () => {
  const v = (id, ch, vph) => ({ video_id: id, channel_id: ch, views_per_hour: vph });
  const r = rankVideos([v('a', 'X', 10), v('b', 'X', 30), v('c', 'X', 20), v('d', 'Y', 5)]);
  assert.deepEqual(r.map((x) => [x.video_id, x.rank]), [['b', 1], ['c', 2], ['d', 3]]);
});

test('subject score counts a video 3x a headline and keeps the first examples', () => {
  const vids = [{ video_id: 'v1', title: 'Fast' }, { video_id: 'v2', title: 'Slow' }];
  const news = [{ title: 'N1', link: 'https://n/1', source: 'S' }, { title: 'N2', link: 'https://n/2' }, { title: 'N3', link: 'https://n/3' }];
  const s = scoreSubjects('BR', vids, ['math', 'other'], news, ['exams_admissions', 'exams_admissions', 'math']);
  assert.deepEqual(s.map((x) => [x.subject, x.score, x.video_count, x.news_count]), [['math', 4, 1, 1], ['exams_admissions', 2, 0, 2]]);
  assert.equal(s[0].example_video_title, 'Fast');
  assert.equal(s[1].example_news_link, 'https://n/1');
});

test('news query uses the country language', () => {
  assert.match(decodeURIComponent(newsUrl('BR')), /educação.*when:1d.*gl=BR/);
  assert.match(decodeURIComponent(newsUrl('JP')), /教育/);
  assert.match(decodeURIComponent(newsUrl('IN')), /education/);
});

test('fetches uploads, fills a thin country from 60 days with 3 per channel, classifies and writes one RPC', async () => {
  const f = mockFetch();
  const seen = [];
  const classify = async (titles) => { seen.push(titles); return titles.map((t) => (/Vestibular/.test(t) ? 'exams_admissions' : /a3|c1/.test(t) ? 'math' : 'other')); };
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, classify, now: () => NOW, channels });
  assert.equal(s.countries, 2);
  assert.equal(s.youtube_units, 4); // 3 playlists + 1 videos batch
  const body = JSON.parse(f.calls.find((c) => c.url.includes('/rpc/')).init.body);
  const br = body.videos.filter((v) => v.country_code === 'BR');
  assert.deepEqual(br.map((v) => v.video_id), ['a3', 'a2', 'a1', 'b1']); // thin: 3 per channel, 'old' (40 days) cut by the cap
  assert.deepEqual(s.filled.sort(), ['BR', 'US']);
  assert.equal(br[0].views_per_hour, 300);
  assert.equal(br[0].subject, 'math');
  assert.ok(!body.videos.some((v) => v.video_id === 'old'));
  const brSub = body.subjects.filter((x) => x.country_code === 'BR');
  assert.deepEqual(brSub.map((x) => x.subject), ['math', 'exams_admissions']);
  assert.equal(brSub[1].example_news_title, 'Vestibular abre inscrições');
  assert.equal(f.calls.find((c) => c.url.includes('/rpc/')).init.headers.apikey, 'secret');
});

test('without Gemini only videos are written; a failed classification keeps that country\'s old subjects', async () => {
  const f = mockFetch();
  await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => NOW, channels });
  let body = JSON.parse(f.calls.find((c) => c.url.includes('/rpc/')).init.body);
  assert.equal(body.subjects.length, 0);
  assert.equal(body.videos.length, 5);
  const g = mockFetch();
  const s = await run(env, { fetch: g, sleep: async () => {}, log: () => {}, now: () => NOW, channels, classify: async () => { throw new Error('402 RESOURCE_EXHAUSTED'); } });
  body = JSON.parse(g.calls.find((c) => c.url.includes('/rpc/')).init.body);
  assert.equal(body.subjects.length, 0);
  assert.equal(s.subjectErrors.length, 2);
});

test('stops on quota exhaustion and fails without writing when nothing was fetched', async () => {
  const f = mockFetch({ match: '/playlistItems', respond: () => json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }) });
  await assert.rejects(run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => NOW, channels }), /No education videos fetched/);
  assert.ok(!f.calls.some((c) => c.url.includes('/rpc/')));
  await assert.rejects(run({}, { fetch: f }), /Missing env vars/);
});

test('classifies in batches of 25 and retries a failed batch once', async () => {
  const many = { US: [{ id: 'UCcccccccccccccccccccccc', handle: '@c' }] };
  const sizes = [];
  let fails = 1;
  const classify = async (titles) => { sizes.push(titles.length); if (titles.length === 25 && fails-- > 0) throw new Error('count mismatch'); return titles.map(() => 'math'); };
  const f = mockFetch({ match: 'news.google.com', respond: () => json(200, rss(Array.from({ length: 30 }, (_, i) => `Story ${i}`))) });
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, classify, now: () => NOW, channels: many });
  assert.deepEqual(sizes, [25, 25, 6]);
  assert.equal(s.subjectErrors.length, 0);
  const body = JSON.parse(f.calls.find((c) => c.url.includes('/rpc/')).init.body);
  assert.equal(body.subjects[0].news_count, 30);
});

test('a country with 5+ videos in 30 days uses only those, 2 per channel', async () => {
  const ids = ['UCdddddddddddddddddddddd', 'UCeeeeeeeeeeeeeeeeeeeeee', 'UCffffffffffffffffffffff'];
  const rich = { JP: ids.map((id, i) => ({ id, handle: `@${i}` })) };
  const ups = { UUdddddddddddddddddddddd: [['d1', 1], ['d2', 2], ['d3', 3]], UUeeeeeeeeeeeeeeeeeeeeee: [['e1', 4], ['e2', 5]], UUffffffffffffffffffffff: [['f1', 6], ['f9', 24 * 45]] };
  const st = { d1: 900, d2: 800, d3: 700, e1: 600, e2: 500, f1: 400, f9: 99999999 };
  const hrs = Object.fromEntries(Object.values(ups).flat());
  const f = mockFetch({ match: 'googleapis', respond: (u) => {
    if (u.includes('/playlistItems')) return json(200, { items: ups[new URL(u).searchParams.get('playlistId')].map(([id, h]) => ({ contentDetails: { videoId: id, videoPublishedAt: hoursAgo(h) } })) });
    return json(200, { items: new URL(u).searchParams.get('id').split(',').map((id) => ({ id, snippet: { title: id, channelId: id[0], channelTitle: id[0], publishedAt: hoursAgo(hrs[id]), liveBroadcastContent: 'none' }, statistics: { viewCount: String(st[id]) } })) });
  } });
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => NOW, channels: rich });
  const body = JSON.parse(f.calls.find((c) => c.url.includes('/rpc/')).init.body);
  assert.deepEqual(body.videos.map((v) => v.video_id), ['d1', 'd2', 'e1', 'e2', 'f1']);
  assert.deepEqual(s.filled, []);
});

test('a failed channel keeps its country\'s previous lists; a deleted channel (404) does not', async () => {
  const f = mockFetch({ match: 'UUbbbbbbbbbbbbbbbbbbbbbb', respond: () => json(500, { error: { message: 'backend error' } }) });
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => NOW, channels });
  let body = JSON.parse(f.calls.find((c) => c.url.includes('/rpc/')).init.body);
  assert.ok(!body.videos.some((v) => v.country_code === 'BR'));
  assert.deepEqual(s.kept_previous, ['BR']);
  const g = mockFetch({ match: 'UUbbbbbbbbbbbbbbbbbbbbbb', respond: () => json(404, { error: { message: 'playlistNotFound' } }) });
  const t = await run(env, { fetch: g, sleep: async () => {}, log: () => {}, now: () => NOW, channels });
  body = JSON.parse(g.calls.find((c) => c.url.includes('/rpc/')).init.body);
  assert.ok(body.videos.some((v) => v.country_code === 'BR'));
  assert.deepEqual(t.kept_previous, []);
});
