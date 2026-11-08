#!/usr/bin/env node
// Books memory: once a day, saves Open Library's weekly trending books (top 20, worldwide) into public.books_daily.
// Open Library (Internet Archive) asserts no copyright over its catalog data.
//   node scripts/books-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key).
'use strict';
const { USER_AGENT, fetchBody, setup, rpc } = require('./memory-common');

const API = 'https://openlibrary.org/trending/weekly.json?limit=20';

function toRows(day, body) {
  const works = (body && Array.isArray(body.works) ? body.works : []).filter((w) => w && /^\/works\/OL\d+W$/.test(w.key || '') && w.title);
  return works.slice(0, 20).map((w, i) => ({
    day, rank: i + 1, work_key: w.key, title: String(w.title).slice(0, 300),
    author: Array.isArray(w.author_name) && w.author_name.length ? String(w.author_name[0]).slice(0, 200) : null,
    cover_id: Number.isInteger(w.cover_i) && w.cover_i > 0 ? w.cover_i : null,
    first_year: Number.isInteger(w.first_publish_year) ? w.first_publish_year : null,
  }));
}

async function run(env = process.env, deps = {}) {
  deps = setup(env, deps);
  const day = deps.now.toISOString().slice(0, 10);
  const rows = toRows(day, await fetchBody(API, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, deps));
  if (!rows.length) throw new Error('No trending books fetched');
  const written = await rpc(env, deps, 'replace_books_daily', rows);
  const summary = { day, rows: written, top: rows[0].title };
  deps.log(JSON.stringify(summary));
  return summary;
}

module.exports = { run, toRows };
if (require.main === module) run().catch((err) => { console.error(`Books routine failed: ${err.message}`); process.exit(1); });
