// POST /api/visit {"kind":"visit","item":"home"} or {"kind":"buy","item":"country"}: counts one page visit
// or Gumroad "Buy" click for today, per visitor country (Vercel's x-vercel-ip-country header).
// Answers with the visitor's country code. No IP, cookie or user data is stored. Only the pages and products below are counted.
'use strict';
const { allowed } = require('./search-count');

const ITEMS = {
  visit: ['home', 'pulse', 'services', 'report', 'ad'],
  buy: ['country', 'artist', 'company', 'ad'],
};

function parseBody(body) {
  if (typeof body === 'string') { try { return JSON.parse(body); } catch { return {}; } }
  return body || {};
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const fetchImpl = deps.fetch || fetch;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    const { kind, item } = parseBody(req.body);
    if (!ITEMS[kind] || !ITEMS[kind].includes(item)) return res.status(400).json({ error: 'Unknown kind or item.' });
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return res.status(500).json({ error: 'Server is missing env vars.' });
    const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (!allowed(`v|${ip}`)) return res.status(429).json({ error: 'Too many requests.' });
    const geo = String(req.headers?.['x-vercel-ip-country'] || '').toUpperCase();
    const country = /^[A-Z]{2}$/.test(geo) ? geo : 'XX';
    const key = env.SUPABASE_KEY.trim();
    try {
      const r = await fetchImpl(`${env.SUPABASE_URL.trim()}/rest/v1/rpc/bump_interest`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_country: country, p_kind: kind, p_item: item }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ country }); // lets the page show prices in the visitor's currency
    } catch (err) {
      console.error('[visit]', err.message);
      return res.status(502).json({ error: 'Count not saved.' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.ITEMS = ITEMS;
