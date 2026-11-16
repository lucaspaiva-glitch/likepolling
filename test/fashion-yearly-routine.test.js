const test = require('node:test');
const assert = require('node:assert/strict');
const { run, CHANNELS } = require('../scripts/fashion-yearly-routine');

const NOW = Date.parse('2026-11-16T12:00:00Z');
const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const ch = { id: `UC${'a'.repeat(22)}`, name: 'Brand' };
// 120 uploads, newest first: 2026, 2025, then 2019.
const vids = Array.from({ length: 120 }, (_, i) => ({ id: `v${i}`, year: i < 40 ? 2026 : i < 80 ? 2025 : 2019, views: i < 40 ? 10 : i < 80 ? 100 : 1000 }));

function mockFetch(saved = []) {
  const calls = [], writes = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push(u);
    if (u.pathname.endsWith('/playlistItems')) {
      const start = Number(u.searchParams.get('pageToken') || 0);
      const page = vids.slice(start, start + 50);
      return json(200, { items: page.map((v) => ({ contentDetails: { videoId: v.id, videoPublishedAt: `${v.year}-06-01T00:00:00Z` } })), ...(start + 50 < vids.length ? { nextPageToken: String(start + 50) } : {}) });
    }
    if (u.pathname.endsWith('/videos')) {
      const ids = u.searchParams.get('id').split(',').filter((id) => id !== 'v0');
      return json(200, { items: ids.map((id) => ({ id, statistics: { viewCount: String(vids.find((v) => v.id === id).views) } })) });
    }
    if (u.pathname.endsWith('/fashion_channel_yearly') && init.method === 'POST') { writes.push(JSON.parse(init.body)); return json(201, null); }
    if (u.pathname.endsWith('/fashion_channel_yearly')) return json(200, saved);
    throw new Error(`unexpected ${u}`);
  };
  fn.calls = calls; fn.writes = writes;
  return fn;
}

test('tracks 14 channels', () => {
  assert.equal(CHANNELS.length, 14);
  assert.equal(new Set(CHANNELS.map((c) => c.id)).size, 14);
});

test('first run reads the whole history and sums views per upload year', async () => {
  const f = mockFetch();
  await run(env, { fetch: f, now: () => NOW, channels: [ch], log: () => {} });
  const rows = f.writes[0].sort((a, b) => a.year - b.year);
  assert.deepEqual(rows.map((r) => [r.year, r.videos, r.views]), [[2019, 40, 40000], [2025, 40, 4000], [2026, 39, 390]]);
});

test('later runs reread only this year and last year', async () => {
  const f = mockFetch([{ channel_id: ch.id, year: 2019, saved_at: new Date(NOW - 7 * 86400000).toISOString() }]);
  await run(env, { fetch: f, now: () => NOW, channels: [ch], log: () => {} });
  assert.deepEqual(f.writes[0].map((r) => r.year).sort(), [2025, 2026]);
  assert.equal(f.calls.filter((u) => u.pathname.endsWith('/playlistItems')).length, 2);
});
