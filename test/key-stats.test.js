'use strict';
const test = require('node:test');
const assert = require('node:assert');
const k = require('../lib/key-stats');
const { run } = require('../scripts/worldbank-routine');

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 502, json: async () => body });

test('country numbers come from saved rows first, the live World Bank fills the rest, and 502s hide the card', async () => {
  const saved = async () => [{ indicator: 'NY.GDP.MKTP.CD', year: 2024, value: 2e12 }, { indicator: 'NY.GDP.MKTP.CD', year: 2025, value: 2.2e12 }];
  const urls = [];
  const fetch = async (url) => { urls.push(url); return url.includes('SP.POP.TOTL') ? json([{}, [{ date: '2025', value: 212e6 }, { date: '2024', value: 211e6 }]]) : json(null, false); };
  const r = await k.countryStats(fetch, 'BR', saved);
  assert.equal(r.source, 'World Bank');
  assert.deepEqual(r.tiles.map((t) => [t.label, t.value, t.year]), [['Economy size (GDP)', 2.2e12, 2025], ['Population', 212e6, 2025]]);
  assert.equal(r.tiles[0].change, 10);
  assert.ok(!urls.some((u) => u.includes('NY.GDP.MKTP.CD?')), 'saved indicator is not fetched live');
  assert.equal(await k.countryStats(async () => json(null, false), 'BR'), null);
  assert.equal(await k.countryStats(fetch, 'Brazil'), null);
});

test('election numbers match the TSE final count', () => {
  const r = k.electionStats();
  assert.equal(r.tiles[0].value, 60345999);
  assert.equal(r.tiles[1].value, 58206354);
  assert.equal(r.tiles[2].value, 2139645);
  assert.equal(r.tiles[3].value, 79.4);
  assert.match(r.tiles[0].note, /^50\.9/);
});

test('music numbers need an exact Deezer name match', async () => {
  const fetch = async (url) => (url.includes('search/artist') ? json({ data: [{ id: 1, name: 'Shakira Tribute' }, { id: 2, name: 'Shakira' }] })
    : url.endsWith('/artist/2') ? json({ nb_fan: 11818423, nb_album: 69 }) : json({ data: [{ title: 'Hips Don’t Lie', album: { title: 'Oral Fixation' } }] }));
  const r = await k.keyStats(fetch, { cat: 'person', title: 'Shakira', description: 'Colombian singer' });
  assert.deepEqual(r.tiles.map((t) => t.value), [11818423, 69]);
  assert.equal(r.list.items[0].title, 'Hips Don’t Lie');
  assert.equal(await k.keyStats(fetch, { cat: 'person', title: 'Shakira', description: 'Colombian politician' }), null);
  assert.equal(await k.keyStats(async () => json({ data: [{ id: 1, name: 'Someone Else' }] }), { cat: 'person', title: 'Shakira', description: 'singer' }), null);
});

test('club numbers and matches come from TheSportsDB', async () => {
  assert.equal(k.clubName('S.L. Benfica'), 'Benfica');
  const fetch = async (url) => (url.includes('searchteams') ? json({ teams: [{ idTeam: '9', strTeam: 'Benfica', strLeague: 'Portuguese Primeira Liga', intFormedYear: '1904', strStadium: 'Estádio da Luz', strCountry: 'Portugal' }] })
    : url.includes('eventslast') ? json({ results: [{ strHomeTeam: 'Benfica', strAwayTeam: 'Porto', intHomeScore: '2', intAwayScore: '1', strLeague: 'Liga', dateEvent: '2026-11-20' }] })
      : json({ events: [] }));
  const r = await k.clubStats(fetch, 'S.L. Benfica');
  assert.equal(r.tiles[1].value, 1904);
  assert.equal(r.list.items[0].title, 'Benfica 2–1 Porto');
  assert.equal(await k.clubStats(async () => json({ teams: null }), 'S.L. Benfica'), null);
});

test('any source error means no card, never a broken page', async () => {
  const boom = async () => { throw new Error('down'); };
  for (const a of [{ cat: 'country', iso2: 'BR' }, { cat: 'brand', title: 'X' }, { cat: 'sport', title: 'Y' }, { cat: 'person', title: 'Z', description: 'singer' }, { cat: 'topic' }]) {
    assert.equal(await k.keyStats(boom, a), null);
  }
});

test('worldbank routine saves each answering country and fails only when none answered', async () => {
  const saves = [];
  const fetch = async (url, opts = {}) => {
    if (opts.method === 'POST') { saves.push(JSON.parse(opts.body)); return { ok: true, status: 201 }; }
    return url.includes('/country/PT/') ? json(null, false) : json([{}, [{ date: '2025', value: 1 }]]);
  };
  const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k' };
  const r = await run(env, { fetch, pause: async () => {}, log: () => {}, countries: ['BR', 'PT'] });
  assert.deepEqual(r, { done: ['BR'], failed: ['PT'] });
  assert.equal(saves[0].length, k.WB.length);
  assert.deepEqual(saves[0][0], { country_code: 'BR', indicator: 'NY.GDP.MKTP.CD', year: 2025, value: 1 });
  await assert.rejects(run(env, { fetch: async () => json(null, false), pause: async () => {}, log: () => {}, countries: ['PT'] }));
});
