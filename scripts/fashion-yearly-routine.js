#!/usr/bin/env node
// Fashion Share, run weekly by .github/workflows/fashion-yearly.yml:
//   node scripts/fashion-yearly-routine.js
// For the 14 biggest fashion YouTube channels (by subscribers, Nov 2026): every upload, grouped by the year it
// was posted, with the views those videos have today, into public.fashion_channel_yearly. A channel's first run
// reads its whole history; later runs reread only this year and last year (older years change little), and the
// whole history again every 90 days. About 2 YouTube units per 50 videos; stops at UNIT_BUDGET per run.
// Env: YOUTUBE_API_KEY, SUPABASE_URL, SUPABASE_KEY.
'use strict';

const { fetchJson, QuotaError } = require('./trending-routine');
const { supabaseHeaders } = require('./memory-common.js');

const CHANNELS = [
  ['UCRXiA3h1no_PFkb1JCP0yMA', 'Vogue'], ['UCsEukrAd64fqA7FjwkmZ_Dw', 'GQ'], ['UC5q0PIKGr2lGOsiT14AlEYg', 'Louis Vuitton'],
  ['UChWXY0e-HUhoXZZ_2GlvojQ', "Victoria's Secret"], ['UC6xD-jKli-_qIYXDTsNv4dw', 'Dior'], ['UCclHSnngVTZK7LEOQAzcg1w', 'Chanel'],
  ['UCV8Do0nwSrYP7lwPBS4LWpw', 'ELLE'], ['UCr7ZFxNlDvb3waeoTN1_3mA', 'Teen Vogue'], ['UCzsF1ghKHeif7AmTNlRYAzQ', "Harper's Bazaar"],
  ['UCo6fjlKg6GuCmEMeqYbGJng', 'Gucci'], ['UC2DHU9RPlx9DpY0pMfL7jBg', 'Vogue Korea'], ['UCuf6cvFcYdpHZ_EjSIcBZlg', 'Calvin Klein'],
  ['UCyLC0byWRwTw16Gc74SPp9w', 'SHEIN'], ['UCqzju-_WMKsgNx8R3QwupQQ', 'FashionTV'],
].map(([id, name]) => ({ id, name }));
const UNIT_BUDGET = 4000;
const FULL_EVERY_DAYS = 90;
const YT = 'https://www.googleapis.com/youtube/v3/';
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ytUrl = (path, params, key) => {
  const u = new URL(YT + path);
  for (const [k, v] of Object.entries({ ...params, key })) u.searchParams.set(k, v);
  return u;
};

// Uploads newest first, stopping before `fromYear`; then each video's views. Returns [{ year, videos, views }].
async function channelYears(ch, fromYear, env, deps, spend) {
  const items = [];
  let page = '';
  do {
    spend(1);
    const body = await fetchJson(ytUrl('playlistItems', { part: 'contentDetails', playlistId: `UU${ch.id.slice(2)}`, maxResults: '50', ...(page ? { pageToken: page } : {}) }, env.YOUTUBE_API_KEY), {}, deps);
    const got = (body.items || []).map((it) => ({ id: it.contentDetails?.videoId, year: new Date(it.contentDetails?.videoPublishedAt).getUTCFullYear() })).filter((v) => v.id && v.year);
    items.push(...got.filter((v) => v.year >= fromYear));
    page = got.some((v) => v.year < fromYear) ? '' : body.nextPageToken || '';
  } while (page);
  const by = {};
  for (let i = 0; i < items.length; i += 50) {
    spend(1);
    const body = await fetchJson(ytUrl('videos', { part: 'statistics', id: items.slice(i, i + 50).map((v) => v.id).join(',') }, env.YOUTUBE_API_KEY), {}, deps);
    const views = new Map((body.items || []).map((it) => [it.id, Number(it.statistics?.viewCount) || 0]));
    for (const v of items.slice(i, i + 50)) {
      if (!views.has(v.id)) continue;
      const y = (by[v.year] = by[v.year] || { year: v.year, videos: 0, views: 0 });
      y.videos++;
      y.views += views.get(v.id);
    }
  }
  return Object.values(by);
}

async function run(env = process.env, deps = {}) {
  deps = { fetch: deps.fetch || fetch, sleep: deps.sleep || defaultSleep, log: deps.log || console.log, now: deps.now || Date.now, channels: deps.channels || CHANNELS };
  const missing = ['YOUTUBE_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  const headers = supabaseHeaders(env.SUPABASE_KEY);
  const now = deps.now(), thisYear = new Date(now).getUTCFullYear();
  const r = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/fashion_channel_yearly?select=channel_id,year,saved_at&year=lt.${thisYear - 1}`, { headers });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  // When each channel's old years were last read in full.
  const fullAt = {};
  for (const row of await r.json()) fullAt[row.channel_id] = Math.max(fullAt[row.channel_id] || 0, Date.parse(row.saved_at));
  const order = [...deps.channels].sort((a, b) => (fullAt[a.id] || 0) - (fullAt[b.id] || 0));
  let units = 0, saved = 0, failed = 0;
  const spend = (n) => { units += n; };
  for (const ch of order) {
    if (units >= UNIT_BUDGET) break;
    const full = now - (fullAt[ch.id] || 0) > FULL_EVERY_DAYS * 86400000;
    try {
      const years = await channelYears(ch, full ? 2005 : thisYear - 1, env, deps, spend);
      if (!years.length) continue;
      const rows = years.map((y) => ({ channel_id: ch.id, name: ch.name, ...y, saved_at: new Date(now).toISOString() }));
      const w = await deps.fetch(`${env.SUPABASE_URL}/rest/v1/fashion_channel_yearly?on_conflict=channel_id,year`,
        { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      if (!w.ok) throw new Error(`Supabase ${w.status}`);
      saved++;
      deps.log(`${ch.name}: ${years.length} years${full ? ' (full history)' : ''}`);
    } catch (e) {
      if (e instanceof QuotaError) { deps.log(`YouTube quota reached: ${e.message}`); break; }
      failed++;
      deps.log(`${ch.name}: ${e.message}`);
    }
  }
  deps.log(`Saved ${saved} channels, ${failed} failed, about ${units} YouTube units.`);
  if (!saved && failed) throw new Error('No channel could be saved.');
  return { saved, failed, units };
}

if (require.main === module) run().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { run, channelYears, CHANNELS };
