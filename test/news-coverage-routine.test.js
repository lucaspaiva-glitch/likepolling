'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { monthly, span, indexed } = require('../lib/news-coverage.js');
const { query, BRANDS } = require('../scripts/news-coverage-routine.js');

test('monthly averages GDELT daily shares per month; span covers the last 3 full years', () => {
  const tl = { timeline: [{ data: [{ date: '20231101T000000Z', value: 1 }, { date: '20231102T000000Z', value: 2 }, { date: '20231201T000000Z', value: 4 }] }] };
  assert.deepStrictEqual(monthly(tl), [{ month: '2023-11-01', share: 1.5 }, { month: '2023-12-01', share: 4 }]);
  assert.deepStrictEqual(monthly({}), []);
  assert.deepStrictEqual(span(new Date('2026-11-15T10:00:00Z')), { start: '20231101000000', end: '20261031235959' });
  assert.strictEqual(query('BR'), '"Brazil"');
  assert.strictEqual(query('US'), '"United States"');
  assert.ok(BRANDS.Chanel && BRANDS['Hermès']);
  assert.deepStrictEqual(indexed([{ month: '2023-11-01', share: '0.5' }, { month: '2023-12-01', share: 2 }]), [{ day: '2023-11-01', value: 25 }, { day: '2023-12-01', value: 100 }]);
  assert.deepStrictEqual(indexed([]), []);
});
