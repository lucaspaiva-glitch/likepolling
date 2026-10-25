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
  assert.match(res.body, /## Portugal \(PT\)[\s\S]*### Top news\n\n1\. \[Notícia <b>\]\(https:\/\/example\.pt\/a\) – RTP/);
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
