const test = require('node:test');
const assert = require('node:assert/strict');
const trends = require('../scripts/trends-routine');
const holidays = require('../scripts/holidays-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => body });
const NOW = new Date('2026-11-06T18:00:00Z');
const quiet = { sleep: async () => {}, log: () => {}, now: NOW };
function fake(route) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (url.includes('youtube_active_users')) return res(200, [{ country_code: 'BR' }, { country_code: 'PT' }]);
    if (url.includes('/rpc/')) return res(200, JSON.parse(init.body).payload.length);
    return route(String(url));
  };
  return { fetch, calls, payload: (fn) => JSON.parse(calls.find((c) => c.url.endsWith(`/rpc/${fn}`)).init.body).payload };
}

const RSS = `<rss><channel><title>Daily Search Trends</title>
<item><title>pouso for&#231;ado &amp; mais</title><ht:approx_traffic>2K+</ht:approx_traffic><pubDate>Fri, 6 Nov 2026 09:00:00 -0800</pubDate>
<ht:news_item><ht:news_item_title>Headline</ht:news_item_title></ht:news_item></item>
<item><title><![CDATA[Flamengo]]></title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>bad</pubDate></item></channel></rss>`;

test('trends: traffic strings become numbers', () => {
  assert.equal(trends.traffic('500+'), 500);
  assert.equal(trends.traffic('2K+'), 2000);
  assert.equal(trends.traffic('1,000+'), 1000);
  assert.equal(trends.traffic('1M+'), 1e6);
  assert.equal(trends.traffic(''), null);
});

test('trends: keeps search, traffic and start time only, one batch upsert', async () => {
  const f = fake((url) => (url.includes('geo=BR') ? res(200, RSS) : res(404, '')));
  const s = await trends.run(env, { ...quiet, fetch: f.fetch });
  const rows = f.payload('upsert_trends_daily');
  assert.equal(s.rows, 2);
  assert.deepEqual(s.empty, ['PT']);
  assert.deepEqual(rows[0], { day: '2026-11-06', country_code: 'BR', query: 'pouso for&#231;ado & mais', traffic: 2000, started_at: '2026-11-06T17:00:00.000Z' });
  assert.equal(rows[1].day, '2026-11-06');
  assert.equal(rows[1].started_at, null);
  assert.ok(!JSON.stringify(rows).includes('Headline'));
});

test('holidays: this year and next, national holidays only', async () => {
  const f = fake((url) => (url.includes('/BR') ? res(200, [{ date: `${url.match(/\/(\d{4})\//)[1]}-12-25`, localName: 'Natal', name: 'Christmas Day', global: true }, { date: '2026-07-09', localName: 'Rev', name: 'Regional', global: false }]) : res(204, null)));
  const s = await holidays.run(env, { ...quiet, fetch: f.fetch });
  assert.deepEqual(s.years, [2026, 2027]);
  assert.equal(s.rows, 2);
  assert.deepEqual(f.payload('replace_holidays').map((h) => h.day).sort(), ['2026-12-25', '2027-12-25']);
});

test('routines throw without writing when nothing was fetched', async () => {
  for (const r of [trends, holidays]) {
    const f = fake(() => res(404, null));
    await assert.rejects(r.run(env, { ...quiet, fetch: f.fetch }));
    assert.ok(!f.calls.some((c) => c.url.includes('/rpc/')));
  }
});
