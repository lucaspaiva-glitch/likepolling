'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { MAIN } = require('../lib/countries');
const { COUNTRIES } = require('../lib/report');

const script = readFileSync(join(__dirname, '../assets/lp-search.js'), 'utf8');
const i18nScript = readFileSync(join(__dirname, '../assets/i18n.js'), 'utf8');
const months = [{ month: '2026-08', value: 95 }, { month: '2026-09', value: 60 }, { month: '2026-10', value: 80 }];

function loadI18n() {
  const window = {};
  runInNewContext(i18nScript, {
    window,
    document: {
      title: 'Like Polling',
      body: { nodeType: 1, closest: () => null, hasAttribute: () => false },
      head: { appendChild() {} },
      documentElement: {},
      createElement: () => ({ setAttribute() {}, addEventListener() {}, querySelectorAll: () => [] }),
      createTreeWalker: () => ({ nextNode: () => null }),
      querySelector: () => null,
      dispatchEvent() {},
    },
    location: { search: '' },
    navigator: { language: 'en' },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} disconnect() {} },
    CustomEvent: class {},
    URLSearchParams,
  });
  return window;
}

test('Brazil sample country labels use the Portuguese country name and grammar', () => {
  const window = loadI18n();
  for (const lang of ['pt', 'pt-PT']) {
    window.LP_I18N.setLang(lang);
    assert.equal(window.LP_I18N.t('Brazil'), 'Brasil');
    assert.equal(window.LP_I18N.t('Brazil’s economy in numbers'), 'A economia do Brasil em números');
    assert.equal(window.LP_I18N.t('Portugal’s economy in numbers'), 'A economia de Portugal em números');
    assert.equal(window.LP_I18N.t('Norway’s economy in numbers'), 'A economia da Noruega em números');
  }
  window.LP_I18N.setLang('en');
  assert.equal(window.LP_I18N.t('Brazil’s economy in numbers'), 'Brazil’s economy in numbers');
  assert.equal(window.LP_I18N.t('Norway’s economy in numbers'), 'Norway’s economy in numbers');
});

test('Portuguese economy headings use the contraction for each report and World News country', () => {
  const { LP_I18N: i18n } = loadI18n();
  const expected = {
    BR: 'do Brasil', CN: 'da China', DE: 'da Alemanha', ES: 'da Espanha', FR: 'da França',
    GB: 'do Reino Unido', IN: 'da Índia', JP: 'do Japão', KR: 'da Coreia do Sul', MX: 'do México',
    PT: 'de Portugal', RU: 'da Rússia', UA: 'da Ucrânia', US: 'dos Estados Unidos',
    IL: 'de Israel', NL: 'dos Países Baixos', PH: 'das Filipinas', SG: 'de Singapura',
  };
  const en = new Intl.DisplayNames('en', { type: 'region' });
  for (const lang of ['pt', 'pt-PT']) {
    i18n.setLang(lang);
    for (const code of new Set([...MAIN, ...COUNTRIES, 'IL', 'NL', 'PH', 'SG'])) {
      assert.equal(i18n.t(`${en.of(code)}’s economy in numbers`), `A economia ${expected[code]} em números`, `${lang}: ${code}`);
    }
    assert.equal(i18n.t('United States of America’s economy in numbers'), 'A economia dos Estados Unidos em números');
    assert.equal(i18n.t('Atlantis’s economy in numbers'), 'A economia de Atlantis em números');
  }
});

test('politicians tab and current services data-source FAQ have translations in all locales', () => {
  const { LP_I18N: i18n } = loadI18n();
  const politicians = 'Trending politicians';
  const politics = readFileSync(join(__dirname, '../assets/politics-widget.js'), 'utf8');
  const [, note] = politics.match(/<p class="lp-pol-note">([^<]+)<\/p>/);
  const services = readFileSync(join(__dirname, '../services.html'), 'utf8');
  const [, faq] = services.match(/<summary>Where does the data come from\?<\/summary><p>([^<]+)<\/p>/);
  for (const lang of ['pt', 'pt-PT', 'es', 'fr', 'de', 'ru', 'uk', 'zh', 'hi', 'ko', 'ja']) {
    i18n.setLang(lang);
    assert.notEqual(i18n.t(politicians), politicians, lang);
    assert.notEqual(i18n.t(note), note, lang);
    for (const label of ['Result', 'Next']) assert.notEqual(i18n.t(label), label, lang);
    assert.notEqual(i18n.t(faq), faq, lang);
    assert.match(i18n.t(faq), /Google Trends/);
    assert.match(i18n.t(faq), /MusicBrainz/);
  }
  i18n.setLang('pt-PT');
  assert.equal(i18n.t('Philippines'), 'Filipinas');
  assert.equal(i18n.t('Open my report'), 'Abrir o meu relatório');
  assert.equal(i18n.t('Contact'), 'Contacto');
  assert.match(i18n.t('Download the sample (PDF)'), /^Descarregar/);
  assert.equal(i18n.t(politicians), 'Políticos em destaque');
  assert.match(i18n.t(note), /^Mais mencionados nas manchetes/);
  assert.equal(i18n.t('Result'), 'Resultado');
  assert.equal(i18n.t('Norway'), 'Noruega');
  assert.match(i18n.t(faq), /^Só dados abertos\..*registos diários/);
  assert.equal(i18n.t(''), '');
  assert.equal(i18n.t('Like Polling'), 'Like Polling');
  for (const lang of ['en', 'en-GB']) {
    i18n.setLang(lang);
    assert.equal(i18n.t(politicians), politicians);
    assert.equal(i18n.t(faq), faq);
  }
});

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
    world: [{ code: 'US', name: 'United States', value: 100 }, { code: 'PH', name: 'Philippines', value: 93 }],
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
  assert.match(page.innerHTML, /<span class="lps-month-name"><time[^>]+>set\.<\/time><\/span><span class="lps-month-number" aria-hidden="true">9<\/span>/);
  assert.match(page.innerHTML, /<small><span data-no-i18n>2025 · Official data<\/span> <em class="up"><span data-no-i18n>▲ 4\.3%<\/span> vs year before<\/em>/);
  assert.match(page.innerHTML, /<b class="txt">United States<\/b><span>searches for it most, for its size<\/span>/);
  assert.match(page.innerHTML, /<span>Philippines<\/span><i>/);
  assert.match(page.innerHTML, /<h1 data-no-i18n>IKEA<\/h1><p data-no-i18n>Furniture retail company<\/p>/);
  clicks.click();
  assert.match(tip.innerHTML, /datetime="2026-09".*data-no-i18n>60<\/span> of 100/);
  i18n.lang = 'en';
  events['lp:lang']();
  assert.equal(date.textContent, 'Aug 2026');
});

test('country headings and match statuses can translate without changing provider data', async () => {
  const country = { name: 'Norway', cat: 'country', description: 'country in Northern Europe' };
  const club = {
    name: 'Benfica', cat: 'sport', key_stats: {
      kind: 'club', source: 'TheSportsDB', link: 'https://example.test',
      tiles: [{ label: 'League', value: 'Portuguese Primeira Liga' }],
      list: { label: 'Latest and next matches', items: [
        { title: 'Benfica 2–1 Porto', sub: 'Result · Portuguese Primeira Liga' },
        { title: 'Benfica vs Porto', sub: 'Next · Portuguese Primeira Liga' },
      ] },
    },
  };
  async function render(data) {
    const page = {
      querySelector: (selector) => selector === '.lps-bar' ? { firstElementChild: {} } : null,
      querySelectorAll: () => [],
    };
    runInNewContext(script, {
      document: {
        querySelector: () => null,
        getElementById: (id) => id === 'lps-page' ? page : null,
        documentElement: { classList: { contains: () => true } },
        addEventListener() {},
      },
      location: { pathname: '/s', search: '?find=' + data.name },
      window: {},
      URLSearchParams,
      fetch: async () => ({ ok: true, json: async () => data }),
      setInterval() {},
      clearInterval() {},
      requestAnimationFrame() {},
      matchMedia: () => ({ matches: true }),
    });
    await new Promise(setImmediate);
    return page.innerHTML;
  }
  assert.match(await render(country), /<h1>Norway<\/h1><p data-no-i18n>country in Northern Europe<\/p>/);
  const matches = await render(club);
  assert.match(matches, /<b data-no-i18n>Benfica 2–1 Porto<\/b><span>Result<span data-no-i18n> · Portuguese Primeira Liga<\/span><\/span>/);
  assert.match(matches, /<b data-no-i18n>Benfica vs Porto<\/b><span>Next<span data-no-i18n> · Portuguese Primeira Liga<\/span><\/span>/);
});
