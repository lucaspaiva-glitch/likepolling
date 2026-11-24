'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const script = readFileSync(join(__dirname, '../assets/lp-search.js'), 'utf8');
const months = [{ month: '2026-08', value: 95 }, { month: '2026-09', value: 60 }, { month: '2026-10', value: 80 }];

test('search localizes chart dates and exposes only score and change labels for translation', async () => {
  const events = {};
  const clicks = {};
  const tip = {};
  const date = { dateTime: '2026-08', dataset: { lpsDate: 'year' } };
  const chart = { querySelector: () => tip, querySelectorAll: () => [] };
  const bar = {
    dataset: { month: '2026-09', score: '60' },
    closest: () => chart,
    classList: { add() {} },
    addEventListener: (type, listener) => { clicks[type] = listener; },
  };
  const page = {
    querySelector: (selector) => selector === '.lps-bar' ? { firstElementChild: {} } : null,
    querySelectorAll: (selector) => {
      if (selector === '.lps-cols button') return [bar];
      if (selector === '[data-lps-date]') return [date];
      return [];
    },
  };
  const i18n = { lang: 'pt-PT', locale: () => i18n.lang };
  const data = {
    name: 'IKEA', description: 'Furniture retail company', cat: 'brand',
    searches: { months, peak: { day: '2026-08-16' } },
    key_stats: { kind: 'country', source: 'World Bank', link: 'https://example.test', tiles: [
      { label: 'Economy size (GDP)', unit: 'usd', value: 200, year: 2025, note: 'Official data', change: 4.3 },
    ] },
  };
  runInNewContext(script, {
    document: {
      querySelector: () => null,
      getElementById: (id) => id === 'lps-page' ? page : null,
      documentElement: { classList: { contains: () => true } },
      addEventListener: (type, listener) => { events[type] = listener; },
    },
    location: { pathname: '/s', search: '?find=IKEA' },
    window: { LP_I18N: i18n },
    URLSearchParams,
    fetch: async () => ({ ok: true, json: async () => data }),
    setInterval() {},
    clearInterval() {},
    requestAnimationFrame() {},
    matchMedia: () => ({ matches: true }),
  });
  await new Promise(setImmediate);
  assert.match(page.innerHTML, /datetime="2026-08" data-lps-date="year" data-no-i18n>08\/2026<|datetime="2026-08" data-lps-date="year" data-no-i18n>ago\.? de 2026</i);
  assert.match(page.innerHTML, /data-no-i18n>95<\/span> of 100/);
  assert.match(page.innerHTML, /<small><span data-no-i18n>2025 · Official data<\/span> <em class="up"><span data-no-i18n>▲ 4\.3%<\/span> vs year before<\/em>/);
  assert.match(page.innerHTML, /<h1 data-no-i18n>IKEA<\/h1><p data-no-i18n>Furniture retail company<\/p>/);
  clicks.click();
  assert.match(tip.innerHTML, /datetime="2026-09".*data-no-i18n>60<\/span> of 100/);
  i18n.lang = 'en';
  events['lp:lang']();
  assert.equal(date.textContent, 'Aug 2026');
});
