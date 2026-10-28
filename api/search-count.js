// POST /api/search-count {"channel_id":"UC..."}: counts one channel lookup for today, per visitor
// country (Vercel's x-vercel-ip-country header). No IP or user data is stored; only channels already
// in public.entities are counted (checked inside public.bump_search_count).
'use strict';

const LIMIT_PER_MIN = 20;
const hits = new Map();

// Small per-instance limit so one visitor can't inflate counts quickly.
function allowed(ip, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  const key = `${ip}|${minute}`;
  if (hits.size > 5000) hits.clear();
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  return n <= LIMIT_PER_MIN;
}

function parseBody(body) {
  if (typeof body === 'string') { try { return JSON.parse(body); } catch { return {}; } }
  return body || {};
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const fetchImpl = deps.fetch || fetch;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    const channel = String(parseBody(req.body).channel_id || '');
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(channel)) return res.status(400).json({ error: 'channel_id must be a YouTube channel ID.' });
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return res.status(500).json({ error: 'Server is missing env vars.' });
    const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (!allowed(ip)) return res.status(429).json({ error: 'Too many requests.' });
    const geo = String(req.headers?.['x-vercel-ip-country'] || '').toUpperCase();
    const country = /^[A-Z]{2}$/.test(geo) ? geo : 'XX';
    const key = env.SUPABASE_KEY.trim();
    try {
      const r = await fetchImpl(`${env.SUPABASE_URL.trim()}/rest/v1/rpc/bump_search_count`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_country: country, p_channel: channel }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(204).end();
    } catch (err) {
      console.error('[search-count]', err.message);
      return res.status(502).json({ error: 'Count not saved.' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.allowed = allowed;
