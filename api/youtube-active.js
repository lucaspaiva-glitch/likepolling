// Serves /api/metrics/youtube-active (rewritten in vercel.json): the latest
// modelled snapshot of active YouTube users per country, refreshed by pg_cron
// at 00:00 and 12:00 UTC. Cached at Vercel's edge until the next refresh.
const { createSupabase } = require('./metrics');

const REFRESH_HOURS_UTC = [0, 12];
const BUFFER_S = 120;       // let pg_cron finish before the cache turns over
const LATE_RETRY_S = 300;   // snapshot missed its slot: check again soon
const MAX_AGE_S = 43200;

function lastSlot(now) {
  const d = new Date(now);
  const h = Math.max(...REFRESH_HOURS_UTC.filter((x) => x <= d.getUTCHours()));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h);
}

// Seconds the edge may keep this response: until the next refresh slot, or a
// short retry window if the stored snapshot predates the slot that just passed.
function cacheSeconds(updatedAt, now = Date.now()) {
  const slot = lastSlot(now);
  if (!updatedAt || new Date(updatedAt).getTime() < slot - 60_000) {
    return now - slot > BUFFER_S * 1000 ? LATE_RETRY_S : BUFFER_S;
  }
  const next = slot + 12 * 3600 * 1000;
  return Math.max(60, Math.min(MAX_AGE_S, Math.round((next - now) / 1000) + BUFFER_S));
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const now = deps.now ? deps.now() : Date.now();
    try {
      const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
      if (missing.length) throw Object.assign(new Error(`Server is missing env vars: ${missing.join(', ')}`), { status: 500 });
      const db = deps.db || createSupabase(env);
      const { data, error } = await db
        .from('youtube_active_users')
        .select('country_code, country_name, online_users_estimate, updated_at')
        .order('online_users_estimate', { ascending: false });
      if (error) throw Object.assign(new Error(`Supabase read failed: ${error.message}`), { status: 502 });

      const updatedAt = data.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '') || null;
      const maxAge = cacheSeconds(updatedAt, now);
      res.setHeader('Cache-Control', `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=600`);
      return res.status(200).json({
        updated_at: updatedAt,
        estimate: true,
        countries: data.map((r) => ({ code: r.country_code, name: r.country_name, active: Number(r.online_users_estimate) })),
      });
    } catch (err) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(err.status || 500).json({ error: err.message });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.cacheSeconds = cacheSeconds;
