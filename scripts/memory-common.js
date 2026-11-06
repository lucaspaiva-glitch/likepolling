// Shared helpers for the daily memory routines (Supabase REST + polite fetching). Node >= 20, no deps.
'use strict';

const USER_AGENT = 'LikePolling/1.0 (https://www.likepolling.com; lucaspaiva@likepolling.com)';
const MAX_RETRIES = 4;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const supabaseHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

// Returns the response body (parsed JSON, or text when asText), null on 404/204. Retries 429/5xx with backoff.
async function fetchBody(url, init, deps, asText = false) {
  for (let attempt = 0; ; attempt++) {
    const res = await deps.fetch(url, init);
    if (res.status === 404 || res.status === 204) return null;
    if (res.ok) return asText ? res.text() : res.json();
    if (!(res.status === 429 || res.status >= 500) || attempt >= MAX_RETRIES) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    await deps.sleep(2 ** attempt * 1000 + Math.floor(Math.random() * 250));
  }
}

function setup(env, deps) {
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  return { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || new Date() };
}

// The tracked countries (the same list as every other routine).
async function countries(env, deps) {
  const rows = await fetchBody(`${env.SUPABASE_URL}/rest/v1/youtube_active_users?select=country_code&order=country_code`, { headers: supabaseHeaders(env.SUPABASE_KEY) }, deps);
  return rows.map((r) => r.country_code);
}

const rpc = (env, deps, fn, payload) => fetchBody(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`,
  { method: 'POST', headers: supabaseHeaders(env.SUPABASE_KEY), body: JSON.stringify({ payload }) }, deps);

// Runs fn over items, a few at a time, with a short pause between calls.
async function each(items, fn, deps, { concurrency = 3, pause = 200 } = {}) {
  const queue = [...items];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) { await fn(queue.shift()); if (queue.length) await deps.sleep(pause); }
  }));
}

module.exports = { USER_AGENT, fetchBody, setup, countries, rpc, each, supabaseHeaders };
