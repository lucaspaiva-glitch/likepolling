const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/visit');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
function mockRes() {
  const res = { statusCode: 0, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
let ipSeq = 0;
const req = (body, headers = {}, method = 'POST') => ({ method, body, headers: { 'x-forwarded-for': `10.1.0.${++ipSeq}`, ...headers } });

test('counts a visit or buy click with the visitor country and nothing personal', async () => {
  const calls = [];
  const handler = createHandler({ env, fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; } });
  const res = mockRes();
  await handler(req({ kind: 'visit', item: 'pulse' }, { 'x-vercel-ip-country': 'br' }), res);
  await handler(req(JSON.stringify({ kind: 'buy', item: 'country' })), mockRes());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { country: 'BR' });
  assert.equal(calls[0].url, 'https://db.test/rest/v1/rpc/bump_interest');
  assert.deepEqual(calls[0].body, { p_country: 'BR', p_kind: 'visit', p_item: 'pulse' });
  assert.deepEqual(calls[1].body, { p_country: 'XX', p_kind: 'buy', p_item: 'country' });
});

test('rejects unknown pages, products and non-POST without calling Supabase', async () => {
  let called = false;
  const handler = createHandler({ env, fetch: async () => { called = true; } });
  for (const [r, code] of [[req({ kind: 'visit', item: 'admin' }), 400], [req({ kind: 'buy', item: 'pulse' }), 400], [req({ kind: 'x', item: 'home' }), 400], [req('{bad'), 400], [req({ kind: 'visit', item: 'home' }, {}, 'GET'), 405]]) {
    const res = mockRes();
    await handler(r, res);
    assert.equal(res.statusCode, code);
  }
  assert.equal(called, false);
});

test('a failed save returns 502', async () => {
  const handler = createHandler({ env, fetch: async () => ({ ok: false, status: 500 }) });
  const res = mockRes();
  await handler(req({ kind: 'visit', item: 'home' }), res);
  assert.equal(res.statusCode, 502);
});
