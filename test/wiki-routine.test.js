const test = require('node:test');
const assert = require('node:assert/strict');
const { run, toRows, recentDays, USER_AGENT } = require('../scripts/wiki-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret', DAYS_BACK: '2' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const articles = (n) => Array.from({ length: n }, (_, i) => ({ article: `A${i}`, project: 'pt.wikipedia', views_ceil: 1000 - i, rank: i + 1 }));

test('recentDays lists the days before now, newest first (UTC)', () => {
  assert.deepEqual(recentDays(new Date('2026-03-01T02:00:00Z'), 3), ['2026-02-28', '2026-02-27', '2026-02-26']);
});

test('toRows keeps the top 100 in rank order and drops malformed items', () => {
  const body = { items: [{ articles: [...articles(120).reverse(), { project: 'x' }, null] }] };
  const rows = toRows('PT', '2026-10-27', body);
  assert.equal(rows.length, 100);
  assert.deepEqual(rows[0], { day: '2026-10-27', country_code: 'PT', rank: 1, project: 'pt.wikipedia', article: 'A0', views_ceil: 1000 });
  assert.equal(rows[99].article, 'A99');
  assert.deepEqual(toRows('PT', '2026-10-27', {}), []);
});

test('run skips 404s, retries 429, records failures and writes one batch', async () => {
  const calls = [];
  let tries = 0;
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (url.includes('youtube_active_users')) return json(200, [{ country_code: 'PT' }, { country_code: 'KR' }, { country_code: 'US' }]);
    if (url.includes('/rpc/replace_wiki_top_daily')) return json(200, JSON.parse(init.body).payload.length);
    if (url.includes('/KR/')) return json(404, { title: 'Not found.' });
    if (url.includes('/US/')) return json(400, { detail: 'bad' });
    if (url.includes('/PT/') && tries++ === 0) return json(429, {});
    return json(200, { items: [{ articles: articles(3) }] });
  };
  const s = await run(env, { fetch, sleep: async () => {}, log: () => {}, now: new Date('2026-10-28T06:00:00Z') });
  assert.equal(s.rows, 6);
  assert.deepEqual(s.days, ['2026-10-27', '2026-10-26']);
  assert.equal(s.unpublished, 2);
  assert.equal(s.failed.length, 2);
  assert.ok(s.failed.every((f) => f.cc === 'US'));
  const wiki = calls.find((c) => c.url.includes('wikimedia.org'));
  assert.equal(wiki.init.headers['User-Agent'], USER_AGENT);
  const write = calls.find((c) => c.url.includes('/rpc/'));
  assert.equal(write.init.headers.Authorization, 'Bearer secret');
});

test('run throws without writing when nothing was fetched', async () => {
  let wrote = false;
  const fetch = async (url) => {
    if (url.includes('youtube_active_users')) return json(200, [{ country_code: 'KR' }]);
    if (url.includes('/rpc/')) { wrote = true; return json(200, 0); }
    return json(404, {});
  };
  await assert.rejects(run(env, { fetch, sleep: async () => {}, log: () => {} }), /No Wikipedia data/);
  assert.equal(wrote, false);
});

test('run requires Supabase env vars', async () => {
  await assert.rejects(run({}, { fetch: async () => {} }), /Missing env vars: SUPABASE_URL, SUPABASE_KEY/);
});
