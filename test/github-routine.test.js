'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { plainNames, topRepos } = require('../scripts/github-routine.js');
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

test('topRepos counts copies of one project once and ranks by stars', () => {
  const r = (full_name, stars, description) => ({ full_name, stargazers_count: stars, description, html_url: `https://github.com/${full_name}` });
  const out = topRepos([[r('a/Checker', 50, 'Scan configs'), r('b/checker', 40, 'Other'), r('c/x', 30, 'Scan configs'), r('d/y', 60, null)]], '2026-11-16');
  assert.deepStrictEqual(out.map((x) => [x.rank, x.full_name]), [[1, 'd/y'], [2, 'a/Checker']]);
});

test('countryOf reads the country from a free-text profile location', () => {
  const { countryOf } = require('../scripts/github-countries-routine.js');
  assert.strictEqual(countryOf('São Paulo, Brazil'), 'BR');
  assert.strictEqual(countryOf('San Francisco Bay Area'), 'US');
  assert.strictEqual(countryOf('Hangzhou, China'), 'CN');
  assert.strictEqual(countryOf('北京'), 'CN');
  assert.strictEqual(countryOf('Toronto, Ontario, CA'), 'CA');
  assert.strictEqual(countryOf('Berlin, Germany'), 'DE');
  assert.strictEqual(countryOf('Earth'), null);
  assert.strictEqual(countryOf(null), null);
});

test('aiBuilders keeps each year\'s most-starred project, with empty years kept', () => {
  const { aiBuilders } = require('../lib/report.js');
  const months = [{ month: '2024-11-01' }, { month: '2025-06-01' }, { month: '2026-01-01' }];
  const rows = [
    { month: '2024-11-01', full_name: 'a/x', stars: 90, url: 'u' },
    { month: '2026-01-01', full_name: 'b/y', stars: 50, url: 'u' },
    { month: '2024-03-01', full_name: 'c/z', stars: 10, url: 'u' },
  ];
  const b = aiBuilders(months, rows);
  assert.deepStrictEqual(b.by_year.map((y) => [y.year, y.top && y.top.full_name]), [['2024', 'a/x'], ['2025', null], ['2026', 'b/y']]);
  assert.strictEqual(b.total, 3);
  assert.strictEqual(aiBuilders(months, []), null);
});
