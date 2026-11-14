#!/usr/bin/env node
// AI Builders memory: once a week, saves from the GitHub API (free, official) the 10 most-starred AI projects
// created in the last 7 days into public.github_ai_repos_weekly, and how many new GitHub accounts each tracked
// country got in those 7 days (by the country written in the profile) into public.github_new_devs_weekly.
// With GEMINI_API_KEY, each project also gets a plain-language title and sentence in every site language (plain).
//   node scripts/github-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key), GITHUB_TOKEN (optional, raises the search limit), GEMINI_API_KEY (optional). Node >= 20.
'use strict';

const { COUNTRIES } = require('../lib/report.js');
const API = 'https://api.github.com/search';
const TOPICS = ['ai', 'llm', 'artificial-intelligence', 'machine-learning', 'ai-agents', 'generative-ai'];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const iso = (d) => d.toISOString().slice(0, 10);

function topRepos(lists, day, n = 10) {
  const by = new Map();
  for (const r of lists.flat()) if (r && r.full_name && !r.fork && !by.has(r.full_name)) by.set(r.full_name, r);
  return [...by.values()].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, n).map((r, i) => ({
    day, rank: i + 1, full_name: r.full_name.slice(0, 140), description: r.description ? String(r.description).slice(0, 200) : null,
    stars: r.stargazers_count, language: r.language || null, url: r.html_url }));
}

// { en: { t, d }, pt: { t, d }, … } for each repo, or null when Gemini's reply doesn't fit.
async function plainNames(repos, ask) {
  const { SITE_LANGS, LANG_LIST } = require('./news-world-routine.js');
  const input = repos.map((r, id) => ({ id, name: r.full_name, description: r.description, language: r.language }));
  const prompt = `Below are new AI projects from GitHub. For each one, write for people who have never written code:
- "t": a short title (at most 7 words) that says what the project does for its user, for example "Lets AI use a real iPhone". No project names, no jargon (no "agent", "MCP", "LLM", "CLI", "SDK", "repo"; say "AI assistant", "tool", "app" instead).
- "d": one short sentence (at most 20 words) that explains it more, in the same plain words.
Use only what the name and description say; do not guess features. If there is too little to tell what it does, set both to null.
Write both in each of these languages: ${LANG_LIST}, as a native writer would.
Reply with only a JSON array with one object per project, in the same order: {"id": number, ${SITE_LANGS.map((l) => `"${l}": {"t": string, "d": string}`).join(', ')}}.

${JSON.stringify(input)}`;
  const out = await ask(prompt);
  if (!Array.isArray(out)) throw new Error('plain titles: not an array');
  const ok = (v) => v && typeof v.t === 'string' && v.t.trim() && v.t.length <= 90 && typeof v.d === 'string' && v.d.length <= 240;
  return repos.map((r, i) => {
    const o = out.find((x) => x && x.id === i);
    return o && SITE_LANGS.every((l) => ok(o[l])) ? Object.fromEntries(SITE_LANGS.map((l) => [l, { t: o[l].t.trim(), d: o[l].d.trim() }])) : null;
  });
}

async function main(env = process.env, now = new Date()) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required.');
  const headers = { 'User-Agent': 'LikePolling/1.0 (https://www.likepolling.com)', Accept: 'application/vnd.github+json', ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) };
  const gap = env.GITHUB_TOKEN ? 2200 : 6500;
  const get = async (q, extra = '') => {
    for (let k = 0; k < 3; k++) {
      const r = await fetch(`${API}/${q}${extra}`, { headers, signal: AbortSignal.timeout(20000) });
      if (r.ok) return r.json();
      if (r.status !== 403 && r.status !== 429) throw new Error(`GitHub ${r.status}`);
      await sleep(30000);
    }
    throw new Error('GitHub rate limit');
  };
  const to = new Date(now.getTime() - 864e5), from = new Date(now.getTime() - 7 * 864e5);
  const day = iso(now), span = `${iso(from)}..${iso(to)}`;
  const lists = [];
  for (const t of TOPICS) { lists.push((await get(`repositories?q=${encodeURIComponent(`topic:${t} created:${span}`)}`, '&sort=stars&order=desc&per_page=30')).items || []); await sleep(gap); }
  const repos = topRepos(lists, day);
  if (env.GEMINI_API_KEY) {
    try {
      const plain = await plainNames(repos, require('./news-world-routine.js').geminiJson(env.GEMINI_API_KEY));
      repos.forEach((r, i) => { r.plain = plain[i]; });
    } catch (e) { console.error(`plain titles skipped: ${String(e.message).split('\n')[0]}`); }
  }
  const en = new Intl.DisplayNames(['en'], { type: 'region' });
  const devs = [];
  for (const cc of COUNTRIES) {
    const d = await get(`users?q=${encodeURIComponent(`location:"${en.of(cc)}" created:${span}`)}`, '&per_page=1');
    devs.push({ day, country_code: cc, accounts: Number(d.total_count) || 0 });
    await sleep(gap);
  }
  if (repos.length < 5 || devs.filter((d) => d.accounts).length < 20) throw new Error(`Too little data (${repos.length} repos); not saving.`);
  const key = env.SUPABASE_KEY.trim(), base = env.SUPABASE_URL.trim().replace(/\/$/, '');
  for (const [table, rows, on] of [['github_ai_repos_weekly', repos, 'day,full_name'], ['github_new_devs_weekly', devs, 'day,country_code']]) {
    const w = await fetch(`${base}/rest/v1/${table}?on_conflict=${on}`, { method: 'POST', body: JSON.stringify(rows),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
    if (!w.ok) throw new Error(`write ${table} ${w.status} ${await w.text()}`);
  }
  const top = [...devs].sort((a, b) => b.accounts - a.accounts).slice(0, 5).map((d) => `${d.country_code} ${d.accounts}`).join(', ');
  console.log(`github: ${repos.length} AI projects (top: ${repos[0].full_name}, ${repos[0].stars} stars); new accounts ${top}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, topRepos, plainNames };
