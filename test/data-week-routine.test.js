const test = require('node:test');
const assert = require('node:assert/strict');
const dw = require('../scripts/data-week-routine');

const README = `# IKEA Sofas and Their [Swedish](https://x.se) Places

This week's data is **IKEA sofas**.
They are named after places.

Second paragraph here. It looks at things like:

> a quote

### Exploring the Data

Here are a few questions:

- Which country pays the most?
- Are sofa names *longer*?
- Q3
- Q4

## The Data
`;
const META = `title: "IKEA Sofas"
article:
  title: "IKEA place names"
  url: "https://karaman.is/ikea"
data_source:
  title: "IKEA product listings"
  url: "https://nominatim.openstreetmap.org/"
images:
# Please include at least one image
- file: "ikea.png"
  alt: >
    Map of Sweden with
    a dot per place.
credit:
  post: "G"
`;

test('readme: title, two plain paragraphs, at most 3 questions', () => {
  const r = dw.parseReadme(README);
  assert.equal(r.title, 'IKEA Sofas and Their Swedish Places');
  assert.equal(r.summary, "This week's data is IKEA sofas. They are named after places. Second paragraph here.");
  assert.deepEqual(r.questions, ['Which country pays the most?', 'Are sofa names longer?', 'Q3']);
});

test('meta: title, data source (not the article), first image and alt', () => {
  assert.deepEqual(dw.parseMeta(META), { title: 'IKEA Sofas', source_title: 'IKEA product listings', source_url: 'https://nominatim.openstreetmap.org/', image: 'ikea.png', image_alt: 'Map of Sweden with a dot per place.' });
});

test('run: picks the latest week up to today and saves one row', async () => {
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => body });
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('api.github.com')) return res(200, [{ name: '2026-10-27' }, { name: '2026-11-03' }, { name: '2026-11-10' }, { name: 'readme.md' }]);
    if (url.endsWith('readme.md')) return res(200, README);
    if (url.endsWith('meta.yaml')) return res(200, META);
    if (url.includes('/rpc/')) return res(200, 1);
    return res(404, '');
  };
  const row = await dw.run({ SUPABASE_URL: 'https://db.test', SUPABASE_KEY: 's' }, { fetch, log: () => {}, sleep: async () => {}, now: new Date('2026-11-08T06:00:00Z') });
  assert.equal(row.week, '2026-11-03');
  assert.equal(row.image_url, 'https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2026/2026-11-03/ikea.png');
  assert.equal(row.folder_url, 'https://github.com/rfordatascience/tidytuesday/tree/main/data/2026/2026-11-03');
  const saved = JSON.parse(calls.find((c) => c.url.endsWith('/rpc/upsert_data_week')).init.body).payload;
  assert.equal(saved.title, 'IKEA Sofas');
});
