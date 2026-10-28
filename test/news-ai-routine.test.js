const test = require('node:test');
const assert = require('node:assert/strict');
const { run, aiUrl, TERMS, AI_CHECK } = require('../scripts/news-ai-routine');
const { EDITIONS } = require('../scripts/news-world-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const item = (title, source, link) =>
  `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>Thu, 15 Oct 2026 22:06:00 GMT</pubDate><source url="https://s.test">${source}</source></item>`;
const text = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const LANGS = ['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'];

test('one local-language AI search per country', () => {
  for (const [hl] of Object.values(EDITIONS)) assert.ok(TERMS[hl] || hl.startsWith('en'), `no term for ${hl}`);
  assert.equal(aiUrl('US'), 'https://news.google.com/rss/search?q=artificial%20intelligence%20when%3A2d&hl=en-US&gl=US&ceid=US:en');
  assert.match(aiUrl('PT'), /q=intelig%C3%AAncia%20artificial%20when%3A2d&hl=pt-PT&gl=PT&ceid=PT:pt-150$/);
  assert.match(aiUrl('IQ', 3), /%D8%A7%D9%84%D8%B9%D8%B1%D8%A7%D9%82%20when%3A3d&/);
});

test('the AI check accepts only the four kinds or none, and hides none', () => {
  for (const v of ['medicine', 'work', 'creativity', 'life', 'none']) assert.ok(AI_CHECK.ok(v));
  for (const v of ['jobs', true, null, undefined]) assert.ok(!AI_CHECK.ok(v));
  assert.ok(AI_CHECK.hide('none'));
  assert.ok(!AI_CHECK.hide('medicine'));
});

test('writes news_ai with the AI kind in title_tr and summarizes only the shown stories', async () => {
  let payload;
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_ai')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_ai?select=link,image_url')) {
      return text(200, JSON.stringify(Object.keys(EDITIONS).flatMap((cc) => [1, 2].map((n) => ({ link: `https://news.google.com/rss/articles/${cc}-${n}`, image_url: 'https://img.test/a.jpg' })))));
    }
    if (url.includes('/rest/v1/')) return text(404, '');
    if (url.includes('/rss/articles/')) return text(200, '<c-wiz data-n-a-sg="sg" data-n-a-ts="1"></c-wiz>');
    if (url.includes('batchexecute')) {
      const id = decodeURIComponent(init.body).match(/([A-Z]{2}-\d)/)[1];
      return text(200, `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', `https://paper.test/${id}`])]])}`);
    }
    if (url.startsWith('https://paper.test/')) return text(200, '<meta property="og:description" content="What the article says about the new AI tool for hospitals.">');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, `<rss><channel>${item('AI spots cancer early', 'Health', `https://news.google.com/rss/articles/${cc}-1`)}${item('Chip stocks fall', 'Markets', `https://news.google.com/rss/articles/${cc}-2`)}</channel></rss>`);
  };
  const translate = async (titles) => titles.map((t) => ({ ...Object.fromEntries(LANGS.map((l) => [l, t])), ai: t.startsWith('AI spots') ? 'medicine' : 'none' }));
  const summarized = [];
  const summarize = async (stories) => (summarized.push(...stories.map((s) => s.headline)), stories.map(() => Object.fromEntries(LANGS.map((l) => [l, 'Short summary']))));
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, translate, summarize });
  assert.deepEqual(s.failed, []);
  const us = payload.filter((r) => r.country_code === 'US');
  assert.deepEqual(us.map((r) => [r.title, r.title_tr && r.title_tr.ai]), [['AI spots cancer early', 'medicine'], ['Chip stocks fall', 'none']]);
  assert.equal(us[0].title_tr.sum.en, 'Short summary');
  assert.equal(us[1].title_tr.sum, undefined);
  assert.ok(summarized.length > 0 && summarized.every((h) => h === 'AI spots cancer early'));
});
