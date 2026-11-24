#!/usr/bin/env node
// AI Builders memory: once a week, saves from the GitHub API (free, official) the 10 most-starred AI projects
// created in the last 7 days into public.github_ai_repos_weekly, and how many new GitHub accounts each tracked
// country got in those 7 days (by the country written in the profile) into public.github_new_devs_weekly.
// The same search over the last 30 and 365 days goes into public.github_ai_repos_top (period 'month' / 'year').
// With GEMINI_API_KEY, each project also gets a plain-language title and sentence in every site language (plain).
//   node scripts/github-routine.js
// Env: SUPABASE_URL, SUPABASE_KEY (secret key), GITHUB_TOKEN (optional, raises the search limit), GEMINI_API_KEY (optional). Node >= 20.
'use strict';

const { MAIN: COUNTRIES } = require('../lib/countries.js');
const API = 'https://api.github.com/search';
const MIN_COUNTRIES_WITH_ACCOUNTS = 12;
const TOPICS = ['ai', 'llm', 'artificial-intelligence', 'machine-learning', 'ai-agents', 'generative-ai'];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const iso = (d) => d.toISOString().slice(0, 10);

function topRepos(lists, day, n = 10) {
  const by = new Map(), seen = new Set();
  for (const r of lists.flat()) if (r && r.full_name && !r.fork && !by.has(r.full_name)) by.set(r.full_name, r);
  // Copies of one project under many accounts (same name or same description) count once.
  const once = (r) => {
    const keys = [r.full_name.split('/')[1].toLowerCase(), String(r.description || '').trim().toLowerCase()].filter(Boolean);
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  };
  return [...by.values()].sort((a, b) => b.stargazers_count - a.stargazers_count).filter(once).slice(0, n).map((r, i) => ({
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
  const key = env.SUPABASE_KEY.trim(), base = env.SUPABASE_URL.trim().replace(/\/$/, '');
  const db = { apikey: key, Authorization: `Bearer ${key}` };
  const to = new Date(now.getTime() - 864e5), day = iso(now);
  const since = (days) => `${iso(new Date(now.getTime() - days * 864e5))}..${iso(to)}`;
  const search = async (span) => {
    const lists = [];
    for (const t of TOPICS) { lists.push((await get(`repositories?q=${encodeURIComponent(`topic:${t} created:${span}`)}`, '&sort=stars&order=desc&per_page=30')).items || []); await sleep(gap); }
    return topRepos(lists, day);
  };
  const span = since(7);
  const repos = await search(span);
  const tops = [];
  for (const [period, days] of [['month', 30], ['year', 365]]) {
    const list = await search(since(days));
    if (list.length >= 5) tops.push(...list.map((r) => ({ ...r, period })));
  }
  const all = [...repos, ...tops];
  const known = new Map();
  const names = [...new Set(all.map((r) => r.full_name))].map((n) => `"${n.replace(/"/g, '')}"`).join(',');
  for (const table of ['github_ai_repos_weekly', 'github_ai_repos_top']) {
    try {
      const r = await fetch(`${base}/rest/v1/${table}?select=full_name,plain&plain=not.is.null&full_name=in.(${encodeURIComponent(names)})&order=day.desc`, { headers: db });
      if (r.ok) for (const x of await r.json()) if (!known.has(x.full_name)) known.set(x.full_name, x.plain);
    } catch { /* write them fresh */ }
  }
  const todo = [...new Map(all.filter((r) => !known.has(r.full_name)).map((r) => [r.full_name, r])).values()];
  if (env.GEMINI_API_KEY && todo.length) {
    const ask = require('./news-world-routine.js').geminiJson(env.GEMINI_API_KEY);
    for (let i = 0; i < todo.length; i += 10) {
      const part = todo.slice(i, i + 10);
      try { (await plainNames(part, ask)).forEach((p, j) => { if (p) known.set(part[j].full_name, p); }); }
      catch (e) { console.error(`plain titles skipped: ${String(e.message).split('\n')[0]}`); }
    }
  }
  for (const r of all) r.plain = known.get(r.full_name) || null;
  const en = new Intl.DisplayNames(['en'], { type: 'region' });
  const devs = [];
  for (const cc of COUNTRIES) {
    const d = await get(`users?q=${encodeURIComponent(`location:"${en.of(cc)}" created:${span}`)}`, '&per_page=1');
    devs.push({ day, country_code: cc, accounts: Number(d.total_count) || 0 });
    await sleep(gap);
  }
  const countriesWithAccounts = devs.filter((d) => d.accounts).length;
  if (repos.length < 5 || countriesWithAccounts < MIN_COUNTRIES_WITH_ACCOUNTS) {
    throw new Error(`Too little data (${repos.length}/5 repos, ${countriesWithAccounts}/${MIN_COUNTRIES_WITH_ACCOUNTS} countries with new accounts); not saving.`);
  }
  for (const [table, rows, on] of [['github_ai_repos_weekly', repos, 'day,full_name'], ['github_new_devs_weekly', devs, 'day,country_code'], ['github_ai_repos_top', tops, 'day,period,full_name']]) {
    if (!rows.length) continue;
    if (table !== 'github_new_devs_weekly') await fetch(`${base}/rest/v1/${table}?day=eq.${day}`, { method: 'DELETE', headers: db });
    const w = await fetch(`${base}/rest/v1/${table}?on_conflict=${on}`, { method: 'POST', body: JSON.stringify(rows),
      headers: { ...db, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
    if (!w.ok) throw new Error(`write ${table} ${w.status} ${await w.text()}`);
  }
  const top = [...devs].sort((a, b) => b.accounts - a.accounts).slice(0, 5).map((d) => `${d.country_code} ${d.accounts}`).join(', ');
  console.log(`github: ${repos.length} AI projects, ${tops.length} month/year rows (top: ${repos[0].full_name}, ${repos[0].stars} stars); new accounts ${top}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { main, topRepos, plainNames, TOPICS };
