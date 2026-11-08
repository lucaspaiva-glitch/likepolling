const test = require('node:test');
const assert = require('node:assert/strict');
const { logGemini, isNoCredit } = require('../lib/gemini-usage');

test('logGemini saves the request size, counting thinking as output', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  await logGemini({ source: 'ad', model: 'gemini-3.1-flash-lite', usage: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 5 } },
    { env: { SUPABASE_URL: 'https://db.example/', SUPABASE_KEY: 'k' }, fetchImpl });
  assert.equal(calls[0].url, 'https://db.example/rest/v1/gemini_usage');
  assert.deepEqual(calls[0].body, { source: 'ad', model: 'gemini-3.1-flash-lite', status: 'ok', input_tokens: 120, output_tokens: 35 });
});

test('logGemini does nothing without Supabase and never throws', async () => {
  let called = false;
  await logGemini({ model: 'm' }, { env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  await logGemini({ model: 'm' }, { env: { SUPABASE_URL: 'https://db.example', SUPABASE_KEY: 'k' }, fetchImpl: async () => { throw new Error('down'); } });
});

test('isNoCredit spots 402 (credit used up) but not 429 (rate limit)', () => {
  assert.equal(isNoCredit({ status: 402 }), true);
  assert.equal(isNoCredit(new Error('got status: 402 RESOURCE_EXHAUSTED')), true);
  assert.equal(isNoCredit({ status: 429, message: '429 RESOURCE_EXHAUSTED' }), false);
  assert.equal(isNoCredit(null), false);
});
