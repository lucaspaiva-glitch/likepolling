const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PAGES } = require('../api/report');
const { warmSamples } = require('../scripts/warm-samples');

const homepage = readFileSync(join(__dirname, '../index.html'), 'utf8');
const slugs = [...homepage.matchAll(/class="lps-chip" href="\/s\/([\w-]+)"/g)].map((m) => m[1]);
const urls = slugs.map((slug) => `https://www.likepolling.com/api/report?page=${slug}`);
const response = (url, cache, data) => Response.json(data || { sample: true, page: new URL(url).searchParams.get('page') }, { headers: { 'x-vercel-cache': cache } });

test('warms the five homepage sample API URLs, then verifies a cache hit', async () => {
  assert.equal(slugs.length, 5);
  assert.deepEqual(slugs, Object.keys(PAGES));
  const seen = [], logs = [];
  const ok = await warmSamples({
    fetchImpl: async (url, options) => {
      assert.equal(options.redirect, 'error');
      assert.equal(options.method || 'GET', 'GET');
      seen.push(url);
      return response(url, seen.length > 5 ? 'HIT' : 'MISS');
    },
    log: (line) => logs.push(line),
    error: assert.fail,
  });
  assert.equal(ok, true);
  assert.deepEqual(seen, [...urls, urls[0]]);
  assert.match(logs.at(-1), /Probe .*HTTP 200, HIT .*\d+ ms/);
});

test('continues warming the other samples after HTTP errors or the wrong response', async () => {
  const seen = [], errors = [];
  const ok = await warmSamples({
    fetchImpl: async (url) => {
      seen.push(url);
      if (url === urls[1]) return new Response(null, { status: 503 });
      if (url === urls[2]) return response(url, 'MISS', { sample: true, page: 'zara' });
      return response(url, 'MISS');
    },
    log: () => {},
    error: (line) => errors.push(line),
  });
  assert.equal(ok, false);
  assert.deepEqual(seen, urls);
  assert.deepEqual(errors, ['Could not warm zara: HTTP 503', 'Could not warm brazil: Unexpected sample response']);
});

test('does not report that the CDN is warm when the probe is another miss', async () => {
  const errors = [];
  const ok = await warmSamples({
    fetchImpl: async (url) => response(url, 'MISS'),
    log: () => {},
    error: (line) => errors.push(line),
  });
  assert.equal(ok, false);
  assert.deepEqual(errors, ['Could not verify shakira: Sample was not served from the CDN cache']);
});
