#!/usr/bin/env node
// Data of the week: once a week, saves the latest TidyTuesday dataset (github.com/rfordatascience/tidytuesday,
// CC0) into public.data_week: its title, a short plain-words summary, up to 3 questions to explore, and its source.
//   node scripts/data-week-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key). Optional GITHUB_TOKEN (higher GitHub rate limit).
'use strict';
const { USER_AGENT, fetchBody, setup, rpc } = require('./memory-common');

const REPO = 'rfordatascience/tidytuesday';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/data`;

// Markdown → plain text: links keep their words, emphasis and inline code marks go.
const plain = (s) => String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();

function parseReadme(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const title = plain((lines.find((l) => /^#\s/.test(l)) || '').replace(/^#\s+/, ''));
  const start = lines.findIndex((l) => /^#\s/.test(l)) + 1;
  const paras = [];
  let cur = [];
  for (const l of lines.slice(start)) {
    if (/^(#{1,6}\s|>|```|---|\|)/.test(l.trim())) { if (paras.length || cur.length) break; continue; }
    if (!l.trim()) { if (cur.length) { paras.push(plain(cur.join(' '))); cur = []; } if (paras.length >= 2) break; continue; }
    cur.push(l);
  }
  if (cur.length && paras.length < 2) paras.push(plain(cur.join(' ')));
  let summary = paras.filter(Boolean).join(' ');
  if (/:$/.test(summary) && /[.!?]\s/.test(summary)) summary = summary.slice(0, summary.search(/[.!?]\s[^.!?]*:$/) + 1); // drop a lead-in to a list
  if (summary.length > 600) summary = `${summary.slice(0, 600).replace(/\s+\S*$/, '')}…`;
  const qi = lines.findIndex((l) => /^#{2,4}\s+Exploring the Data/i.test(l));
  const questions = [];
  if (qi >= 0) {
    for (const l of lines.slice(qi + 1)) {
      if (/^#{1,6}\s/.test(l)) break;
      const m = l.match(/^\s*[-*•]\s+(.+)/);
      if (m && questions.length < 3) questions.push(plain(m[1]).slice(0, 220));
    }
  }
  return { title, summary, questions };
}

// Reads the few flat fields we need from meta.yaml (title, data_source, first image).
function parseMeta(yaml) {
  const y = String(yaml || '').replace(/\r/g, '');
  const unq = (v) => (v ? v.trim().replace(/^["']|["']$/g, '') || null : null);
  const str = (re) => unq((y.match(re) || [])[1]);
  const src = y.match(/^data_source:\s*\n((?:[ \t]+.*\n?)*)/m);
  const img = y.match(/^images:\s*\n(?:\s*#.*\n)*\s*-\s*file:\s*(.+)\n(?:\s*alt:\s*>?-?\s*\n((?:[ \t]{4,}.*\n?)*)|\s*alt:\s*(.+))?/m);
  return {
    title: str(/^title:\s*(.+)$/m),
    source_title: src ? unq((src[1].match(/title:\s*(.+)/) || [])[1]) : null,
    source_url: src ? unq((src[1].match(/url:\s*(.+)/) || [])[1]) : null,
    image: img ? img[1].trim().replace(/^["']|["']$/g, '') : null,
    image_alt: img ? plain(img[2] || img[3] || '').slice(0, 400) || null : null,
  };
}

async function latestWeek(env, deps) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
  const today = deps.now.toISOString().slice(0, 10);
  for (const year of [deps.now.getUTCFullYear(), deps.now.getUTCFullYear() - 1]) {
    const list = await fetchBody(`https://api.github.com/repos/${REPO}/contents/data/${year}`, { headers }, deps);
    const weeks = (Array.isArray(list) ? list : []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n <= today).sort();
    if (weeks.length) return weeks[weeks.length - 1];
  }
  throw new Error('No TidyTuesday week found');
}

async function run(env = process.env, deps = {}) {
  deps = setup(env, deps);
  const week = await latestWeek(env, deps);
  const dir = `${RAW}/${week.slice(0, 4)}/${week}`;
  const get = (f) => fetchBody(`${dir}/${f}`, { headers: { 'User-Agent': USER_AGENT } }, deps, true).catch(() => null);
  const [readme, meta] = await Promise.all([get('readme.md'), get('meta.yaml')]);
  if (!readme) throw new Error(`No readme for ${week}`);
  const r = parseReadme(readme);
  const m = parseMeta(meta);
  const row = {
    week,
    title: (m.title || r.title).slice(0, 200),
    summary: r.summary,
    questions: r.questions,
    source_title: m.source_title ? m.source_title.slice(0, 200) : null,
    source_url: m.source_url && /^https:\/\//.test(m.source_url) ? m.source_url : null,
    folder_url: `https://github.com/${REPO}/tree/main/data/${week.slice(0, 4)}/${week}`,
    image_url: m.image && /^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(m.image) ? `${dir}/${m.image}` : null,
    image_alt: m.image_alt,
  };
  if (!row.title || !row.summary) throw new Error(`Could not read ${week}`);
  await rpc(env, deps, 'upsert_data_week', row);
  deps.log(JSON.stringify({ week, title: row.title, questions: row.questions.length }));
  return row;
}

module.exports = { run, parseReadme, parseMeta, plain };
if (require.main === module) run().catch((err) => { console.error(`Data of the week routine failed: ${err.message}`); process.exit(1); });
