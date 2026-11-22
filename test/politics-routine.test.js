'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { run, rank, verify, sameName } = require('../scripts/politics-routine');

test('rank counts only real headline numbers, merges repeats and keeps the top 5', () => {
  const list = [
    { name: 'Lula', wiki: 'Luiz Inácio Lula da Silva', role: 'President of Brazil', headlines: [1, 2, 3, 99] },
    { name: 'Lula da Silva', wiki: 'Luiz Inácio Lula da Silva', headlines: [3, 4] },
    { name: 'Nobody', headlines: [] },
    { name: 'A', headlines: [5] }, { name: 'B', headlines: [6] }, { name: 'C', headlines: [7] }, { name: 'D', headlines: [8] }, { name: 'E', headlines: [9] },
  ];
  const r = rank(list, 10);
  assert.equal(r.length, 5);
  assert.deepEqual(r[0], { rank: 1, name: 'Lula', wiki_title: 'Luiz Inácio Lula da Silva', role: 'President of Brazil', headlines: 4 });
  assert.ok(!r.some((p) => p.name === 'Nobody'));
  assert.deepEqual(rank('nope', 10), []);
});

test('run saves each country, skips thin ones and fails only when most countries fail', async () => {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push([opts.method || 'GET', url]);
    if (url.includes('news_archive')) return { ok: true, json: async () => (url.includes('country_code=eq.PT') ? [{ title: 'x' }] : Array.from({ length: 12 }, (_, i) => ({ title: `Headline ${i}` }))) };
    return { ok: true, json: async () => [] };
  };
  const ask = async () => [{ name: 'Someone', role: 'Minister', headlines: [1, 2] }];
  const logs = [];
  const res = await run({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', GEMINI_API_KEY: 'g' }, { fetch, ask, verify: async (p) => p, log: (m) => logs.push(m), countries: ['BR', 'PT', 'US'], now: () => new Date('2026-11-22T06:40:00Z') });
  assert.deepEqual(res.done.sort(), ['BR', 'US']);
  assert.deepEqual(res.failed, ['PT']);
  assert.ok(calls.some(([m, u]) => m === 'POST' && u.includes('politics_trending')));
  assert.ok(calls.some(([m, u]) => m === 'DELETE' && u.includes('rank=gt.1')));
  await assert.rejects(run({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', GEMINI_API_KEY: 'g' }, { fetch, ask, verify: async (p) => p, log: () => {}, countries: ['PT'] }), /Most countries failed/);
  await assert.rejects(run({}, {}), /Missing env vars/);
});

test('sameName refuses a Wikipedia title that shares no word with the name', () => {
  assert.ok(sameName('Lula', 'Luiz Inácio Lula da Silva'));
  assert.ok(sameName('Zelensky', 'Volodymyr Zelensky'));
  assert.ok(!sameName('Lee', 'Yoon Suk Yeol'));
  assert.equal(rank([{ name: 'Lee', wiki: 'Yoon Suk Yeol', headlines: [1] }], 5)[0].wiki_title, null);
});

test('verify keeps only Wikidata politicians, follows redirects and shows the Wikipedia title', async () => {
  const fetch = async (url) => ({ json: async () => (url.includes('wikipedia.org')
    ? { query: { redirects: [{ from: 'Lula', to: 'Luiz Inácio Lula da Silva' }], pages: [{ title: 'Luiz Inácio Lula da Silva', pageprops: { wikibase_item: 'Q37181' } }, { title: 'Matvey Safonov', pageprops: { wikibase_item: 'Q1' } }] } }
    : { results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q37181' } }] } }) });
  const out = await verify(fetch, [{ name: 'Lula', wiki_title: 'Lula', headlines: 3 }, { name: 'Matvey Safonov', wiki_title: 'Matvey Safonov', headlines: 2 }, { name: 'X', wiki_title: null, headlines: 1 }]);
  assert.deepEqual(out, [{ name: 'Luiz Inácio Lula da Silva', wiki_title: 'Luiz Inácio Lula da Silva', headlines: 3 }]);
});
