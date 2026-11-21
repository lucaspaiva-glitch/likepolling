'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { monthly, span, indexed, coverage } = require('../lib/news-coverage.js');
const { main, query, BRANDS } = require('../scripts/news-coverage-routine.js');

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
  assert.strictEqual(asked[0], 'Nike', 'report subjects first, once');
  assert.ok(!asked.includes('Argentina'), 'saved yesterday: skipped');
  assert.notStrictEqual(asked[asked.length - 1], 'Brazil', 'BR (oldest saved) comes after the missing ones');
  assert.strictEqual(out.saved, asked.length);
  assert.ok(out.left > 0 && posted.length === asked.length);
});

test('routine saves coverage after repeated GDELT rate limits', async () => {
  const now = new Date('2026-11-21T00:00:00Z'), waits = [], posted = [];
  let attempts = 0, t = 0;
  const fetch = async (url, opt = {}) => {
    if (opt.method === 'POST') { posted.push(...JSON.parse(opt.body)); return { ok: true }; }
    if (url.includes('/report_snapshots?')) return { ok: true, json: async () => [{ subjects: 'Nike, Inc.' }] };
    if (url.startsWith('https://x/')) return { ok: true, json: async () => [] };
    assert.strictEqual(new URL(url).searchParams.get('query'), 'Nike');
    if (++attempts < 4) return { ok: false, status: 429, text: async () => 'Please limit requests to one every 5 seconds' };
    return { ok: true, status: 200, text: async () => '{"timeline":[{"data":[{"date":"20261001T000000Z","value":2}]}]}' };
  };
  const out = await main({ SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k' }, now, {
    fetch, sleep: async (ms) => { waits.push(ms); t += ms; }, clock: () => t, budget: 180000
  });
  assert.strictEqual(out.saved, 1);
  assert.strictEqual(out.failed, 0);
  assert.deepStrictEqual(waits, [30000, 60000, 90000, 10000]);
  assert.deepStrictEqual(posted, [{ brand: 'Nike', month: '2026-10-01', share: 2, saved_at: now.toISOString() }]);
});

test('coverage unquotes single words but keeps multi-word phrases and query operators', async () => {
  for (const [input, expected] of [['"Nike"', 'Nike'], ['"Dior"', 'Dior'], ['"Zara" (fashion OR clothing OR Inditex)', 'Zara (fashion OR clothing OR Inditex)'], ['"United States"', '"United States"'], ['"Louis Vuitton"', '"Louis Vuitton"']]) {
    const rows = await coverage(input, undefined, { fetchImpl: async (url) => {
      assert.strictEqual(new URL(url).searchParams.get('query'), expected);
      return { ok: true, status: 200, text: async () => '{"timeline":[{"data":[{"date":"20261001T000000Z","value":2}]}]}' };
    } });
    assert.deepStrictEqual(rows, [{ month: '2026-10-01', share: 2 }]);
  }
  assert.deepStrictEqual(await coverage('Nike', undefined, { fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"timeline":[]}' }) }), []);
});

test('coverage reports HTTP status and a bounded body snippet for non-JSON and HTTP errors', async () => {
  for (const [status, body] of [[200, 'The specified phrase is too short.'], [200, ''], [200, '{invalid json'], [503, 'x'.repeat(200)]]) {
    await assert.rejects(coverage('"Nike"', undefined, { tries: 1, fetchImpl: async () => ({ ok: status === 200, status, text: async () => body }) }), (e) => {
      assert.ok(e.message.includes(`GDELT Nike: HTTP ${status}: ${body.slice(0, 150)}`));
      assert.ok(!e.message.includes('x'.repeat(151)));
      return true;
    });
  }
});

test('coverage backs off at least 30 seconds after a 429 and preserves its diagnostic', async () => {
  const waits = [];
  await assert.rejects(coverage('Nike', undefined, { tries: 3, wait: async (ms) => waits.push(ms), fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'Please limit requests to one every 5 seconds' }) }), /HTTP 429: Please limit requests to one every 5 seconds/);
  assert.deepStrictEqual(waits, [30000, 60000]);
});
