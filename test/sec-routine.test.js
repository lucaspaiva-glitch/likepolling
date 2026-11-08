const test = require('node:test');
const assert = require('node:assert/strict');
const sec = require('../scripts/sec-routine');

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test('merge keeps one row per company and business year, sales by concept order', () => {
  const rows = sec.merge([
    { field: 'profit', rank: 0, data: [{ cik: 1, entityName: 'A', end: '2025-05-31', val: 10 }, { cik: 'x', end: '2025-05-31', val: 1 }] },
    { field: 'revenue', rank: 1, data: [{ cik: 1, entityName: 'A', end: '2025-05-31', val: 90 }, { cik: 2, entityName: 'B', end: '2024-12-31', val: 50 }] },
    { field: 'revenue', rank: 0, data: [{ cik: 1, entityName: 'A', end: '2025-05-31', val: 100 }] },
  ]);
  assert.deepEqual(rows, [
    { cik: 1, year: 2025, name: 'A', period_end: '2025-05-31', revenue: 100, profit: 10 },
    { cik: 2, year: 2024, name: 'B', period_end: '2024-12-31', revenue: 50, profit: null },
  ]);
});

test('run reads 10 years of SEC frames and upserts them in chunks', async () => {
  const urls = [], saved = [];
  const fetch = async (url, init) => {
    urls.push(url);
    if (url.includes('/rpc/upsert_company_financials')) { const p = JSON.parse(init.body).payload; saved.push(...p); return json(p.length); }
    const cy = Number(url.match(/CY(\d{4})/)[1]);
    return json({ data: Array.from({ length: 150 }, (_, i) => ({ cik: i + 1, entityName: `Co ${i}`, end: `${cy}-12-31`, val: 1000 + i })) });
  };
  const out = await sec.run({ SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'k' }, { fetch, sleep: async () => {}, log: () => {}, now: new Date('2026-11-20T00:00:00Z') });
  assert.equal(urls.filter((u) => u.includes('data.sec.gov')).length, 50);
  assert.ok(urls.some((u) => u.endsWith('/NetIncomeLoss/USD/CY2016.json')) && urls.some((u) => u.endsWith('/Revenues/USD/CY2025.json')));
  assert.equal(out.companies, 150);
  assert.equal(out.rows, 1500);
  assert.equal(saved.length, 1500);
});
