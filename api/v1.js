// api/v1.js: Like Polling's shared read-only API (Creators + extension, future AI connector).
// Routed by vercel.json: /api/v1/<route> -> /api/v1?route=<route>
//   GET /api/v1/channel?handle=@x | ?id=UC…  [&refresh=1]
//   GET /api/v1/trending?country=BR
//   GET /api/v1/music?country=BR
//   GET /api/v1/worldwide
//   GET /api/v1/education?country=BR
// Every number is a stored value or one of the formulas listed in FORMULAS.
const metrics = require('./metrics');

const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IN', 'IQ', 'IT', 'JP', 'KE',
  'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'RO', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
const STALE_MS = 6 * 60 * 60 * 1000; // same rule as the site's search (index.html STALE_MS)
const RPM_LOW = 1, RPM_HIGH = 4;     // same as api/metrics.js and index.html
const SHORTS_MAX_S = 180;
const REFRESH_LIMIT = 20;            // YouTube refreshes per IP per hour (per server instance)
const SITE_ORIGINS = ['https://www.likepolling.com', 'https://likepolling.com'];
const FORMULAS = {
  earnings_usd: `views_30d / 1000 × $${RPM_LOW}–$${RPM_HIGH} (estimated RPM)`,
  avg_views_per_video: 'views_30d / uploads_30d',
  views_per_hour: 'view_count / hours between published_at and fetched_at',
  views_per_day: 'view_count / days between published_at and fetched_at',
  like_rate: 'like_count / view_count',
  countries: 'number of the 41 Trending Index countries whose latest list contains the video',
  subject_score: 'video_count × 3 + news_count (videos: recent uploads of the tracked education channels; news: last 24 h of Google News education headlines; subjects assigned by Google Gemini)',
};
const CHART_COLS = 'rank,video_id,title,channel_id,channel_title,thumbnail_url,view_count,like_count,comment_count,published_at,fetched_at';

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

function rest(env, fetchImpl) {
  const base = `${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/`;
  const key = env.SUPABASE_KEY.trim();
  const once = async (path) => {
    const res = await fetchImpl(base + path, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new HttpError(502, `Database read failed (${res.status})`);
    return res.json();
  };
  // Supabase REST occasionally stalls on one request; a single retry usually answers at once.
  return (path) => once(path).catch(() => once(path));
}

// Supabase REST returns at most 1,000 rows per request.
async function readAll(get, path, page = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += page) {
    const batch = await get(`${path}&limit=${page}&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

function parseChannelRef(q = {}) {
  const id = String(q.id || '').trim();
  if (/^UC[\w-]{22}$/.test(id)) return { id };
  const handle = String(q.handle || '').trim().replace(/^@/, '');
  if (/^[\w.\-\u00C0-\uFFFF]{3,30}$/u.test(handle)) return { handle };
  return null;
}

const hoursBetween = (from, to) => Math.max(1, (Date.parse(to) - Date.parse(from)) / 3600000);
const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const num = (v) => (v == null ? null : Number(v));

function chartRow(r) {
  const views = num(r.view_count);
  const hours = r.published_at && r.fetched_at ? hoursBetween(r.published_at, r.fetched_at) : null;
  return {
    rank: r.rank, video_id: r.video_id, title: r.title, channel_id: r.channel_id, channel_title: r.channel_title,
    thumbnail_url: r.thumbnail_url, views, likes: num(r.like_count), comments: num(r.comment_count), published_at: r.published_at,
    views_per_hour: hours ? Math.round(views / hours) : null,
    views_per_day: hours ? Math.round(views / (hours / 24)) : null,
    like_rate: views && r.like_count != null ? round(Number(r.like_count) / views, 4) : null,
  };
}

function channelBody(entity, metric, now) {
  const h = entity.handles || {};
  const d = metric?.details || {};
  const p = d.profile || {};
  const videos = (d.videos || []).map((v) => ({
    id: v.id, title: v.t, published_at: v.p, views: v.v, likes: v.l, comments: v.c, duration_s: v.d,
    shorts_length: v.d != null && v.d <= SHORTS_MAX_S,
  }));
  const views30 = num(metric?.primary_volume);
  const updated = metric?.created_at || null;
  return {
    found: true,
    channel: {
      entity_id: entity.id, youtube_id: h.youtube_channel_id || null, name: entity.name, handle: h.youtube || null,
      avatar: h.youtube_avatar || null,
      url: h.youtube_channel_id ? `https://www.youtube.com/channel/${h.youtube_channel_id}` : null,
      report_url: `https://www.likepolling.com/?q=${encodeURIComponent(h.youtube || entity.name)}`,
      country: p.country || null, created: p.created || null,
      subscribers: num(p.subscribers), total_views: num(p.views), video_count: num(p.videoCount),
    },
    metrics: views30 == null ? null : {
      views_30d: views30,
      comments_30d: num(metric.comment_volume),
      uploads_30d: d.videos ? videos.length : null,
      avg_views_per_video: d.videos && videos.length ? Math.round(views30 / videos.length) : null,
      earnings_usd: { low: Math.round((views30 / 1000) * RPM_LOW), high: Math.round((views30 / 1000) * RPM_HIGH) },
    },
    videos,
    updated_at: updated,
    stale: !updated || now - Date.parse(updated) > STALE_MS || metric?.details == null,
    formulas: { earnings_usd: FORMULAS.earnings_usd, avg_views_per_video: FORMULAS.avg_views_per_video },
  };
}

async function findChannel(get, ref) {
  const filters = ref.id
    ? [`handles->>youtube_channel_id.eq.${ref.id}`]
    : [`id.eq.${ref.handle.toLowerCase()}`, `handles->>youtube.ilike.@${ref.handle}`];
  const ents = await get(`entities?select=id,name,handles&or=(${encodeURIComponent(filters.join(','))})&limit=5`);
  const entity = ents.find((e) => e.handles?.youtube || e.handles?.youtube_channel_id);
  if (!entity) return { entity: null, metric: null };
  const [metric] = await get(`entity_metrics?select=*&entity_id=eq.${encodeURIComponent(entity.id)}&platform=eq.youtube&order=created_at.desc&limit=1`);
  return { entity, metric: metric || null };
}

const hits = new Map();
function allowRefresh(ip, now) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= REFRESH_LIMIT) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

function runMetrics(deps, channel) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    (deps.metricsHandler || metrics)({ query: { channel } }, res);
  });
}

async function channelRoute(req, get, deps, now) {
  const ref = parseChannelRef(req.query);
  if (!ref) throw new HttpError(400, 'Provide ?handle=@name or ?id=UC… (a YouTube channel ID).');
  let { entity, metric } = await findChannel(get, ref);
  let body = entity && metric ? channelBody(entity, metric, now) : null;
  const wantsRefresh = req.query.refresh === '1' && (!body || body.stale);
  if (wantsRefresh) {
    const ip = String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim();
    if (!allowRefresh(ip, now)) {
      if (!body) throw new HttpError(429, 'Too many refreshes from this connection. Try again within the hour.');
      body.warning = 'Refresh limit reached; showing saved data.';
    } else {
      const out = await runMetrics(deps, body?.channel.youtube_id || ref.id || `@${ref.handle}`);
      if (out.status === 200 && out.body?.entity?.id) {
        ({ entity, metric } = await findChannel(get, { id: out.body.channel.id }));
        if (entity && metric) body = channelBody(entity, metric, now);
      } else if (body) {
        body.warning = 'Live refresh failed; showing saved data.';
      } else {
        throw new HttpError(out.status === 404 ? 404 : 502, out.body?.error || 'Live refresh failed.', { found: false });
      }
    }
  }
  if (!body) throw new HttpError(404, 'No saved data for this channel yet.', { found: false, can_refresh: true });
  return { body, cache: wantsRefresh ? 'no-store' : 'public, max-age=60, s-maxage=600, stale-while-revalidate=600' };
}

function countryParam(req) {
  const c = String(req.query.country || '').toUpperCase();
  if (!COUNTRIES.includes(c)) throw new HttpError(400, `Unknown country. Use one of: ${COUNTRIES.join(', ')}.`);
  return c;
}

async function chartRoute(table, req, get) {
  const country = countryParam(req);
  const rows = (await get(`${table}?select=${CHART_COLS}&country_code=eq.${country}&order=rank.asc&limit=100`)).map(chartRow);
  const fetched = (await get(`${table}?select=fetched_at&country_code=eq.${country}&order=fetched_at.desc&limit=1`))[0]?.fetched_at || null;
  const key = table === 'youtube_music_chart' ? 'views_per_day' : 'views_per_hour';
  const fastest = rows.reduce((best, r) => (r[key] != null && (!best || r[key] > best[key]) ? r : best), null);
  return {
    body: { country, updated_at: fetched, fastest_video_id: fastest?.video_id || null, items: rows,
      formulas: { [key]: FORMULAS[key], like_rate: FORMULAS.like_rate } },
    cache: 'public, max-age=120, s-maxage=900, stale-while-revalidate=3600',
  };
}

async function worldwideRoute(get) {
  const rows = await readAll(get, `youtube_trending?select=country_code,${CHART_COLS}&order=country_code.asc,rank.asc`);
  const byVideo = new Map();
  let updated = null;
  for (const r of rows) {
    if (!updated || r.fetched_at > updated) updated = r.fetched_at;
    const cur = byVideo.get(r.video_id);
    if (!cur) byVideo.set(r.video_id, { ...chartRow(r), countries: [r.country_code], best_rank: r.rank });
    else {
      if (!cur.countries.includes(r.country_code)) cur.countries.push(r.country_code);
      cur.best_rank = Math.min(cur.best_rank, r.rank);
      if (Number(r.view_count) > cur.views) Object.assign(cur, { ...chartRow(r), countries: cur.countries, best_rank: cur.best_rank });
    }
  }
  const total = new Set(rows.map((r) => r.country_code)).size;
  const items = [...byVideo.values()]
    .sort((a, b) => b.countries.length - a.countries.length || b.views - a.views)
    .slice(0, 25)
    .map(({ rank, ...v }, i) => ({ rank: i + 1, ...v, country_count: v.countries.length }));
  return {
    body: { countries_total: total, updated_at: updated, items, formulas: { countries: FORMULAS.countries, views_per_hour: FORMULAS.views_per_hour } },
    cache: 'public, max-age=120, s-maxage=900, stale-while-revalidate=3600',
  };
}

// Education: tracked channels' fastest recent uploads + most talked-about subjects.
async function educationRoute(req, get) {
  const country = countryParam(req);
  const [videos, subjects, firsts] = await Promise.all([
    get(`education_videos?select=rank,video_id,title,channel_id,channel_title,thumbnail_url,view_count,like_count,published_at,views_per_hour,subject,fetched_at&country_code=eq.${country}&order=rank.asc&limit=50`),
    get(`education_subjects?select=rank,subject,score,video_count,news_count,example_video_id,example_video_title,example_news_title,example_news_link,example_news_source,fetched_at&country_code=eq.${country}&order=rank.asc&limit=50`),
    get('education_videos?select=country_code&rank=eq.1&order=country_code.asc'),
  ]);
  const updated = [...videos, ...subjects].reduce((m, r) => (!m || r.fetched_at > m ? r.fetched_at : m), null);
  return {
    body: {
      country, countries: firsts.map((r) => r.country_code), updated_at: updated,
      videos: videos.map((r) => ({ rank: r.rank, video_id: r.video_id, title: r.title, channel_id: r.channel_id, channel_title: r.channel_title,
        thumbnail_url: r.thumbnail_url, views: num(r.view_count), likes: num(r.like_count), published_at: r.published_at,
        views_per_hour: num(r.views_per_hour), subject: r.subject })),
      subjects: subjects.map(({ fetched_at, ...s }) => s),
      formulas: { views_per_hour: FORMULAS.views_per_hour, subject_score: FORMULAS.subject_score },
    },
    cache: 'public, max-age=300, s-maxage=1800, stale-while-revalidate=7200',
  };
}

function corsHeaders(req, res, env) {
  const origin = req.headers?.origin;
  const extra = String(env.CREATORS_PLUS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && [...SITE_ORIGINS, ...extra].includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const now = deps.now ? deps.now() : Date.now();
    req.query = req.query || {};
    corsHeaders(req, res, env);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    try {
      if (req.method && req.method !== 'GET') throw new HttpError(405, 'Read-only API: use GET.');
      const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
      if (missing.length) throw new HttpError(500, `Server is missing env vars: ${missing.join(', ')}`);
      const get = rest(env, deps.fetch || fetch);
      const route = String(req.query.route || '');
      const out = route === 'channel' ? await channelRoute(req, get, deps, now)
        : route === 'trending' ? await chartRoute('youtube_trending', req, get)
        : route === 'music' ? await chartRoute('youtube_music_chart', req, get)
        : route === 'worldwide' ? await worldwideRoute(get)
        : route === 'education' ? await educationRoute(req, get)
        : null;
      if (!out) throw new HttpError(404, 'Unknown route. Try /api/v1/channel, /trending, /music, /worldwide or /education.');
      res.setHeader('Cache-Control', out.cache);
      return res.status(200).json(out.body);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error('[v1]', err);
      const status = err.status || 500;
      res.setHeader('Cache-Control', status === 404 && err.extra?.found === false ? 'public, max-age=60, s-maxage=120' : 'no-store');
      return res.status(status).json({ error: err.message, ...(err.extra || {}) });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.parseChannelRef = parseChannelRef;
module.exports.chartRow = chartRow;
module.exports.COUNTRIES = COUNTRIES;
