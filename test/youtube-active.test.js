const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, cacheSeconds } = require('../api/youtube-active');

const at = (iso) => Date.parse(iso);

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function mockDb(result) {
  return { from: () => ({ select: () => ({ order: async () => result }) }) };
}

test('cache lasts until the next 00:00/12:00 UTC refresh, capped at 12h', () => {
  assert.equal(cacheSeconds('2026-10-12T12:00:01Z', at('2026-10-12T12:05:00Z')), 11 * 3600 + 55 * 60 + 120);
  assert.equal(cacheSeconds('2026-10-12T12:00:01Z', at('2026-10-12T23:59:00Z')), 180);
  assert.equal(cacheSeconds('2026-10-12T00:00:01Z', at('2026-10-12T00:00:30Z')), 43200);
});

test('a snapshot that missed its slot is only cached briefly', () => {
  assert.equal(cacheSeconds('2026-10-12T00:00:05Z', at('2026-10-12T12:01:00Z')), 120);
  assert.equal(cacheSeconds('2026-10-12T00:00:05Z', at('2026-10-12T12:30:00Z')), 300);
  assert.equal(cacheSeconds(null, at('2026-10-12T12:30:00Z')), 300);
});

test('returns countries sorted by the database with an edge cache header', async () => {
  const rows = [
    { country_code: 'IN', country_name: 'India', online_users_estimate: '9000000', updated_at: '2026-10-12T12:00:00.1Z' },
    { country_code: 'US', country_name: 'United States', online_users_estimate: '4000000', updated_at: '2026-10-12T12:00:00.1Z' },
  ];
  const res = mockRes();
  await createHandler({ env: { SUPABASE_URL: 'x', SUPABASE_KEY: 'y' }, db: mockDb({ data: rows, error: null }), now: () => at('2026-10-12T18:00:00Z') })({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.countries[0], { code: 'IN', name: 'India', active: 9000000 });
  assert.equal(res.body.estimate, true);
  assert.equal(res.body.updated_at, '2026-10-12T12:00:00.1Z');
  assert.match(res.headers['cache-control'], /^public, max-age=60, s-maxage=21720, stale-while-revalidate=600$/);
});

test('database errors are surfaced and never cached', async () => {
  const res = mockRes();
  await createHandler({ env: { SUPABASE_URL: 'x', SUPABASE_KEY: 'y' }, db: mockDb({ data: null, error: { message: 'boom' } }) })({}, res);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /boom/);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('missing env vars return 500', async () => {
  const res = mockRes();
  await createHandler({ env: {} })({}, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /SUPABASE_URL, SUPABASE_KEY/);
});
