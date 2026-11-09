const test = require('node:test');
const assert = require('node:assert/strict');
const x = require('../lib/entity-extras');

test('media moments: spikes of 2x+ a normal day, 7+ days apart, matched to a release that week', () => {
  const series = Array.from({ length: 120 }, (_, i) => ({ day: new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10), views: 1000 }));
  series[20].views = 9000; series[22].views = 5000; series[60].views = 3000; series[61].views = 1900;
  const list = x.moments(series, [{ kind: 'single', name: 'Goals', day: series[18].day }]);
  assert.deepEqual(list.map((m) => m.views), [9000, 3000]);
  assert.equal(list[0].times, 9);
  assert.equal(list[0].cause.name, 'Goals');
  assert.equal(list[1].cause, undefined);
});

test('followers: latest count per year and platform, YouTube counts skipped', () => {
  const c = (n, q, t) => ({ rank: 'normal', mainsnak: { datavalue: { value: { amount: `+${n}` } } }, qualifiers: { [q]: [{ datavalue: { value: 'id' } }], P585: [{ datavalue: { value: { time: t, precision: 11 } } }] } });
  const out = x.followers({ P8687: [c(100, 'P6552', '+2022-01-01T00:00:00Z'), c(150, 'P6552', '+2022-06-01T00:00:00Z'), c(200, 'P6552', '+2023-01-01T00:00:00Z'), c(999, 'P2397', '+2023-01-01T00:00:00Z')] });
  assert.deepEqual(out, [{ platform: 'X', years: [{ year: 2022, day: '2022-06-01', followers: 150 }, { year: 2023, day: '2023-01-01', followers: 200 }] }]);
});

test('searches fall back to plain names and skip short rival names', async () => {
  const sent = [];
  const day = (i) => ({ time: String(Date.UTC(2026, 9, 1 + i) / 1000), value: [50, 10, 5] });
  const fake = async (url) => {
    const u = String(url);
    if (u.includes('/api/explore')) {
      sent.push(JSON.parse(new URL(u).searchParams.get('req')).comparisonItem.map((c) => c.keyword));
      return { ok: true, status: 200, text: async () => ")]}'\n" + JSON.stringify({ widgets: [{ id: 'TIMESERIES', token: 't', request: {} }] }) };
    }
    if (!u.includes('/api/')) return { ok: true, status: 200, headers: {}, text: async () => '' };
    const topics = sent[sent.length - 1][0].startsWith('/m/');
    const rows = topics ? [] : Array.from({ length: 10 }, (_, i) => day(i));
    return { ok: true, status: 200, text: async () => ")]}',\n" + JSON.stringify({ default: { timelineData: rows } }) };
  };
  const r = await x.searchesOf(fake, ['Nike', 'Adidas', 'On', 'Puma'], ['/m/1', '/m/2', null, null]);
  assert.deepEqual(sent, [['/m/1', '/m/2'], ['Nike', 'Adidas', 'Puma']]);
  assert.deepEqual(r.names, ['Nike', 'Adidas', 'Puma']);
  assert.equal(r.days.length, 10);
});
