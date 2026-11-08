const test = require('node:test');
const assert = require('node:assert/strict');
const report = require('../lib/report');
const { createHandler } = require('../api/report');
const ideas = require('../scripts/report-ideas-routine');

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret', LEMONSQUEEZY_STORE_ID: '11', LEMONSQUEEZY_PRODUCT_ID: '22' };
const NOW = new Date('2026-11-20T12:00:00Z');
const KEY = '38b1460a-5104-4067-a91d-77b872934d51';
let ipSeq = 0;
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const WIKI = [
  { day: '2026-11-19', project: 'pt.wikipedia', article: 'Lula', views_ceil: 900 },
  { day: '2026-11-01', project: 'pt.wikipedia', article: 'Lula', views_ceil: 800 },
  { day: '2026-11-18', project: 'pt.wikipedia', article: 'Halloween', views_ceil: 500 },
  { day: '2026-11-18', project: 'pt.wikipedia', article: 'Wikipédia:Página_principal', views_ceil: 9e6 },
  { day: '2026-11-18', project: 'pt.wikipedia', article: 'Main_Page', views_ceil: 9e6 },
  { day: '2026-11-18', project: 'pt.wikipedia', article: 'XVideos', views_ceil: 9e6 },
];
const PAIRS = [{ actor1_cc: 'BR', actor2_cc: 'PT', articles: 7 }, { actor1_cc: 'US', actor2_cc: 'BR', articles: 9 }, { actor1_cc: 'PT', actor2_cc: 'ES', articles: 3 }];
// Fake Supabase: wiki/gdelt rows for any country, nothing else.
function db(extra = {}) {
  const seen = [];
  const fetchDb = async (url) => {
    seen.push(url);
    if (url.includes('wiki_top_daily')) return json(url.includes('offset=0') ? WIKI : []);
    if (url.includes('gdelt_country_daily')) return json(url.includes('offset=0') ? [{ root_code: '04', articles: 60 }, { root_code: '19', articles: 40 }] : []);
    if (url.includes('gdelt_pairs_daily')) {
      const cc = url.match(/actor1_cc\.eq\.([A-Z]{2})/)[1];
      return json(url.includes('offset=0') ? PAIRS.filter((r) => r.actor1_cc === cc || r.actor2_cc === cc) : []);
    }
    if (url.includes('report_insights')) return json([{ ideas: [{ title: 'T', idea: 'I', based_on: 'B' }], generated_at: '2026-11-17T05:17:00Z' }]);
    return json([]);
  };
  return Object.assign(async (url, init) => (extra.route && (await extra.route(url, init))) || fetchDb(url), { seen });
}

test('parseCountries keeps up to 2 known countries, isSample is order-free', () => {
  assert.deepEqual(report.parseCountries('br, pt,XX,US'), ['BR', 'PT']);
  assert.deepEqual(report.parseCountries(''), []);
  assert.ok(report.isSample(['PT', 'BR']));
  assert.ok(!report.isSample(['BR']));
});

test('wikipedia skips home pages, namespaces and adult sites, and finds rising pages', () => {
  const w = report.wikipedia(WIKI, NOW);
  assert.deepEqual(w.top.map((a) => [a.title, a.views, a.days]), [['Lula', 1700, 2], ['Halloween', 500, 1]]);
  assert.deepEqual(w.rising.map((a) => a.title), ['Halloween']);
  assert.equal(w.top[0].link, 'https://pt.wikipedia.org/wiki/Lula');
});

test('newsFocus and partners turn GDELT counts into shares and other countries', () => {
  assert.deepEqual(report.newsFocus([{ root_code: '04', articles: 60 }, { root_code: '19', articles: 40 }]),
    { articles: 100, cooperation_pct: 60, topics: [{ topic: 'Talks and meetings', pct: 60 }, { topic: 'Fighting', pct: 40 }] });
  assert.deepEqual(report.partners([{ actor1_cc: 'BR', actor2_cc: 'PT', articles: 7 }, { actor1_cc: 'US', actor2_cc: 'BR', articles: 9 }], 'BR'),
    [{ country: 'US', articles: 9 }, { country: 'PT', articles: 7 }]);
});

test('a comparison report uses open data only and adds what both countries share', async () => {
  const f = db();
  const out = await report.buildReport(report.rest(env, f), ['BR', 'PT'], NOW);
  assert.equal(out.countries.length, 2);
  assert.equal(out.shared.articles_together, 7);
  assert.deepEqual(out.shared.read_in_both.map((a) => a.title), ['Lula', 'Halloween']);
  assert.equal(out.countries[0].ideas[0].title, 'T');
  assert.ok(!('all_partners' in out.countries[0]));
  assert.ok(f.seen.every((u) => /wiki_top_daily|gdelt_|report_insights|trends_daily|holidays/.test(u)), 'no YouTube or news tables');
  assert.deepEqual(out.countries[0].searches, { top: [], days: 0 });
  assert.deepEqual(out.countries[0].holidays, []);
});

test('GET serves only the Brazil vs Portugal sample', async () => {
  const handler = createHandler({ env, fetch: db(), now: () => NOW.getTime() });
  let res = mockRes();
  await handler({ method: 'GET', query: { country: 'US' }, headers: {} }, res);
  assert.equal(res.statusCode, 403);
  res = mockRes();
  await handler({ method: 'GET', query: { country: 'PT', compare: 'BR' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sample, true);
});

// Fake Lemon Squeezy License API.
function lemon(state) {
  const calls = [];
  const route = async (url, init) => {
    if (!url.startsWith('https://api.lemonsqueezy.com/')) return null;
    const p = Object.fromEntries(new URLSearchParams(init && init.body ? init.body : ''));
    calls.push({ url, p, auth: init && init.headers && init.headers.Authorization });
    const meta = { store_id: state.store || 11, product_id: 22, customer_email: 'buyer@example.com' };
    const lk = { id: 5, status: state.status || (state.inst ? 'active' : 'inactive'), key: KEY, activation_usage: state.inst ? 1 : 0, expires_at: '2027-11-20T12:00:00Z' };
    if (url.endsWith('/licenses/validate')) {
      if (p.license_key !== KEY) return json({ valid: false, error: 'license_key not found.', license_key: null }, 404);
      return json({ valid: true, error: null, license_key: lk, instance: state.inst && p.instance_id === state.inst.id ? state.inst : null, meta });
    }
    if (url.endsWith('/licenses/activate')) {
      state.inst = { id: 'inst-123456', name: p.instance_name };
      return json({ activated: true, error: null, license_key: lk, instance: state.inst, meta });
    }
    if (url.includes('/license-key-instances')) return json({ data: state.inst ? [{ attributes: { identifier: state.inst.id, name: state.inst.name } }] : [] });
    return json({}, 404);
  };
  return { calls, route };
}
async function post(state, body, envOver = {}) {
  const ls = lemon(state);
  const handler = createHandler({ env: { ...env, ...envOver }, fetch: db({ route: ls.route }), now: () => NOW.getTime() });
  const res = mockRes();
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': `10.1.0.${++ipSeq}` } }, res);
  return { res, calls: ls.calls };
}

test('first visit asks for countries, then activates the key with them and returns the report', async () => {
  const state = {};
  let { res } = await post(state, { key: KEY });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.need_countries, true);
  ({ res } = await post(state, { key: KEY, countries: 'BR,PT' }));
  assert.equal(res.statusCode, 200);
  assert.equal(state.inst.name, 'BR,PT');
  assert.equal(res.body.instance_id, 'inst-123456');
  assert.deepEqual(res.body.countries.map((c) => c.country), ['BR', 'PT']);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(res.body).includes('buyer@example.com'), 'never returns the buyer email');
});

test('later visits use the saved activation; countries can\'t be changed', async () => {
  const state = { inst: { id: 'inst-123456', name: 'US' } };
  const { res, calls } = await post(state, { key: KEY, instance: 'inst-123456', countries: 'BR,PT' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.countries.map((c) => c.country), ['US']);
  assert.ok(!calls.some((c) => c.url.endsWith('/activate')));
});

test('a used key on a new browser reopens only with the API key', async () => {
  const state = { inst: { id: 'inst-123456', name: 'JP' } };
  let { res } = await post(state, { key: KEY });
  assert.equal(res.statusCode, 409);
  assert.ok(!res.body.need_countries);
  let calls;
  ({ res, calls } = await post(state, { key: KEY }, { LEMONSQUEEZY_API_KEY: 'lsk' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.countries.map((c) => c.country), ['JP']);
  assert.equal(calls.find((c) => c.url.includes('license-key-instances')).auth, 'Bearer lsk');
});

test('refuses unknown, other-store, refunded and expired keys, and works only once sales are set up', async () => {
  assert.equal((await post({}, { key: 'aaaaaaaa-bbbb' })).res.statusCode, 404);
  assert.equal((await post({ store: 99 }, { key: KEY })).res.statusCode, 404);
  assert.equal((await post({ status: 'disabled' }, { key: KEY })).res.statusCode, 403);
  assert.equal((await post({ status: 'expired' }, { key: KEY })).res.statusCode, 403);
  assert.equal((await post({}, { key: 'x' })).res.statusCode, 400);
  assert.equal((await post({}, { key: KEY }, { LEMONSQUEEZY_STORE_ID: '' })).res.statusCode, 503);
});

test('ideas routine sends only open data to Gemini and saves cleaned ideas', async () => {
  const prompts = [];
  const saved = [];
  const f = db({ route: async (url, init) => (url.includes('report_insights?on_conflict') ? (saved.push(JSON.parse(init.body)), json(null, 201)) : null) });
  const out = await ideas.run({ ...env, GEMINI_API_KEY: 'g' }, {
    fetch: f, log: () => {}, countries: ['BR'],
    ask: async (p) => { prompts.push(p); return [1, 2, 3, 4, 5, 6].map((n) => ({ title: `Idea ${n}`, idea: 'Do it', based_on: 'Lula' })); },
  });
  assert.deepEqual(out.done, ['BR']);
  assert.equal(saved[0].ideas.length, 5);
  assert.match(prompts[0], /Wikipedia/);
  assert.doesNotMatch(prompts[0], /youtube/i);
});

test('ideas routine fails the job when most countries fail', async () => {
  await assert.rejects(ideas.run({ ...env, GEMINI_API_KEY: 'g' }, { fetch: db(), log: () => {}, countries: ['BR'], ask: async () => [] }), /Most countries failed/);
});

// Fake Gumroad License API.
const GKEY = 'A1B2C3D4-E5F60718-9ABCDEF0-1234ABCD';
const genv = { GUMROAD_PRODUCT_ID: 'gp==', REPORT_TOKEN_SECRET: 'test-secret' };
async function gpost(state, body, envOver = {}) {
  const calls = [];
  const route = async (url, init) => {
    if (!url.startsWith('https://api.gumroad.com/')) return null;
    const p = Object.fromEntries(new URLSearchParams(init.body));
    calls.push(p);
    if (p.license_key !== GKEY || p.product_id !== 'gp==') return json({ success: false, message: 'That license does not exist for the provided product.' }, 404);
    if (p.increment_uses_count === 'true') state.uses = (state.uses || 0) + 1;
    return json({ success: true, uses: state.uses || 0, purchase: { email: 'buyer@example.com', refunded: !!state.refunded, disputed: false, chargebacked: false } });
  };
  const handler = createHandler({ env: { ...env, ...genv, ...envOver }, fetch: db({ route }), now: () => NOW.getTime() });
  const res = mockRes();
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': `10.2.0.${++ipSeq}` } }, res);
  return { res, calls };
}

test('Gumroad key: first visit picks countries once, then a signed instance reopens them', async () => {
  const state = {};
  let { res } = await gpost(state, { key: GKEY });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.need_countries, true);
  ({ res } = await gpost(state, { key: GKEY, countries: 'BR,PT' }));
  assert.equal(res.statusCode, 200);
  assert.equal(state.uses, 1);
  assert.match(res.body.instance_id, /^g-BR-PT-[0-9a-f]{32}$/);
  assert.deepEqual(res.body.countries.map((c) => c.country), ['BR', 'PT']);
  assert.ok(!JSON.stringify(res.body).includes('buyer@example.com'));
  const inst = res.body.instance_id;
  let calls;
  ({ res, calls } = await gpost(state, { key: GKEY, instance: inst, countries: 'US' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.countries.map((c) => c.country), ['BR', 'PT']);
  assert.ok(calls.every((c) => c.increment_uses_count === 'false'));
  assert.equal(state.uses, 1);
});

test('Gumroad key: forged instance, used key elsewhere, unknown and refunded keys are refused', async () => {
  const state = { uses: 1 };
  assert.equal((await gpost(state, { key: GKEY, instance: `g-US-${'0'.repeat(32)}`, countries: 'US' })).res.statusCode, 409);
  assert.equal((await gpost(state, { key: GKEY, countries: 'US' })).res.statusCode, 409);
  assert.equal((await gpost({}, { key: 'ZZZZZZZZ-ZZZZZZZZ' })).res.statusCode, 404);
  assert.equal((await gpost({ refunded: true }, { key: GKEY })).res.statusCode, 403);
  assert.equal((await gpost({}, { key: GKEY }, { GUMROAD_PRODUCT_ID: '' })).res.statusCode, 404);
  assert.equal((await gpost({}, { key: GKEY }, { GUMROAD_PRODUCT_ID: '', LEMONSQUEEZY_STORE_ID: '' })).res.statusCode, 503);
});

// Fake Wikipedia / Wikimedia for artist and company reports.
const entity = require('../lib/entity-report');
function wikiRoute(url) {
  if (url.startsWith('https://wikimedia.org/api/rest_v1/metrics/pageviews/')) {
    const title = decodeURIComponent(url.split('/user/')[1].split('/')[0]);
    const base = title.startsWith('Anitta') ? 100 : 10;
    const items = Array.from({ length: 60 }, (_, i) => ({ timestamp: `${new Date(Date.UTC(2026, 8, 21) + i * 864e5).toISOString().slice(0, 10).replace(/-/g, '')}00`, views: base + (i >= 30 ? 10 : 0) }));
    return json({ items });
  }
  if (!url.startsWith('https://en.wikipedia.org/w/api.php')) return null;
  const q = Object.fromEntries(new URL(url).searchParams);
  if (q.list === 'search') return json({ query: { search: [{ title: 'Ludmilla (singer)' }, { title: 'Anitta discography' }, { title: 'Rio de Janeiro' }] } });
  if (q.prop === 'langlinks') return json({ query: { pages: [{ title: q.titles, langlinks: [{ lang: 'pt', title: q.titles.replace(' (singer)', '') }, { lang: 'xx', title: 'skip' }, { lang: 'yy', title: 'skip' }, { lang: 'zz', title: 'skip' }] }] } });
  if (q.prop === 'revisions') return json({ query: { pages: [{ revisions: [{}, {}, {}] }] } });
  const desc = { 'Anitta (singer)': 'Brazilian singer', 'Ludmilla (singer)': 'Brazilian singer', 'Rio de Janeiro': 'City in Brazil' };
  return json({ query: { pages: q.titles.split('|').filter((t) => desc[t]).map((t) => ({ title: t, description: desc[t] })) } });
}

test('parseChoice keeps a subject and up to 3 different peers', () => {
  assert.deepEqual(entity.parseChoice({ subject: ' Nike,_Inc. ', peers: ['Adidas', 'Nike, Inc.', 'Puma', 'Asics', 'Fila'] }), { subject: 'Nike, Inc.', peers: ['Adidas', 'Puma', 'Asics'] });
  assert.equal(entity.parseChoice({ subject: '' }), null);
  assert.equal(entity.parseChoice('x'), null);
});

test('artist sample: Wikipedia data only, similar artists picked by type', async () => {
  const f = db({ route: async (url) => wikiRoute(url) });
  const handler = createHandler({ env, fetch: f, now: () => NOW.getTime() });
  const res = mockRes();
  await handler({ method: 'GET', query: { type: 'artist' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sample, true);
  assert.equal(res.body.subject.title, 'Anitta (singer)');
  assert.deepEqual(res.body.peers.map((p) => p.title), ['Ludmilla (singer)']);
  assert.equal(res.body.subject.views, 3300);
  assert.equal(res.body.subject.change_pct, 10);
  assert.equal(res.body.subject.rank, 1);
  assert.equal(res.body.subject.languages, 5);
  assert.deepEqual(res.body.languages.map((l) => l.lang).sort(), ['en', 'pt']);
  assert.ok(f.seen.every((u) => !/youtube|gdelt|news/i.test(u)));
});

test('Gumroad artist key: picks the artist once, then a signed instance reopens it', async () => {
  const state = {};
  const aenv = { GUMROAD_ARTIST_PRODUCT_ID: 'ga==' };
  const route = async (url, init) => {
    const w = wikiRoute(url);
    if (w) return w;
    if (!url.startsWith('https://api.gumroad.com/')) return null;
    const p = Object.fromEntries(new URLSearchParams(init.body));
    if (p.license_key !== GKEY || p.product_id !== 'ga==') return json({ success: false }, 404);
    if (p.increment_uses_count === 'true') state.uses = (state.uses || 0) + 1;
    return json({ success: true, uses: state.uses || 0, purchase: { email: 'buyer@example.com' } });
  };
  const call = async (body) => {
    const handler = createHandler({ env: { ...env, ...genv, ...aenv }, fetch: db({ route }), now: () => NOW.getTime() });
    const res = mockRes();
    await handler({ method: 'POST', body, headers: { 'x-forwarded-for': `10.3.0.${++ipSeq}` } }, res);
    return res;
  };
  let res = await call({ key: GKEY });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.need_choice, 'artist');
  res = await call({ key: GKEY, choice: { subject: 'Nobody Here' } });
  assert.equal(res.statusCode, 404);
  assert.equal(state.uses, undefined, 'a wrong name does not use up the key');
  res = await call({ key: GKEY, choice: { subject: 'Anitta (singer)', peers: ['Ludmilla (singer)'] } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.confirm.title, 'Anitta (singer)', 'a typed name is confirmed before the key is used');
  assert.equal(state.uses, undefined);
  res = await call({ key: GKEY, choice: { subject: 'Anitta (singer)', peers: ['Ludmilla (singer)'], confirm: true } });
  assert.equal(res.statusCode, 200);
  assert.equal(state.uses, 1);
  assert.match(res.body.instance_id, /^g-a\.[A-Za-z0-9_-]+\.[0-9a-f]{32}$/);
  assert.equal(res.body.peers_chosen, true);
  assert.ok(!JSON.stringify(res.body).includes('buyer@example.com'));
  const inst = res.body.instance_id;
  res = await call({ key: GKEY, instance: inst, choice: { subject: 'Someone Else' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subject.title, 'Anitta (singer)');
  assert.equal(state.uses, 1);
  res = await call({ key: GKEY, instance: inst.replace(/.$/, (c) => (c === '0' ? '1' : '0')) });
  assert.equal(res.statusCode, 409);
});

test('country report adds World Bank GDP by year when available', async () => {
  const wb = (id, cc, date, value) => ({ indicator: { id }, country: { id: cc }, date, value });
  const rows = ['2021', '2022', '2023', '2024'].flatMap((y, i) => [wb('NY.GDP.MKTP.CD', 'BR', y, 1e12 + i * 1e11), wb('NY.GDP.PCAP.CD', 'BR', y, 9000 + i * 100), wb('NY.GDP.MKTP.KD.ZG', 'BR', y, i ? 2.345 : null)]);
  const f = db({ route: async (url) => (url.startsWith('https://api.worldbank.org/') ? json([{}, rows]) : null) });
  const out = await report.buildReport(report.rest(env, f), ['BR', 'PT'], NOW, { fetchImpl: f });
  const br = out.countries.find((c) => c.country === 'BR');
  assert.deepEqual(br.gdp.map((g) => g.year), [2021, 2022, 2023, 2024]);
  assert.deepEqual(br.gdp[3], { year: 2024, usd: 1.3e12, per_person: 9300, growth_pct: 2.3 });
  assert.equal(br.gdp[0].growth_pct, undefined);
  assert.equal(out.countries.find((c) => c.country === 'PT').gdp, undefined);
});

test('company report ranks the subject in its narrowest shared Wikipedia category', async () => {
  const brands = ['Adidas', 'Puma (brand)', 'Asics', 'Reebok', 'Fila (company)'];
  const route = async (url) => {
    if (url.startsWith('https://wikimedia.org/api/rest_v1/metrics/pageviews/')) {
      const title = decodeURIComponent(url.split('/user/')[1].split('/')[0]).replace(/_/g, ' ');
      const base = title === 'Nike, Inc.' ? 500 : 100 - brands.indexOf(title) * 10;
      return json({ items: Array.from({ length: 60 }, (_, i) => ({ timestamp: `${new Date(Date.UTC(2026, 8, 21) + i * 864e5).toISOString().slice(0, 10).replace(/-/g, '')}00`, views: base })) });
    }
    if (!url.startsWith('https://en.wikipedia.org/w/api.php')) return null;
    const q = Object.fromEntries(new URL(url).searchParams);
    if (q.list === 'search') return json({ query: { search: brands.map((title) => ({ title })) } });
    if (q.prop === 'categories' && q.clcategories) return json({ query: { pages: q.titles.split('|').map((title) => ({ title, categories: [{ title: 'Category:Athletic shoe brands' }, { title: 'Category:Shoe brands' }] })) } });
    if (q.prop === 'categories') return json({ query: { pages: [{ title: q.titles, categories: ['1964 establishments in Oregon', 'Athletic shoe brands', 'Shoe brands', 'Nike brands'].map((c) => ({ title: `Category:${c}` })) }] } });
    if (q.prop === 'categoryinfo') return json({ query: { pages: [{ title: 'Category:Athletic shoe brands', categoryinfo: { pages: 81 } }, { title: 'Category:Shoe brands', categoryinfo: { pages: 210 } }] } });
    if (q.generator === 'categorymembers') return json({ query: { pages: [{ title: 'Nike, Inc.', description: 'American athletic equipment company', length: 9e4 }, ...brands.map((title, i) => ({ title, description: 'sportswear brand', length: 5e4 - i })), { title: 'Air Jordan', description: 'Basketball shoe line', length: 6e4 }] } });
    if (q.prop === 'langlinks') return json({ query: { pages: [{ title: q.titles, langlinks: q.titles.startsWith('Category:') ? [{ lang: 'pt', title: 'Categoria:Marcas de calçado esportivo' }] : [] }] } });
    if (q.prop === 'revisions') return json({ query: { pages: [{ revisions: [] }] } });
    return json({ query: { pages: q.titles.split('|').map((title) => ({ title, description: 'American athletic equipment company' })) } });
  };
  const body = await entity.buildEntityReport(null, 'company', { subject: 'Nike, Inc.', peers: [] }, { fetchImpl: route, now: NOW });
  assert.equal(body.field.name, 'Athletic shoe brands');
  assert.equal(body.field.names.pt, 'Marcas de calçado esportivo');
  assert.equal(body.field.rank, 1);
  assert.equal(body.field.compared, 6);
  assert.ok(!body.field.ranked.some((p) => p.title === 'Air Jordan'));
  assert.deepEqual(body.peers.map((p) => p.title), ['Adidas', 'Puma (brand)', 'Asics']);
});

test('searches adds up Google Trends traffic and trending days per search', () => {
  const s = report.searches([{ day: '2026-11-05', query: 'Flamengo', traffic: 500 }, { day: '2026-11-06', query: 'flamengo', traffic: 2000 }, { day: '2026-11-06', query: 'Enem', traffic: 1000 }]);
  assert.deepEqual(s.top, [{ query: 'Flamengo', days: 2, traffic: 2500 }, { query: 'Enem', days: 1, traffic: 1000 }]);
  assert.equal(s.days, 2);
});

test('typed names resolve to the right page: "Nike" -> Nike, Inc.; "Apple" as a company -> Apple Inc.', async () => {
  const pagesFor = { Nike: { title: 'Nike', description: 'Topics referred to by the same term', pageprops: { disambiguation: '' } }, Apple: { title: 'Apple', description: 'Edible fruit' }, Shakira: { title: 'Shakira', description: 'Colombian singer-songwriter' } };
  const results = {
    Nike: [{ title: 'Nike (mythology)', description: 'Greek goddess of victory' }, { title: 'Nike, Inc.', description: 'American athletic footwear and apparel company' }, { title: 'Nike', description: 'Topics referred to by the same term', pageprops: {} }],
    Apple: [{ title: 'Apple', description: 'Edible fruit' }, { title: 'Apple Inc.', description: 'American multinational technology company' }, { title: 'List of apple cultivars', description: '' }],
    Shakira: [{ title: 'Shakira', description: 'Colombian singer-songwriter' }, { title: 'Shakira discography', description: '' }],
  };
  const fetchImpl = async (url) => {
    const q = Object.fromEntries(new URL(url).searchParams);
    const body = q.generator === 'search' ? { query: { pages: results[q.gsrsearch].map((p, i) => ({ ...p, index: i + 1 })) } } : { query: { pages: [pagesFor[q.titles]] } };
    return { ok: true, status: 200, json: async () => body };
  };
  const nike = await entity.resolveSubject('company', 'Nike', { fetchImpl });
  assert.equal(nike.page.title, 'Nike, Inc.');
  assert.ok(!nike.options.some((o) => o.title === 'Nike' || o.title === 'Nike, Inc.'));
  const apple = await entity.resolveSubject('company', 'Apple', { fetchImpl });
  assert.equal(apple.page.title, 'Apple Inc.');
  assert.deepEqual(apple.options.map((o) => o.title), ['Apple']);
  const shakira = await entity.resolveSubject('artist', 'Shakira', { fetchImpl });
  assert.equal(shakira.page.title, 'Shakira');
});

// Fake Wikipedia -> Wikidata (SEC CIK, stock exchange) -> SEC EDGAR for the company business section.
function secRoute(url) {
  const u = new URL(url);
  const q = Object.fromEntries(u.searchParams);
  if (u.host === 'en.wikipedia.org') return json({ query: { pages: [{ title: q.titles, pageprops: q.titles === 'Nike, Inc.' ? { wikibase_item: 'Q483915' } : { wikibase_item: 'Q147662' } }] } });
  if (u.host === 'www.wikidata.org' && q.action === 'wbgetclaims') {
    if (q.entity !== 'Q483915') return json({ claims: {} });
    if (q.property === 'P5531') return json({ claims: { P5531: [{ rank: 'normal', mainsnak: { datavalue: { value: '0000320187' } } }] } });
    return json({ claims: { P414: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q13677' } } }, qualifiers: { P249: [{ datavalue: { value: 'NKE' } }] } }] } });
  }
  if (u.host === 'www.wikidata.org') return json({ entities: { Q13677: { labels: { en: { value: 'New York Stock Exchange' } } } } });
  if (u.host === 'data.sec.gov') {
    const c = u.pathname.split('/').pop().replace('.json', '');
    const fy = (y, val, form = '10-K') => ({ start: `${y - 1}-06-01`, end: `${y}-05-31`, val, form, filed: `${y}-07-20` });
    if (c === 'SalesRevenueNet') return json({ units: { USD: [fy(2015, 30e9), fy(2016, 32e9)] } });
    if (c === 'RevenueFromContractWithCustomerExcludingAssessedTax') return json({ units: { USD: [fy(2017, 34e9), fy(2018, 36e9), { ...fy(2018, 9e9), start: '2018-03-01' }, fy(2019, 39e9, '10-Q')] } });
    if (c === 'NetIncomeLoss') return json({ units: { USD: [fy(2016, 3.8e9), fy(2017, 4.2e9), fy(2018, -1e9)] } });
    return json({}, 404);
  }
  return json({}, 404);
}

test('company business: yearly SEC sales and profit via Wikidata, none for companies without SEC filings', async () => {
  const get = async (url) => { const r = secRoute(url); return r.status === 404 ? null : r.json(); };
  const nike = await entity.business(get, 'Nike, Inc.');
  assert.equal(nike.ticker, 'NKE');
  assert.equal(nike.exchange, 'New York Stock Exchange');
  assert.deepEqual(nike.years, [{ year: 2015, revenue: 30e9, profit: null }, { year: 2016, revenue: 32e9, profit: 3.8e9 }, { year: 2017, revenue: 34e9, profit: 4.2e9 }, { year: 2018, revenue: 36e9, profit: -1e9 }]);
  assert.equal(await entity.business(get, 'Zara (retailer)'), null);
});

test('company business: Like Polling\'s saved history comes before the live SEC', async () => {
  const seen = [];
  const get = async (url) => { seen.push(url); const r = secRoute(url); return r.status === 404 ? null : r.json(); };
  const rest = async (path) => (path.startsWith('company_financials') && path.includes('cik=eq.320187') && path.includes('offset=0') ? [{ year: 2026, revenue: 46e9, profit: 3e9 }, { year: 2025, revenue: 46e9, profit: null }, { year: 2024, revenue: 51e9, profit: 5e9 }] : []);
  const nike = await entity.business(get, 'Nike, Inc.', rest);
  assert.deepEqual(nike.years.map((y) => y.year), [2024, 2025, 2026]);
  assert.equal(nike.years[1].profit, null);
  assert.ok(!seen.some((u) => u.includes('data.sec.gov')));
});
