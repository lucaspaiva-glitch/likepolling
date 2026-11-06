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
  assert.ok(f.seen.every((u) => /wiki_top_daily|gdelt_|report_insights/.test(u)), 'no YouTube or news tables');
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
