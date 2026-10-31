const test = require('node:test');
const assert = require('node:assert/strict');
const { run, feedUrl, sectionUrl, EDITIONS, SEARCH, PHOTO_TARGET, numbersCheckOut } = require('../scripts/news-world-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const item = (title, source, link) =>
  `<item><title>${title} - ${source}</title><link>${link}</link><pubDate>Thu, 15 Oct 2026 22:06:00 GMT</pubDate><source url="https://s.test">${source}</source></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const text = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const deps = (f) => ({ fetch: f, sleep: async () => {}, log: () => {} });

test('covers the 41 Trending Index countries; editions vs country searches', () => {
  assert.equal(Object.keys(EDITIONS).length, 41);
  assert.equal(feedUrl('US'), 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en');
  assert.match(feedUrl('EC'), /^https:\/\/news\.google\.com\/rss\/search\?q=Ecuador%20when%3A1d&hl=es-419&gl=EC&ceid=EC:es-419$/);
  assert.deepEqual(Object.keys(SEARCH).sort(), ['DZ', 'EC', 'IQ']);
});

test('keeps Google News order, drops blocked sources, repeats and overlong links, writes one RPC', async () => {
  let payload;
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_world')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_world')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', image_url: 'https://img.test/1.jpg' }]));
    if (url.includes('/rest/v1/news_wire')) return text(200, '[]');
    if (url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, rss(
      item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`),
      item('A clip', 'YouTube', `https://news.google.com/rss/articles/${cc}-yt`),
      item('Second story', 'Paper', `https://news.google.com/rss/articles/${cc}-2`),
      item('first story', 'Other', `https://news.google.com/rss/articles/${cc}-dup`),
      item('Huge link', 'Paper', `https://news.google.com/rss/articles/${cc}-${'x'.repeat(2100)}`),
    ));
  };
  const s = await run(env, deps(f));
  assert.equal(s.rows, 82);
  assert.deepEqual(s.failed, []);
  const us = payload.filter((r) => r.country_code === 'US');
  assert.deepEqual(us.map((r) => [r.rank, r.title, r.source]), [[1, 'First story', 'Wire'], [2, 'Second story', 'Paper']]);
  assert.equal(us[0].image_url, 'https://img.test/1.jpg');
  assert.equal(us[1].image_url, null);
});

test('keeps going when a country fails, and fails when none load', async () => {
  let payload;
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    if (url.includes('gl=JP')) return text(403, 'no');
    return text(200, rss(item('Story', 'Wire', `https://news.google.com/rss/articles/${new URL(url).searchParams.get('gl')}`)));
  };
  const s = await run(env, deps(f));
  assert.deepEqual(s.failed, [{ country: 'JP', error: 'HTTP 403' }]);
  assert.ok(!payload.some((r) => r.country_code === 'JP'));
  await assert.rejects(run(env, deps(async () => text(403, 'no'))), /No stories fetched/);
  await assert.rejects(run({}, deps(async () => text(200, ''))), /Missing env vars/);
});

test('translates new headlines once and reuses stored translations', async () => {
  let payload;
  const tr = (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${t}`]));
  const asked = [];
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('title_tr=not.is.null')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', title: 'First story', title_tr: tr('stored') }]));
    if (url.includes('/rest/v1/news_world?select=link,image_url')) return text(200, JSON.stringify(Object.keys(EDITIONS).map((cc) => ({ link: `https://news.google.com/rss/articles/${cc}-1`, image_url: 'https://img.test/a.jpg' }))));
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, rss(item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`)));
  };
  const s = await run(env, { ...deps(f), translate: async (titles) => { asked.push(...titles); return titles.map(tr); } });
  assert.equal(s.translations.translated, 40);
  assert.equal(asked.length, 40);
  assert.equal(payload.find((r) => r.country_code === 'US').title_tr.ja, 'ja:stored');
  assert.equal(payload.find((r) => r.country_code === 'JP').title_tr.pt, 'pt:First story');
});

test('tops up countries short of photo stories from section feeds, newest first', async () => {
  let payload;
  const looked = [];
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_world?select=link,image_url')) return text(200, JSON.stringify([
      { link: 'https://news.google.com/rss/articles/US-top', image_url: 'https://img.test/top.jpg' },
      { link: 'https://news.google.com/rss/articles/US-old', image_url: '' },
      ...Array.from({ length: 40 }, (_, i) => ({ link: `https://news.google.com/rss/articles/US-s${i}`, image_url: i % 2 ? '' : `https://img.test/s${i}.jpg` })),
    ]));
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) { looked.push(url); return text(404, ''); }
    const cc = new URL(url).searchParams.get('gl');
    if (cc !== 'US') return text(200, rss(item('Top', 'Wire', `https://news.google.com/rss/articles/${cc}-top`)));
    if (url.includes('/section/topic/')) {
      const topic = url.split('/topic/')[1].split('?')[0];
      if (topic !== 'NATION') return text(200, rss(item('Top', 'Wire', 'https://news.google.com/rss/articles/US-top')));
      return text(200, rss(...Array.from({ length: 15 }, (_, i) => item(`S${i}`, 'Paper', `https://news.google.com/rss/articles/US-s${i}`).replace('22:06', `${String(10 + i).padStart(2, '0')}:00`))));
    }
    return text(200, rss(item('Top', 'Wire', 'https://news.google.com/rss/articles/US-top'), item('Old', 'Wire', 'https://news.google.com/rss/articles/US-old')));
  };
  const s = await run(env, deps(f));
  assert.equal(sectionUrl('US', 'WORLD'), 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en');
  const us = payload.filter((r) => r.country_code === 'US');
  assert.deepEqual(us.slice(0, 2).map((r) => r.title), ['Top', 'Old']);
  // Newest section stories first (S14 at 24:00 ... ), photo-less ones kept as '' but not counted.
  assert.deepEqual(us.slice(2).map((r) => r.title), ['S14', 'S13', 'S12', 'S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1', 'S0']);
  assert.ok(us.every((r, i) => r.rank === i + 1));
  assert.equal(s.perCountry.US, 1 + 8);
  assert.ok(PHOTO_TARGET > s.perCountry.US);
  assert.equal(s.images.topped_up.looked, 0);
});

test('a batch whose translation reply is invalid JSON is retried in halves', async () => {
  let payload;
  const tr = (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${t}`]));
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('/rest/v1/news_world?select=link,image_url')) return text(200, JSON.stringify(Object.keys(EDITIONS).map((cc) => ({ link: `https://news.google.com/rss/articles/${cc}-1`, image_url: 'https://img.test/a.jpg' }))));
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    return text(200, rss(item(`Story ${cc}`, 'Wire', `https://news.google.com/rss/articles/${cc}-1`)));
  };
  const s = await run(env, { ...deps(f), translate: async (titles) => { if (titles.length > 10) throw new Error("Expected ',' or '}' after property value in JSON"); return titles.map(tr); } });
  assert.equal(s.translations.translated, 41);
  assert.equal(s.translations.pending, 0);
  assert.deepEqual(s.translations.errors, []);
  assert.equal(payload.find((r) => r.country_code === 'AR').title_tr.en, 'en:Story AR');
});

test("translates only each country's first PHOTO_TARGET photo stories", async () => {
  const asked = [];
  const tr = (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${t}`]));
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/')) return text(200, '1');
    if (url.includes('/rest/v1/news_world?select=link,image_url')) return text(200, JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ link: `https://news.google.com/rss/articles/US-${i}`, image_url: 'https://img.test/a.jpg' }))));
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    if (cc !== 'US' || url.includes('/section/')) return text(200, rss());
    return text(200, rss(...Array.from({ length: 30 }, (_, i) => item(`US story ${i}`, 'Wire', `https://news.google.com/rss/articles/US-${i}`))));
  };
  await run(env, { ...deps(f), translate: async (titles) => { asked.push(...titles); return titles.map(tr); } });
  assert.deepEqual(asked, Array.from({ length: PHOTO_TARGET }, (_, i) => `US story ${i}`));
});

test("summarizes each translated photo story once from the publisher's description, and reuses stored summaries", async () => {
  let payload;
  const asked = [];
  const tr = (p) => (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${p}${t.headline || t}`]));
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_world')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('title_tr=not.is.null')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', title: 'First story', title_tr: { ...tr('')('First story'), sum: { en: 'stored summary' }, sv: 3 } }]));
    if (url.includes('/rest/v1/news_world')) return text(200, JSON.stringify(['US', 'JP'].flatMap((cc) => [1, 2].map((n) => ({ link: `https://news.google.com/rss/articles/${cc}-${n}`, image_url: `https://img.test/${cc}${n}.jpg` })))));
    if (url.includes('/rest/v1/')) return text(200, '[]');
    if (url.includes('/rss/articles/')) {
      const id = url.split('/').pop();
      return text(200, `<c-wiz data-n-a-sg="sg" data-n-a-ts="1"></c-wiz><i>${id}</i>`);
    }
    if (url.includes('batchexecute')) {
      const id = decodeURIComponent(init.body).match(/((?:US|JP)-\d)/)[1];
      return text(200, `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', `https://paper.test/${id}`])]])}`);
    }
    if (url.startsWith('https://paper.test/')) {
      const id = url.split('/').pop();
      return text(200, id === 'JP-2' ? '<html><head><title>x</title></head></html>' : `<meta property="og:description" content="Long description for ${id} &amp; what happened next in detail.">`);
    }
    const cc = new URL(url).searchParams.get('gl');
    return text(200, cc === 'US' || cc === 'JP' ? rss(item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`), item('Second story', 'Paper', `https://news.google.com/rss/articles/${cc}-2`)) : rss());
  };
  const s = await run(env, { ...deps(f), translate: async (titles) => titles.map(tr('')), summarize: async (stories) => { asked.push(...stories); return stories.map(tr('sum:')); } });
  assert.deepEqual(asked.map((x) => x.description).sort(), ['Long description for JP-1 & what happened next in detail.', 'Long description for US-2 & what happened next in detail.']);
  assert.equal(s.summaries.summarized, 2);
  assert.equal(s.summaries.no_description, 1);
  const get = (cc, n) => payload.find((r) => r.country_code === cc && r.rank === n).title_tr.sum;
  assert.deepEqual(get('US', 1), { en: 'stored summary' });
  assert.equal(get('US', 2).ja, 'ja:sum:Second story');
  assert.equal(get('JP', 2), '');
});

test("drops a summary whose description doesn't fit or that invents a number, and redoes summaries from older rules", async () => {
  let payload;
  const asked = [];
  const tr = (p) => (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${p}${t.headline || t}`]));
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_world')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('title_tr=not.is.null')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', title: 'First story', title_tr: { ...tr('')('First story'), sum: { en: 'old summary' } } }]));
    if (url.includes('/rest/v1/news_world')) return text(200, JSON.stringify(['US', 'JP'].flatMap((cc) => [1, 2].map((n) => ({ link: `https://news.google.com/rss/articles/${cc}-${n}`, image_url: `https://img.test/${cc}${n}.jpg` })))));
    if (url.includes('/rest/v1/')) return text(200, '[]');
    if (url.includes('/rss/articles/')) {
      const id = url.split('/').pop();
      return text(200, `<c-wiz data-n-a-sg="sg" data-n-a-ts="1"></c-wiz><i>${id}</i>`);
    }
    if (url.includes('batchexecute')) {
      const id = decodeURIComponent(init.body).match(/((?:US|JP)-\d)/)[1];
      return text(200, `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', `https://paper.test/${id}`])]])}`);
    }
    if (url.startsWith('https://paper.test/')) {
      const id = url.split('/').pop();
      return text(200, id === 'JP-2' ? '<html><head><title>x</title></head></html>' : `<meta property="og:description" content="Long description for ${id} &amp; what happened next in detail.">`);
    }
    const cc = new URL(url).searchParams.get('gl');
    return text(200, cc === 'US' || cc === 'JP' ? rss(item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`), item('Second story', 'Paper', `https://news.google.com/rss/articles/${cc}-2`)) : rss());
  };
  const s = await run(env, { ...deps(f), translate: async (titles) => titles.map(tr('')), summarize: async (stories) => { asked.push(...stories); return stories.map((st) => (/US-1/.test(st.description) ? tr('sum:')(st) : /US-2/.test(st.description) ? { ...tr('sum:')(st), en: 'Crash in 2024 killed 40.' } : { fits: false })); } });
  assert.equal(asked.length, 3);
  assert.equal(s.summaries.summarized, 1);
  assert.equal(s.summaries.rejected, 2);
  const get = (cc, n) => payload.find((r) => r.country_code === cc && r.rank === n).title_tr;
  assert.equal(get('US', 1).sum.ja, 'ja:sum:First story');
  assert.equal(get('US', 1).sv, 3);
  assert.equal(get('US', 2).sum, '');
  assert.equal(get('JP', 1).sum, '');
});

test('a summary may only use numbers found in its headline or description', () => {
  assert.ok(numbersCheckOut('Payments run until November 13, 2026.', 'Pagos', 'Del 28 de octubre al 13 de noviembre de 2026'));
  assert.ok(numbersCheckOut('A $200,000 staffing package.', 'Offer', 'a staffing package worth $200 000'));
  assert.ok(numbersCheckOut('Talks resume in 2026.', 'محادثات', 'تستأنف المحادثات في ٢٠٢٦'));
  assert.ok(numbersCheckOut('Sales rose 20%.', '売上', '売上が２０％増加'));
  assert.ok(!numbersCheckOut("Spain's deadly 2024 train collision.", 'Train collision', "Europe's deadliest train collision since 2013"));
});

test('retries a failed summary batch in halves', async () => {
  let payload;
  const asked = [];
  const tr = (p) => (t) => Object.fromEntries(['en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'].map((l) => [l, `${l}:${p}${t.headline || t}`]));
  const f = async (url, init = {}) => {
    if (url.includes('/rpc/replace_news_world')) { payload = JSON.parse(init.body).payload; return text(200, String(payload.length)); }
    if (url.includes('title_tr=not.is.null')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-1', title: 'First story', title_tr: { ...tr('')('First story'), sum: { en: 'stored summary' }, sv: 3 } }]));
    if (url.includes('/rest/v1/news_world')) return text(200, JSON.stringify(['US', 'JP'].flatMap((cc) => [1, 2].map((n) => ({ link: `https://news.google.com/rss/articles/${cc}-${n}`, image_url: `https://img.test/${cc}${n}.jpg` })))));
    if (url.includes('/rest/v1/')) return text(200, '[]');
    if (url.includes('/rss/articles/')) {
      const id = url.split('/').pop();
      return text(200, `<c-wiz data-n-a-sg="sg" data-n-a-ts="1"></c-wiz><i>${id}</i>`);
    }
    if (url.includes('batchexecute')) {
      const id = decodeURIComponent(init.body).match(/((?:US|JP)-\d)/)[1];
      return text(200, `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', `https://paper.test/${id}`])]])}`);
    }
    if (url.startsWith('https://paper.test/')) {
      const id = url.split('/').pop();
      return text(200, id === 'JP-2' ? '<html><head><title>x</title></head></html>' : `<meta property="og:description" content="Long description for ${id} &amp; what happened next in detail.">`);
    }
    const cc = new URL(url).searchParams.get('gl');
    return text(200, cc === 'US' || cc === 'JP' ? rss(item('First story', 'Wire', `https://news.google.com/rss/articles/${cc}-1`), item('Second story', 'Paper', `https://news.google.com/rss/articles/${cc}-2`)) : rss());
  };
  const s = await run(env, { ...deps(f), translate: async (titles) => titles.map(tr('')), summarize: async (stories) => { if (stories.length > 1) throw new Error('Unexpected token, not valid JSON'); asked.push(...stories); return stories.map(tr('sum:')); } });
  assert.equal(s.summaries.summarized, 2);
  assert.deepEqual(s.summaries.errors, []);
  assert.equal(payload.find((r) => r.country_code === 'US' && r.rank === 2).title_tr.sum.ja, 'ja:sum:Second story');
});

test('keeps the previous stories when Gemini fails for every headline', async () => {
  let wrote = false;
  const f = async (url) => {
    if (url.includes('/rpc/')) { wrote = true; return text(200, '1'); }
    if (url.includes('/rest/v1/news_world?select=link,image_url')) return text(200, JSON.stringify([{ link: 'https://news.google.com/rss/articles/US-0', image_url: 'https://img.test/a.jpg' }]));
    if (url.includes('/rest/v1/') || url.includes('/rss/articles/')) return text(404, '');
    const cc = new URL(url).searchParams.get('gl');
    if (cc !== 'US' || url.includes('/section/')) return text(200, rss());
    return text(200, rss(item('US story 0', 'Wire', 'https://news.google.com/rss/articles/US-0')));
  };
  await assert.rejects(run(env, { ...deps(f), translate: async () => { throw new Error('{"error":{"code":402,"message":"Your prepayment credits are depleted."}}'); } }), /Gemini failed for every headline, kept the previous stories: .*402/);
  assert.equal(wrote, false);
});
