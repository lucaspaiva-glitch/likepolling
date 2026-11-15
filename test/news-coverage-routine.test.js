'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { monthly, span, indexed } = require('../lib/news-coverage.js');
const { query, BRANDS } = require('../scripts/news-coverage-routine.js');

test('monthly averages GDELT daily shares per month; span covers the last 3 full years', () => {
  const tl = { timeline: [{ data: [{ date: '20231101T000000Z', value: 1 }, { date: '20231102T000000Z', value: 2 }, { date: '20231201T000000Z', value: 4 }] }] };
  assert.deepStrictEqual(monthly(tl), [{ month: '2023-11-01', share: 1.5 }, { month: '2023-12-01', share: 4 }]);
  assert.deepStrictEqual(monthly({}), []);
  assert.deepStrictEqual(span(new Date('2026-11-15T10:00:00Z')), { start: '20170101000000', end: '20261031235959' });
  assert.strictEqual(query('BR'), '"Brazil"');
  assert.strictEqual(query('US'), '"United States"');
  assert.ok(BRANDS.Chanel && BRANDS['Hermès']);
  assert.deepStrictEqual(indexed([{ month: '2023-11-01', share: '0.5' }, { month: '2023-12-01', share: 2 }]), [{ day: '2023-11-01', value: 25, share: 0.5 }, { day: '2023-12-01', value: 100, share: 2 }]);
  assert.deepStrictEqual(indexed([]), []);
});

test('routine refreshes missing and oldest subjects first, skips fresh ones and stops at the time budget', async () => {
  const { main } = require('../scripts/news-coverage-routine.js');
  const now = new Date('2026-11-15T12:00:00Z'), asked = [], posted = [];
  let t = 0;
  const fetch = async (url, opt = {}) => {
    if (url.includes('news_coverage_monthly?select')) return { ok: true, json: async () => [{ country_code: 'AR', saved_at: '2026-11-14T00:00:00Z' }, { country_code: 'BR', saved_at: '2026-10-01T00:00:00Z' }] };
    if (url.includes('brand_coverage_monthly?select')) return { ok: true, json: async () => [] };
    if (url.includes('report_snapshots')) return { ok: true, json: async () => [{ subjects: 'Nike, Inc.' }, { subjects: 'Nike, Inc.' }] };
    if (opt.method === 'POST') { posted.push(url); return { ok: true }; }
    asked.push(new URL(url).searchParams.get('query'));
    return { ok: true, text: async () => JSON.stringify({ timeline: [{ data: [{ date: '20261001T000000Z', value: 2 }] }] }) };
  };
  const out = await main({ SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k' }, now, { fetch, sleep: async () => {}, clock: () => (t += 1000), budget: 3500 });
  assert.strictEqual(asked[0], '"Nike"', 'report subjects first, once');
  assert.ok(!asked.includes('"Argentina"'), 'saved yesterday: skipped');
  assert.notStrictEqual(asked[asked.length - 1], '"Brazil"', 'BR (oldest saved) comes after the missing ones');
  assert.strictEqual(out.saved, asked.length);
  assert.ok(out.left > 0 && posted.length === asked.length);
});
