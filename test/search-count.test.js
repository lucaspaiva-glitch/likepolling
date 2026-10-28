const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, allowed } = require('../api/search-count');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const ID = 'UC' + 'a'.repeat(22);
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
let ipSeq = 0;
const req = (body, headers = {}, method = 'POST') => ({ method, body, headers: { 'x-forwarded-for': `10.0.0.${++ipSeq}`, ...headers } });

test('counts a lookup with the visitor country and nothing personal', async () => {
  let call;
  const handler = createHandler({ env, fetch: async (url, init) => { call = { url, init }; return { ok: true, status: 200 }; } });
  const res = mockRes();
  await handler(req({ channel_id: ID }, { 'x-vercel-ip-country': 'pt' }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(call.url, 'https://db.test/rest/v1/rpc/bump_search_count');
  assert.deepEqual(JSON.parse(call.init.body), { p_country: 'PT', p_channel: ID });
});

test('uses XX when the country header is missing, and accepts a string body', async () => {
  let sent;
  const handler = createHandler({ env, fetch: async (url, init) => { sent = JSON.parse(init.body); return { ok: true, status: 200 }; } });
  await handler(req(JSON.stringify({ channel_id: ID })), mockRes());
  assert.equal(sent.p_country, 'XX');
});

test('rejects bad input and non-POST without calling Supabase', async () => {
  let called = false;
  const handler = createHandler({ env, fetch: async () => { called = true; } });
  for (const [r, code] of [[req({ channel_id: 'nope' }), 400], [req({}), 400], [req('{bad'), 400], [req({ channel_id: ID }, {}, 'GET'), 405]]) {
    const res = mockRes();
    await handler(r, res);
    assert.equal(res.statusCode, code);
  }
  assert.equal(called, false);
});

test('returns 502 when Supabase fails', async () => {
  const handler = createHandler({ env, fetch: async () => ({ ok: false, status: 500 }) });
  const res = mockRes();
  await handler(req({ channel_id: ID }), res);
  assert.equal(res.statusCode, 502);
});

test('limits each IP to 20 counts per minute', () => {
  const t = 1_000_000_000_000;
  for (let i = 0; i < 20; i++) assert.equal(allowed('1.2.3.4', t), true);
  assert.equal(allowed('1.2.3.4', t), false);
  assert.equal(allowed('1.2.3.4', t + 60000), true);
});
