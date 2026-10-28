#!/usr/bin/env node
// Wikipedia memory: once a day, saves each tracked country's most-read Wikipedia articles
// (Wikimedia "top-per-country", all wikis, public domain) into public.wiki_top_daily.
//   node scripts/wiki-routine.js
// Wikimedia publishes a day ~1-2 days late and skips countries below its privacy threshold,
// so every run re-reads the last DAYS_BACK days (404 = not published / no data, skipped). Some countries
// (currently BD, EG, IQ, PK, SA, TR, VN) are always withheld by Wikimedia to protect readers' privacy.
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Optional DAYS_BACK. Node >= 20, no deps.
'use strict';

const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country';
// Wikimedia asks API clients to identify themselves with a contact.
const USER_AGENT = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const TOP_N = 100;
const DAYS_BACK = 4;
// Wikimedia rate-limits this endpoint per client: one request at a time, with a short pause.
const CONCURRENCY = 1;
const PAUSE_MS = 300;
const MAX_RETRIES = 5;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function supabaseHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// Returns the parsed body, or null on 404. Retries 429/5xx with backoff.
async function fetchJson(url, init, deps) {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url, init);
    if (res.status === 404) return null;
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    if (!(res.status === 429 || res.status >= 500) || attempt >= MAX_RETRIES) {
      throw Object.assign(new Error(body?.detail || body?.message || `HTTP ${res.status}`), { status: res.status });
    }
    const retryAfter = Number(res.headers?.get?.('retry-after'));
    await deps.sleep(retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2 ** attempt * 1000 + Math.floor(Math.random() * 250));
  }
}

// 'YYYY-MM-DD' for each of the `n` days before `now` (UTC), newest first.
function recentDays(now, n) {
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1 - i)).toISOString().slice(0, 10));
}

function toRows(country, day, body) {
  const articles = body?.items?.[0]?.articles || [];
  return articles
    .filter((a) => a && a.article && a.project)
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
    .slice(0, TOP_N)
    .map((a, i) => ({ day, country_code: country, rank: i + 1, project: a.project, article: a.article, views_ceil: a.views_ceil ?? null }));
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || new Date() };
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const countries = (await fetchJson(`${env.SUPABASE_URL}/rest/v1/youtube_active_users?select=country_code&order=country_code`,
    { headers: supabaseHeaders(env.SUPABASE_KEY) }, deps)).map((r) => r.country_code);
  const days = recentDays(deps.now, Number(env.DAYS_BACK) || DAYS_BACK);
  const queue = countries.flatMap((cc) => days.map((day) => [cc, day]));
  const rows = [];
  const failed = [];
  let unpublished = 0;

  async function worker() {
    while (queue.length) {
      const [cc, day] = queue.shift();
      try {
        const body = await fetchJson(`${API}/${cc}/all-access/${day.replace(/-/g, '/')}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, deps);
        const r = toRows(cc, day, body);
        if (r.length) rows.push(...r);
        else unpublished++;
      } catch (err) {
        failed.push({ cc, day, error: err.message });
      }
      if (queue.length) await deps.sleep(PAUSE_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (!rows.length) throw new Error(`No Wikipedia data fetched (${failed.length} failures, ${unpublished} unpublished)`);

  const written = await fetchJson(`${env.SUPABASE_URL}/rest/v1/rpc/replace_wiki_top_daily`,
    { method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify({ payload: rows }) }, deps);
  const summary = { countries: countries.length, days, rows: written, unpublished, failed };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows, recentDays, TOP_N, USER_AGENT };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Wikipedia routine failed: ${err.message}`);
    process.exit(1);
  });
}
