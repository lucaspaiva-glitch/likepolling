const test = require('node:test');
const assert = require('node:assert/strict');
const { run, toRows, seconds, shortKind, langMatch, SEARCHES } = require('../scripts/news-shorts-routine');

const env = { YOUTUBE_API_KEY: 'yt', SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 'secret' };
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const page = (status, location) => ({ status, headers: { get: (h) => (h === 'location' ? location : null) } });
const vid = (id, dur, extra = {}) => ({ id, snippet: { title: `T ${id}`, channelId: `UC${id}`, channelTitle: `C ${id}`, publishedAt: '2026-10-15T10:00:00Z', liveBroadcastContent: 'none' }, contentDetails: { duration: dur }, statistics: { viewCount: '1200' }, status: { embeddable: true, privacyStatus: 'public' }, ...extra });

test('parses ISO 8601 durations', () => {
  assert.equal(seconds('PT45S'), 45);
  assert.equal(seconds('PT2M5S'), 125);
  assert.equal(seconds('PT1H'), 3600);
  assert.equal(seconds('P0D'), 0);
  assert.equal(seconds('bogus'), null);
});

test('keeps search order and drops long, live, unembeddable and private videos', () => {
  const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee', 'fffffffffff'];
  const items = [
    vid('bbbbbbbbbbb', 'PT59S'),
    vid('aaaaaaaaaaa', 'PT10M'),
    vid('ccccccccccc', 'PT30S', { status: { embeddable: false, privacyStatus: 'public' } }),
    vid('ddddddddddd', 'PT30S', { snippet: { title: 'L', channelId: 'UCd', channelTitle: 'D', publishedAt: '2026-10-15T10:00:00Z', liveBroadcastContent: 'live' } }),
    vid('eeeeeeeeeee', 'PT30S', { status: { embeddable: true, privacyStatus: 'unlisted' } }),
    vid('fffffffffff', 'PT2M'),
  ];
  const rows = toRows('en', ids, items);
  assert.deepEqual(rows.map((r) => [r.video_id, r.rank, r.duration_s]), [['bbbbbbbbbbb', 1, 59], ['fffffffffff', 2, 120]]);
  assert.equal(rows[0].view_count, 1200);
  assert.equal(rows[0].channel_title, 'C bbbbbbbbbbb');
});

test('tells real Shorts from regular videos; anything else is unknown', async () => {
  const at = (res) => ({ fetch: async () => (res instanceof Error ? Promise.reject(res) : res) });
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(200))), 'short');
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(303, 'https://www.youtube.com/watch?v=aaaaaaaaaaa'))), 'video');
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(302, 'https://consent.youtube.com/m?continue=x'))), 'unknown');
  assert.equal(await shortKind('aaaaaaaaaaa', at(page(429))), 'unknown');
  assert.equal(await shortKind('aaaaaaaaaaa', at(new Error('net'))), 'unknown');
});

test('keeps only Shorts in the language: tag first, then script or common words', () => {
  const v = (title, tag) => ({ snippet: { title, defaultAudioLanguage: tag } });
  assert.equal(langMatch('ko', v('결혼하면 부부 유튜버로 뜬다?')), true);
  assert.equal(langMatch('ko', v('NEVER WALK STRAIGHT! 😦')), false);
  assert.equal(langMatch('ko', v('NEVER WALK STRAIGHT!', 'ko')), true);
  assert.equal(langMatch('ja', v('映画『Michael／マイケル』吹替版予告')), true);
  assert.equal(langMatch('ru', v('Люди добрые')), true);
  assert.equal(langMatch('uk', v('Люди добрые')), false);
  assert.equal(langMatch('uk', v('Розпустила коси, їду')), true);
  assert.equal(langMatch('en', v('Why You Get Carsick While Reading 🤢')), true);
  assert.equal(langMatch('en', v('$10 Crepe Machine', 'en-US')), true);
  assert.equal(langMatch('en', v('$10 Crepe Machine')), false);
  assert.equal(langMatch('pt', v('essa ESCOLA tentou TRANCAR OS CELULARES e os alunos')), true);
  assert.equal(langMatch('pt-PT', v('Qualquer coisa', 'pt-BR')), true);
  assert.equal(langMatch('es', v('OLVIDE A DANI EN LA ESCUELA 😭@DannyPlay7')), false);
  assert.equal(langMatch('es', v('Ronaldo le mostró a Haaland quién es el mejor y por qué')), true);
  assert.equal(langMatch('de', v('Warum die Katze nicht schläft')), true);
  assert.equal(langMatch('de', v('Größter Döner Deutschlands')), true);
  assert.equal(langMatch('de', v('BEHIND THE SCENES 🥹😭')), false);
  assert.equal(langMatch('en', v('पति उठा लाया 10 किलो मूली! the best')), false);
  assert.equal(langMatch('en', v('Ye kele Puja ke liye hai', 'hi')), false);
});

test('searches 2 pages of most viewed recent shorts per country, keeps real Shorts in the language, one RPC; quota stops further countries', async () => {
  let rpc;
  const calls = [];
  const notShort = new Set(['bbbbbbbbbbb']);
  const audio = { aaaaaaaaaaa: 'en', bbbbbbbbbbb: 'en', ccccccccccc: 'en', ddddddddddd: 'en', ggggggggggg: 'hi', eeeeeeeeeee: 'pt-BR' };
  const f = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.hostname === 'www.youtube.com') {
      const id = u.pathname.split('/').pop();
      return notShort.has(id) ? page(303, `https://www.youtube.com/watch?v=${id}`) : page(200);
    }
    if (u.pathname.endsWith('/search')) {
      const r = u.searchParams.get('regionCode');
      const tok = u.searchParams.get('pageToken');
      calls.push(r + (tok ? `:${tok}` : ''));
      assert.equal(u.searchParams.get('order'), 'viewCount');
      assert.equal(u.searchParams.get('videoDuration'), 'short');
      assert.equal(u.searchParams.get('q'), null);
      assert.equal(u.searchParams.get('publishedAfter'), '2026-10-13T12:00:00.000Z');
      if (r === 'PT') return json(403, { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } });
      if (r === 'US' && !tok) return json(200, { nextPageToken: 'p2', items: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ggggggggggg'].map((videoId) => ({ id: { videoId } })) });
      const ids = r === 'US' ? ['ccccccccccc', 'ddddddddddd', 'aaaaaaaaaaa'] : ['ggggggggggg'];
      return json(200, { items: ids.map((videoId) => ({ id: { videoId } })) });
    }
    if (u.pathname.endsWith('/videos')) {
      const ids = u.searchParams.get('id').split(',');
      return json(200, { items: ids.map((id) => {
        const v = vid(id, id === 'ccccccccccc' ? 'PT20M' : 'PT40S');
        v.snippet.defaultAudioLanguage = audio[id];
        return v;
      }) });
    }
    if (u.pathname.endsWith('/rpc/replace_news_shorts')) { rpc = JSON.parse(init.body); return json(200, rpc.payload.length); }
    if (u.pathname.endsWith('/rest/v1/news_shorts') && init.method === 'DELETE') { cleared = u.searchParams.get('lang'); return { ok: true, status: 204, json: async () => { throw new Error('empty'); } }; }
    throw new Error(`unexpected ${u}`);
  };
  let cleared;
  const s = await run(env, { fetch: f, sleep: async () => {}, log: () => {}, now: () => Date.parse('2026-10-15T12:00:00Z') });
  assert.deepEqual(calls, ['US', 'US:p2', 'BR', 'PT']);
  assert.equal(cleared, 'in.("pt")');
  assert.deepEqual(s.cleared, ['pt']);
  assert.equal(s.quotaHit, true);
  assert.deepEqual(s.langs, { en: 2, pt: 0 });
  assert.deepEqual(s.check, { otherLanguage: 2, short: 2, video: 1, unknown: 0 });
  assert.equal(s.failed.length, SEARCHES.length - 2);
  assert.deepEqual(rpc.payload.map((r) => [r.lang, r.video_id, r.rank]), [['en', 'aaaaaaaaaaa', 1], ['en', 'ddddddddddd', 2]]);
  assert.equal(s.rows, 2);
});
