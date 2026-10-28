const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { run, unzipFirst, fileStamps, addEvents, toPayload, yesterday } = require('../scripts/gdelt-routine');

// Builds a one-file zip archive (deflate), like GDELT's.
function zip(name, text) {
  const data = Buffer.from(text);
  const comp = zlib.deflateRawSync(data);
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
  const cdOffset = 30 + n.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + n.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, n, comp, cd, n, eocd]);
}

// One GDELT 2.0 event line (61 columns) with the fields the routine reads.
function event({ a1 = '', a2 = '', root = '04', articles = 1, where = '' }) {
  const f = Array(61).fill('');
  f[7] = a1; f[17] = a2; f[28] = root; f[33] = String(articles); f[53] = where;
  return f.join('\t');
}

test('unzipFirst reads a deflated single-file zip', () => {
  assert.equal(unzipFirst(zip('a.CSV', 'hello\tworld\n')).toString(), 'hello\tworld\n');
  assert.throws(() => unzipFirst(Buffer.from('not a zip at all, definitely not')), /not a zip/);
});

test('fileStamps covers the 96 quarter hours of the day', () => {
  const s = fileStamps('2026-10-27');
  assert.equal(s.length, 96);
  assert.equal(s[0], '20261027000000');
  assert.equal(s[95], '20261027234500');
  assert.equal(yesterday(new Date('2026-01-01T01:00:00Z')), '2025-12-31');
});

test('addEvents maps FIPS/ISO-3 codes to tracked ISO codes and ignores the rest', () => {
  const totals = { countries: new Map(), pairs: new Map() };
  addEvents([
    event({ where: 'PO', root: '04', articles: 3, a1: 'PRT', a2: 'BRA' }),
    event({ where: 'PO', root: '04', articles: 2, a1: 'PRT', a2: 'PRT' }),
    event({ where: 'GM', root: '19', articles: 5 }),
    event({ where: 'XX', root: '04', a1: 'CHN', a2: 'USA' }),
    event({ where: 'UK', root: '--' }),
    'short\tline', '',
  ].join('\n'), totals);
  const { countries, pairs } = toPayload('2026-10-27', totals);
  assert.deepEqual(countries, [
    { day: '2026-10-27', country_code: 'PT', root_code: '04', events: 2, articles: 5 },
    { day: '2026-10-27', country_code: 'DE', root_code: '19', events: 1, articles: 5 },
  ]);
  assert.deepEqual(pairs, [{ day: '2026-10-27', actor1_cc: 'PT', actor2_cc: 'BR', events: 1, articles: 3 }]);
});

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret', DAY: '2026-10-27' };
const file = zip('x.export.CSV', event({ where: 'JA', root: '01', articles: 2 }) + '\n');
const bin = (status, buf = Buffer.alloc(0)) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => buf });

test('run tolerates a few missing files, retries 5xx and writes the totals', async () => {
  let body;
  let fails = 0;
  const fetch = async (url, init) => {
    if (url.includes('/rpc/replace_gdelt_daily')) { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => 2 }; }
    if (url.includes('20261027000000.export') || url.includes('20261027001500.export')) return bin(404);
    if (url.includes('20261027003000.export') && fails++ < 2) return bin(503);
    return bin(200, file);
  };
  const s = await run(env, { fetch, sleep: async () => {}, log: () => {} });
  assert.equal(s.files, 94);
  assert.equal(s.absent, 2);
  assert.deepEqual(body.countries, [{ day: '2026-10-27', country_code: 'JP', root_code: '01', events: 94, articles: 188 }]);
  assert.deepEqual(body.pairs, []);
});

test('run writes nothing when too many files are missing', async () => {
  let wrote = false;
  const fetch = async (url) => {
    if (url.includes('/rpc/')) { wrote = true; return { ok: true, status: 200, json: async () => 0 }; }
    return /\d{8}1\d{5}\.export/.test(url) ? bin(404) : bin(200, file);
  };
  await assert.rejects(run(env, { fetch, sleep: async () => {}, log: () => {} }), /of 96 GDELT files read/);
  assert.equal(wrote, false);
});

test('run rejects a malformed DAY and reports Supabase errors', async () => {
  await assert.rejects(run({ ...env, DAY: '27/10/2026' }, { fetch: async () => {} }), /DAY must be/);
  const fetch = async (url) => url.includes('/rpc/') ? { ok: false, status: 401, json: async () => ({ message: 'no' }) } : bin(200, file);
  await assert.rejects(run(env, { fetch, sleep: async () => {}, log: () => {} }), /Supabase write failed: HTTP 401/);
});
