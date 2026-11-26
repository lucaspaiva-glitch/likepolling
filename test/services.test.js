'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const scripts = ['i18n.js', 'report-i18n.js', 'services.js']
  .map((file) => readFileSync(join(__dirname, '../assets', file), 'utf8'));
const settle = () => new Promise((resolve) => setImmediate(resolve));

function loadPreview(lang) {
  const listeners = {};
  const nodes = Object.fromEntries(['preview', 'pv-pdf', 'pv-tag', 'pv-title', 'pv-nl', 'pv-rank-l',
    'pv-take', 'pv-kpis', 'pv-chart', 'pv-rank'].map((id) => [id, {}]));
  const window = {};
  let respond;
  const request = new Promise((resolve) => { respond = resolve; });
  const context = {
    window,
    document: {
      title: 'Like Polling',
      body: { nodeType: 1, closest: () => null, hasAttribute: () => false },
      head: { appendChild() {} },
      documentElement: {},
      createElement: () => ({ setAttribute() {}, addEventListener() {}, querySelectorAll: () => [] }),
      createTreeWalker: () => ({ nextNode: () => null }),
      querySelector: () => null,
      getElementById: (id) => nodes[id],
      addEventListener: (type, listener) => { listeners[type] = listener; },
      dispatchEvent: (event) => listeners[event.type]?.(),
    },
    location: { search: '' },
    localStorage: { getItem: () => lang, setItem() {} },
    navigator: { language: 'en' },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} disconnect() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    URLSearchParams,
    fetch: (url) => {
      assert.equal(url, '/api/report?country=BR&compare=PT');
      return request;
    },
  };
  for (const script of scripts) runInNewContext(script, context);
  return { nodes, respond, setLang: window.LP_I18N.setLang };
}

function sample(news) {
  return {
    countries: [
      { news_focus: { articles: 12 }, news_daily: news, searches: { top: [{ query: 'palmeiras', traffic: 20 }] } },
      { news_focus: { articles: 8 } },
    ],
    shared: { articles_together: 3 },
  };
}

test('sample preview localizes before the request completes and preserves the localized live report', async () => {
  const { nodes, respond, setLang } = loadPreview('pt-PT');
  assert.equal(nodes['pv-rank-l'].textContent, 'Pesquisado no Google');
  assert.equal(nodes['pv-take'].textContent, 'A carregar o exemplo…');
  assert.equal(nodes['pv-tag'].textContent, 'Relatório completo de país');
  assert.equal(nodes['pv-title'].textContent, 'Brasil vs Portugal');
  assert.equal(nodes['pv-nl'].textContent, 'Cobertura de notícias por dia');
  assert.match(nodes.preview.href, /\/pt-PT\/country-report\.pdf$/);
  setLang('en-GB');
  assert.equal(nodes['pv-take'].textContent, 'Loading the sample…');
  setLang('pt-PT');
  respond({ ok: true, json: () => sample([{ day: '2026-11-24', articles: 2 }, { day: '2026-11-25', articles: 5 }]) });
  await settle();
  assert.equal(nodes['pv-rank-l'].textContent, 'Pesquisado no Google · Brasil');
  assert.match(nodes['pv-take'].innerHTML, /Dia mais movimentado.*5 notícias/);
  assert.match(nodes['pv-chart'].innerHTML, /polyline/);
  assert.match(nodes['pv-rank'].innerHTML, /palmeiras/);
});

test('loading and unavailable preview messages follow the language in every non-English locale', async () => {
  const { nodes, respond, setLang } = loadPreview('en');
  const langs = ['pt', 'pt-PT', 'es', 'fr', 'de', 'ru', 'uk', 'zh', 'hi', 'ko', 'ja'];
  for (const lang of langs) {
    setLang(lang);
    assert.notEqual(nodes['pv-rank-l'].textContent, 'Searched on Google', lang);
    assert.notEqual(nodes['pv-take'].textContent, 'Loading the sample…', lang);
  }
  respond({ ok: false });
  await settle();
  for (const lang of langs) {
    setLang(lang);
    assert.ok(nodes['pv-take'].textContent, lang);
    assert.notEqual(nodes['pv-take'].textContent, 'Open the free sample to see a full report.', lang);
  }
  setLang('pt-PT');
  assert.equal(nodes['pv-take'].textContent, 'Abra o exemplo grátis para ver um relatório completo.');
  setLang('en');
  assert.equal(nodes['pv-take'].textContent, 'Open the free sample to see a full report.');
});

test('a sample with no daily news does not leave the card in its loading state', async () => {
  const { nodes, respond } = loadPreview('pt-PT');
  respond({ ok: true, json: () => sample([]) });
  await settle();
  assert.equal(nodes['pv-take'].textContent, 'Abra o exemplo grátis para ver um relatório completo.');
  assert.equal(nodes['pv-rank-l'].textContent, 'Pesquisado no Google · Brasil');
});
