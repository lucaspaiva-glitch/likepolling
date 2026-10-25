const test = require('node:test');
const assert = require('node:assert/strict');
const { run, fashionUrl, TERMS } = require('../scripts/news-fashion-routine');
const { EDITIONS } = require('../scripts/news-world-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const item = (title, source, link) =>
  `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>Thu, 15 Oct 2026 22:06:00 GMT</pubDate><source url="https://s.test">${source}</source></item>`;
const text = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const LANGS = ['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];

test('one local-language fashion search per country', () => {
  for (const [hl] of Object.values(EDITIONS)) assert.ok(TERMS[hl] || hl.startsWith('en'), hl);
  assert.equal(fashionUrl('US'), 'https://news.google.com/rss/search?q=fashion%20when%3A2d&hl=en-US&gl=US&ceid=US:en');
  assert.match(fashionUrl('PT'), /q=moda%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT:pt-150$/);
  assert.match(fashionUrl('EC'), /q=moda%20Ecuador%20when%3A2d&/);
});

test('writes news_fashion with the AI fashion check stored in title_tr', async () => {
  let payload;
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_fashion')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_fashion?select=link,image_url')) {
      return text(200, JSON.stringify(Object.keys(EDITIONS).flatMap((cc) => [1, 2].map((n) => ({ link: `https://news.google.com/rss/articles/${cc}-${n}`, image_url: 'https://img.test/a.jpg' })))));
    }
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, `<rss><channel>${item('Runway report', 'Vogue', `https://news.google.com/rss/articles/${cc}-1`)}${item('Team wins in style', 'Sport', `https://news.google.com/rss/articles/${cc}-2`)}</channel></rss>`);
  };
  const translate = async (titles) => titles.map((t) => ({ ...Object.fromEntries(LANGS.map((l) => [l, t])), fashion: t.startsWith('Runway') }));
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, translate });
  assert.deepEqual(s.failed, []);
  const us = payload.filter((r) => r.country_code === 'US');
  assert.deepEqual(us.map((r) => [r.title, r.title_tr && r.title_tr.fashion]), [['Runway report', true], ['Team wins in style', false]]);
});
