const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, checkText } = require('../api/ad');

const NOW = Date.parse('2026-10-20T12:00:00Z');
const KEY = 'AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD';
const env = { SUPABASE_URL: 'https://db.example', SUPABASE_KEY: 'k', GUMROAD_AD_PRODUCT_ID: 'ad', GEMINI_API_KEY: 'g', AD_ADMIN_TOKEN: 'secret-admin' };

function mockRes() {
  return { headers: {}, statusCode: 200, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

// Fake world: Supabase rows in memory, Gumroad, the advertiser's site and Gemini.
function world({ verdict = 'safe', site = '<title>Acme Coffee</title><p>Acme roasts coffee</p>', purchase = {}, uses = 0 } = {}) {
  const rows = []; let id = 0; const w = { rows, gumroad: [] };
  const filt = (qs) => (r) => [...qs].every(([k, v]) => {
    if (['order', 'limit', 'select'].includes(k)) return true;
    const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
    return op === 'eq' ? String(r[k]) === val : op === 'lt' ? r[k] < val : true;
  });
  w.fetch = async (url, opt = {}) => {
    const u = String(url);
    const ok = (b, status = 200) => ({ ok: status < 400, status, url: u, json: async () => b, text: async () => b });
    if (u.startsWith('https://api.gumroad.com')) { w.gumroad.push(String(opt.body)); return ok({ success: new URLSearchParams(opt.body).get('license_key') === KEY, uses, purchase: { refunded: false, ...purchase } }); }
    if (u.includes('generativelanguage')) return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict, reason: 'test' }) }] } }] });
    if (u.startsWith('https://db.example/rest/v1/sponsors')) {
      const qs = new URL(u).searchParams; const match = rows.filter(filt(qs));
      if (opt.method === 'POST') { const r = { id: ++id, created_at: new Date(NOW + id).toISOString(), starts_at: null, ends_at: null, ...JSON.parse(opt.body) }; rows.push(r); return ok([r]); }
      if (opt.method === 'PATCH') { match.forEach((r) => Object.assign(r, JSON.parse(opt.body))); return ok(match); }
      const sorted = qs.get('order') ? [...match].sort((a, b) => String(a[qs.get('order').split('.')[0]]).localeCompare(String(b[qs.get('order').split('.')[0]]))) : match;
      return ok(sorted.slice(0, Number(qs.get('limit')) || 99));
    }
    if (u.startsWith('https://acme.example')) return ok(site);
    throw new Error(`unexpected ${u}`);
  };
  return w;
}
const card = (o = {}) => ({ key: KEY, brand: 'Acme Coffee', kind: 'Coffee shop', website: 'acme.example', tagline: 'Fresh beans every week', instagram: '@acme.coffee', ...o });
async function call(w, method, body, query = {}, now = NOW) {
  const res = mockRes();
  await createHandler({ env, fetch: w.fetch, now: () => now })({ method, body, query }, res);
  return res;
}

test('text rules block bogus and unsafe cards', () => {
  for (const [o, re] of [
    [{ brand: 'BetKing' }, /gambling/], [{ brand: 'Bet365' }, /gambling/], [{ tagline: 'Best casino bonus' }, /gambling/],
    [{ tagline: 'Visit www.acme.com' }, /links/], [{ tagline: 'Hot deals 🔥' }, /emojis/], [{ tagline: 'BUY NOW CHEAP' }, /CAPS/],
    [{ website: 'bit.ly/abc' }, /shortener/], [{ website: 'http://acme.example' }, /https/], [{ brand: 'A' }, /2 to 24/],
  ]) assert.throws(() => checkText(card(o)), re);
  for (const brand of ['BetterHelp', 'Alphabet', 'Machu Picchu Energy']) assert.equal(checkText(card({ brand })).brand, brand);
  assert.equal(checkText(card()).website, 'https://acme.example');
  assert.equal(checkText(card()).instagram, 'acme.coffee');
});

test('a safe paid card goes live for 7 days; 6 wagons fill, the 7th waits and takes over', async () => {
  const w = world();
  let r = await call(w, 'POST', card());
  assert.equal(r.statusCode, 200); assert.equal(r.body.status, 'live');
  assert.equal(Date.parse(r.body.ends_at) - NOW, 7 * 864e5);
  assert.match(w.gumroad.at(-1), /increment_uses_count=true/);
  assert.notEqual(w.rows[0].key_hash, KEY);
  assert.equal((await call(w, 'POST', card())).statusCode, 409);
  r = await call(w, 'GET');
  assert.deepEqual(r.body.wagons, { free: 5, next_at: null }); assert.deepEqual(r.body.planes, { free: 10, next_at: null });
  assert.deepEqual(r.body.slots, { wagon: 6, plane: 10 });
  ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].forEach((brand, i) => w.rows.push({ id: 90 + i, key_hash: brand, brand, kind: 'Shop', website: 'https://b.example', status: 'queued', created_at: new Date(NOW + 50 + i).toISOString() }));
  r = await call(w, 'GET', undefined, {}, NOW + 864e5);
  assert.deepEqual(r.body.live.map((a) => a.brand), ['Acme Coffee', 'B1', 'B2', 'B3', 'B4', 'B5']);
  assert.equal(r.body.live[0].key_hash, undefined);
  assert.deepEqual(r.body.wagons, { free: 0, next_at: new Date(NOW + 8 * 864e5).toISOString() }); assert.equal(r.body.planes.free, 10);
  r = await call(w, 'GET', undefined, {}, NOW + 7.5 * 864e5);
  assert.deepEqual(r.body.live.map((a) => a.brand), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  assert.equal(w.rows[0].status, 'done');
});

test('cards are held only when Gemini gives no answer; unsafe ones and bad keys are refused', async () => {
  let w = world({ verdict: 'unclear' });
  let r = await call(w, 'POST', card());
  assert.equal(r.body.status, 'held');
  assert.deepEqual((await call(w, 'GET')).body.live, []);
  assert.equal((await call(w, 'GET', undefined, { admin: 'wrong' })).statusCode, 403);
  r = await call(w, 'POST', { admin: 'secret-admin', id: 1, action: 'approve' });
  assert.equal(r.body.ads[0].status, 'live');
  r = await call(w, 'POST', { admin: 'secret-admin', id: 1, action: 'remove' });
  assert.equal(r.body.ads[0].status, 'removed');

  w = world({ verdict: 'unsafe' });
  assert.equal((await call(w, 'POST', card())).statusCode, 422); assert.equal(w.rows.length, 0);
  assert.equal((await call(world(), 'POST', card({ key: 'ZZZZZZZZ-BBBBBBBB-CCCCCCCC-DDDDDDDD' }))).statusCode, 404);
  assert.equal((await call(world({ purchase: { refunded: true } }), 'POST', card())).statusCode, 403);
  assert.equal((await call(world({ uses: 1 }), 'POST', card())).statusCode, 409);
  r = await call(world({ site: '<title>Something else</title>' }), 'POST', card());
  assert.equal(r.statusCode, 422); assert.match(r.body.error, /brand name/);
});

test('the Gumroad option picks the lane: 6 Wagon spots, 10 Plane spots', async () => {
  let w = world({ purchase: { variants: '(Plane)' } });
  assert.equal((await call(w, 'POST', card())).body.placement, 'plane');
  let r = await call(w, 'GET');
  assert.equal(r.body.live[0].placement, 'plane'); assert.equal(r.body.planes.free, 9); assert.equal(r.body.wagons.free, 6);
  w = world({ purchase: { variants: '(Wagon)' } });
  assert.equal((await call(w, 'POST', card())).body.placement, 'wagon');
  r = await call(w, 'GET');
  assert.equal(r.body.planes.free, 10); assert.equal(r.body.wagons.free, 5);
});

test('video: YouTube links become the 11-character id; other links are refused', () => {
  const { videoId, checkText } = require('../api/ad.js');
  for (const u of ['https://www.youtube.com/watch?v=QMV0eP3Aiwo&t=3', 'youtu.be/QMV0eP3Aiwo', 'https://m.youtube.com/shorts/QMV0eP3Aiwo', 'QMV0eP3Aiwo']) assert.equal(videoId(u), 'QMV0eP3Aiwo');
  assert.equal(videoId(''), '');
  assert.equal(videoId('https://vimeo.com/123'), undefined);
  assert.equal(videoId('https://evil.com/watch?v=QMV0eP3Aiwo'), undefined);
  const card = { brand: 'Acme', kind: 'Coffee shop', website: 'https://acme.com' };
  assert.equal(checkText({ ...card, video: 'https://youtu.be/QMV0eP3Aiwo' }).video, 'QMV0eP3Aiwo');
  assert.throws(() => checkText({ ...card, video: 'https://vimeo.com/123' }), /YouTube link/);
});
