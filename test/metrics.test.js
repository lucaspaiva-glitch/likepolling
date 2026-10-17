const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, parseChannelQuery, aggregate } = require('../api/metrics');

const ENV = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'sk' };
const CHANNEL = {
  id: 'UCX6OQ3DkcsbYNE6H8uQQuVA',
  snippet: { title: 'MrBeast', customUrl: '@mrbeast', thumbnails: { medium: { url: 'https://img/a.jpg' } } },
  statistics: { subscriberCount: '400000000', viewCount: '90000000000' },
  contentDetails: { relatedPlaylists: { uploads: 'UUX6' } },
};

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

function mockFetch() {
  const recent = new Date(Date.now() - 3 * 864e5).toISOString();
  const old = new Date(Date.now() - 60 * 864e5).toISOString();
  return async (url) => {
    const u = new URL(url);
    const path = u.pathname.split('/').pop();
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (path === 'channels') return json({ items: [CHANNEL] });
    if (path === 'playlistItems') return json({ items: [
      { contentDetails: { videoId: 'v1', videoPublishedAt: recent } },
      { contentDetails: { videoId: 'v2', videoPublishedAt: recent } },
      { contentDetails: { videoId: 'v3', videoPublishedAt: old } },
    ], nextPageToken: 'more' });
    if (path === 'videos') {
      assert.equal(u.searchParams.get('id'), 'v1,v2');
      return json({ items: [
        { snippet: { title: 'A' }, statistics: { viewCount: '1000', commentCount: '10' } },
        { snippet: { title: 'B' }, statistics: { viewCount: '3000', commentCount: '30' } },
      ] });
    }
    throw new Error('unexpected ' + url);
  };
}

function mockDb({ insertError = null } = {}) {
  const calls = { upsert: [], insert: [] };
  const db = {
    calls,
    from(table) {
      const q = {
        select() { return q; }, or() { return q; },
        limit: async () => ({ data: [], error: null }),
        upsert: async (row) => { calls.upsert.push({ table, row }); return { error: null }; },
        insert(row) { calls.insert.push({ table, row }); return { select: () => ({ single: async () => ({ data: insertError ? null : { id: 1, ...row }, error: insertError }) }) }; },
      };
      return q;
    },
  };
  return db;
}

test('parseChannelQuery handles names, handles, URLs and IDs', () => {
  assert.deepEqual(parseChannelQuery('@MrBeast'), { type: 'handle', value: 'MrBeast' });
  assert.deepEqual(parseChannelQuery('https://www.youtube.com/@ishowspeed/videos'), { type: 'handle', value: 'ishowspeed' });
  assert.deepEqual(parseChannelQuery('https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA'), { type: 'id', value: 'UCX6OQ3DkcsbYNE6H8uQQuVA' });
  assert.deepEqual(parseChannelQuery('Mr Beast'), { type: 'handle', value: 'MrBeast', fallbackSearch: 'Mr Beast' });
  assert.equal(parseChannelQuery('  '), null);
});

test('aggregate sums views/comments and estimates earnings', () => {
  const s = aggregate([{ statistics: { viewCount: '2000', commentCount: '5' } }, { statistics: { viewCount: '1000' } }]);
  assert.equal(s.monthlyViews, 3000);
  assert.equal(s.commentVolume, 5);
  assert.deepEqual(s.estimatedEarnings, { low: 3, high: 12, currency: 'USD' });
});

test('handler writes entity + metric row, with no AI summary', async () => {
  const db = mockDb();
  const handler = createHandler({ env: ENV, fetch: mockFetch(), db });
  const res = mockRes();
  await handler({ query: { channel: 'MrBeast' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const metric = db.calls.insert[0];
  assert.equal(metric.table, 'entity_metrics');
  assert.equal(metric.row.entity_id, 'mrbeast');
  assert.equal(metric.row.platform, 'youtube');
  assert.equal(metric.row.primary_volume, 4000);
  assert.equal(metric.row.comment_volume, 40);
  assert.equal('intelligence_note' in metric.row, false);
  assert.equal(db.calls.upsert[0].row.category, 'creators');
  assert.equal('summary' in res.body, false);
});

test('channels with no recent uploads record zero views', async () => {
  const db = mockDb();
  const old = new Date(Date.now() - 60 * 864e5).toISOString();
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname.split('/').pop();
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (path === 'channels') return json({ items: [CHANNEL] });
    if (path === 'playlistItems') return json({ items: [{ contentDetails: { videoId: 'v9', videoPublishedAt: old } }] });
    throw new Error('unexpected ' + url);
  };
  const handler = createHandler({ env: ENV, fetch: fetchImpl, db });
  const res = mockRes();
  await handler({ query: { channel: 'MrBeast' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(db.calls.insert[0].row.primary_volume, 0);
});

test('Supabase write errors surface as 502, not silently', async () => {
  const handler = createHandler({ env: ENV, fetch: mockFetch(), db: mockDb({ insertError: { message: 'permission denied' } }) });
  const res = mockRes();
  await handler({ query: { channel: 'MrBeast' } }, res);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /entity_metrics write failed: permission denied/);
});

test('missing env vars and empty query are rejected', async () => {
  let res = mockRes();
  await createHandler({ env: {} })({ query: { channel: 'x' } }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /SUPABASE_KEY/);
  res = mockRes();
  await createHandler({ env: ENV, db: mockDb() })({ query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('malformed SUPABASE_URL returns a JSON error instead of crashing', async () => {
  for (const bad of ['"https://x.supabase.co"', 'SUPABASE_URL=https://x.supabase.co', 'x.supabase.co']) {
    const res = mockRes();
    await createHandler({ env: { ...ENV, SUPABASE_URL: bad } })({ query: { channel: 'MrBeast' } }, res);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /SUPABASE_URL is malformed/);
  }
});
