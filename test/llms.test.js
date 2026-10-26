const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/llms');

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_KEY: 'k' };
const TABLES = {
  youtube_active_users: [
    { country_code: 'IE', country_name: 'Ireland', online_users_estimate: 159682, updated_at: '2026-10-25T07:39:00Z' },
    { country_code: 'PT', country_name: 'Portugal', online_users_estimate: 146463, updated_at: '2026-10-25T07:39:00Z' },
  ],
  youtube_trending: [
    { country_code: 'IE', rank: 1, video_id: 'aaaaaaaaaaa', title: 'Big | trailer', channel_title: 'Studio', view_count: 1000, fetched_at: '2026-10-25T07:48:00Z' },
    { country_code: 'PT', rank: 1, video_id: 'aaaaaaaaaaa', title: 'Big | trailer', channel_title: 'Studio', view_count: 1000, fetched_at: '2026-10-25T07:48:00Z' },
  ],
  youtube_music_chart: [],
  news_world: [{ country_code: 'PT', rank: 1, title: 'Notícia <b>', source: 'RTP', link: 'https://example.pt/a' }],
  news_fashion: [{ country_code: 'PT', rank: 4, title: 'Moda', title_tr: { en: 'Fashion', fashion: true }, source: 'Vogue', link: 'https://example.pt/m' }],
  fashion_videos: [{ country_code: 'PT', rank: 1, video_id: 'zzzzzzzzzzz', title: 'Zara AW26', channel_title: 'Zara', channel_country: 'ES', views_per_hour: 1234.4 }],
  education_subjects: [{ country_code: 'IE', rank: 1, subject: 'Biology', video_count: 3, news_count: 1 }],
};

function mockFetch() {
  return async (url) => {
    const table = String(url).replace('https://db.example/rest/v1/', '').split('?')[0];
    return { ok: true, status: 200, json: async () => TABLES[table] || [] };
  };
}
function mockRes() {
  return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, end(b) { this.body = b; } };
}
async function run(format, fetchImpl = mockFetch()) {
  const res = mockRes();
  await createHandler({ env, fetch: fetchImpl })({ query: { format } }, res);
  return res;
}

test('summary lists live estimates and videos trending in several countries', async () => {
  const res = await run('summary');
  assert.equal(res.code, 200);
  assert.match(res.headers['content-type'], /text\/plain/);
  assert.match(res.headers['cache-control'], /s-maxage=900/);
  assert.match(res.body, /\| Ireland \| IE \| 159,682 \|/);
  assert.match(res.body, /Big \\\| trailer.*trending in 2 countries \(IE, PT\)/);
  assert.match(res.body, /llms-full\.txt/);
  assert.doesNotMatch(res.body, /## Ireland \(IE\)/);
});

test('full adds a section per country', async () => {
  const res = await run('full');
  assert.match(res.body, /## Ireland \(IE\)[\s\S]*### Education topics\n\n1\. Biology \(3 videos, 1 news stories\)/);
  assert.match(res.body, /## Portugal \(PT\)[\s\S]*### World News headlines \(news\)\n\n1\. \[Notícia <b>\]\(https:\/\/example\.pt\/a\) – RTP/);
  assert.match(res.body, /### Fashion News headlines\n\n1\. \[Moda\]\(https:\/\/example\.pt\/m\) \(English: Fashion\) – Vogue/);
  assert.match(res.body, /### Fashion Index \(fashion videos\)\n\n1\. \[Zara AW26\]\(https:\/\/www\.youtube\.com\/watch\?v=zzzzzzzzzzz\) – Zara \(ES\) – 1,234 views\/hour/);
});

test('html escapes text and links each country', async () => {
  const res = await run('html');
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /<section id="IE">/);
  assert.match(res.body, /Notícia &lt;b&gt;/);
  assert.doesNotMatch(res.body, /Notícia <b>/);
});

test('database failure returns 502 without caching', async () => {
  const res = await run('summary', async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.equal(res.code, 502);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('summary separates YouTube videos from news headlines', async () => {
  const res = await run('summary');
  assert.match(res.body, /## What each section is[\s\S]*\*\*YouTube Trending videos\*\*: [^\n]*not news[\s\S]*\*\*World News headlines\*\*: [^\n]*trending news/);
  assert.match(res.body, /## YouTube Trending videos in the most countries \(videos, not news\)/);
  assert.match(res.body, /## World News headlines by country \(news, not videos\)\n\n[^\n]*\n\n- Portugal \(PT\): 1\. \[Notícia <b>\]\(https:\/\/example\.pt\/a\) – RTP/);
});

test('brief gives plain-text data for one country and topic', async () => {
  const res = mockRes();
  await createHandler({ env, fetch: mockFetch() })({ query: { format: 'brief', country: 'pt', topic: 'fashion' } }, res);
  assert.equal(res.code, 200);
  assert.match(res.body, /^Like Polling live data for Portugal, as of .* UTC\. Answer using this data:/);
  assert.match(res.body, /Fashion Index for Portugal.*\n1\. Zara AW26 – Zara – 1,234 views\/hour/);
  assert.match(res.body, /Fashion news in Portugal.*\n1\. Moda \(English: Fashion\) – Vogue/);
  assert.doesNotMatch(res.body, /Notícia|likepolling\.com/);
  const world = mockRes();
  await createHandler({ env, fetch: mockFetch() })({ query: { format: 'brief', country: 'PT', topic: 'world' } }, world);
  assert.match(world.body, /Big \| trailer – Studio – trending in 2 countries \(IE, PT\)/);
  assert.match(world.body, /- Portugal: Notícia <b> – RTP/);
  for (const query of [{ country: 'XX', topic: 'all' }, { country: 'PT', topic: 'bogus' }, { country: 'IE', topic: 'music' }]) {
    const r = mockRes();
    await createHandler({ env, fetch: mockFetch() })({ query: { format: 'brief', ...query } }, r);
    assert.equal(r.code, 404);
    assert.equal(r.headers['cache-control'], 'no-store');
  }
});
