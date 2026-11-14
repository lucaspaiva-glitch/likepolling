'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { plainNames } = require('../scripts/github-routine.js');
const { SITE_LANGS } = require('../scripts/news-world-routine.js');

const repos = [{ full_name: 'a/poki', description: 'Let AI agents operate a real iPhone.' }, { full_name: 'b/x', description: null }];
const all = (t, d) => Object.fromEntries(SITE_LANGS.map((l) => [l, { t, d }]));

test('plainNames keeps complete replies per project and drops incomplete ones', async () => {
  let prompt = '';
  const out = await plainNames(repos, async (p) => { prompt = p; return [{ id: 0, ...all(' Lets AI use a real iPhone ', 'An AI assistant taps and types on your phone.') }, { id: 1, en: { t: null, d: null } }]; });
  assert.match(prompt, /a\/poki/);
  assert.deepStrictEqual(out[0].en, { t: 'Lets AI use a real iPhone', d: 'An AI assistant taps and types on your phone.' });
  assert.strictEqual(Object.keys(out[0]).length, SITE_LANGS.length);
  assert.strictEqual(out[1], null);
});

test('plainNames rejects a reply that is not an array', async () => {
  await assert.rejects(plainNames(repos, async () => ({})), /not an array/);
});
