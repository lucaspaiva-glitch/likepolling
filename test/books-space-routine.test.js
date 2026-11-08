const test = require('node:test');
const assert = require('node:assert/strict');
const books = require('../scripts/books-routine');
const space = require('../scripts/space-routine');

test('books: ranked rows with first author and cover, bad works skipped', () => {
  const rows = books.toRows('2026-11-08', { works: [{ key: '/works/OL1W', title: 'Atomic Habits', author_name: ['James Clear', 'X'], cover_i: 5, first_publish_year: 2016 }, { key: 'bad', title: 'No' }, { key: '/works/OL2W', title: 'Dune' }] });
  assert.deepEqual(rows, [
    { day: '2026-11-08', rank: 1, work_key: '/works/OL1W', title: 'Atomic Habits', author: 'James Clear', cover_id: 5, first_year: 2016 },
    { day: '2026-11-08', rank: 2, work_key: '/works/OL2W', title: 'Dune', author: null, cover_id: null, first_year: null },
  ]);
});

test('space: launches keep the site country, news keep title/link/site only', () => {
  const [l] = space.launchRows({ results: [{ id: 'a1', name: 'Falcon 9 | X', net: '2026-11-10T03:03:00Z', status: { abbrev: 'Go' }, launch_service_provider: { name: 'SpaceX' }, pad: { location: { name: 'Cape Canaveral', country: { alpha_2_code: 'US' } } }, mission: { name: 'X' }, image: { image_url: 'https://img' } }, { id: 'b', name: 'bad', net: 'nope' }] });
  assert.deepEqual(l, { id: 'a1', name: 'Falcon 9 | X', net: '2026-11-10T03:03:00.000Z', status: 'Go', provider: 'SpaceX', country_code: 'US', site: 'Cape Canaveral', mission: 'X' });
  const n = space.newsRows({ results: [{ id: 7, title: 'Hi', url: 'https://s.com/a', news_site: 'S', published_at: '2026-11-08T01:00:00Z', image_url: 'https://img', summary: 'long' }, { id: 8, title: 'x', url: 'http://insecure', published_at: '2026-11-08T01:00:00Z' }] });
  assert.deepEqual(n, [{ id: 7, title: 'Hi', url: 'https://s.com/a', site: 'S', published_at: '2026-11-08T01:00:00.000Z' }]);
});
