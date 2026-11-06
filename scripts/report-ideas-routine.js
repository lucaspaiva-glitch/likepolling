#!/usr/bin/env node
// Weekly "ideas to copy" for the Country Inspiration Report: for each tracked country, Gemini reads
// that country's last-30-days report (lib/report.js: Wikipedia + GDELT only) and writes 5 short ideas a brand or
// creator from another country could adapt. Saved in public.report_insights (private).
//   node scripts/report-ideas-routine.js        Env: SUPABASE_URL, SUPABASE_KEY (secret), GEMINI_API_KEY
'use strict';
const report = require('../lib/report');

const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const CONCURRENCY = 4;

function geminiJson(apiKey) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let m = 0;
  return async (prompt) => {
    for (;;) {
      try {
        return JSON.parse((await ai.models.generateContent({ model: GEMINI_MODELS[m], contents: prompt, config: { responseMimeType: 'application/json' } })).text);
      } catch (err) {
        if (m < GEMINI_MODELS.length - 1 && /NOT_FOUND|\b404\b/.test(String(err && err.message))) m++;
        else throw err;
      }
    }
  };
}

// Only the parts Gemini needs, kept small. Open data only (no YouTube or Google News data).
function digest(c) {
  return {
    country: c.country,
    most_read_wikipedia: c.wikipedia.map((w) => `${w.title} (${w.days} days in the top 30)`),
    rising_on_wikipedia_this_week: c.wikipedia_rising.map((w) => w.title),
    news_topics: c.news_focus.topics.map((t) => `${t.topic} ${t.pct}%`),
    news_cooperation_share: c.news_focus.cooperation_pct,
    countries_most_mentioned_with: c.news_partners.map((p) => p.country),
  };
}

function prompt(d) {
  return `You advise marketing agencies and creators who want inspiration from other countries.
Below is what people in country ${d.country} read most on Wikipedia, and what the news there talked about (GDELT), over the last 30 days.
Write exactly 5 concrete content or campaign ideas that a brand or creator from ANOTHER country could adapt from this.
Rules: use only the data below; never invent numbers, names or facts; no politics, tragedies, deaths or violence as campaign hooks; plain English.
Reply with only a JSON array of 5 objects: {"title": at most 8 words, "idea": at most 35 words, "based_on": the item(s) from the data it comes from, at most 12 words}.

${JSON.stringify(d)}`;
}

function clean(ideas) {
  if (!Array.isArray(ideas)) return [];
  const s = (v, n) => String(v || '').trim().slice(0, n);
  return ideas.filter((i) => i && i.title && i.idea).slice(0, 5).map((i) => ({ title: s(i.title, 80), idea: s(i.idea, 300), based_on: s(i.based_on, 140) }));
}

async function run(env = process.env, deps = {}) {
  const missing = ['SUPABASE_URL', 'SUPABASE_KEY', 'GEMINI_API_KEY'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
  const fetchImpl = deps.fetch || fetch;
  const log = deps.log || console.log;
  const ask = deps.ask || geminiJson(env.GEMINI_API_KEY);
  const get = report.rest(env, fetchImpl);
  const key = env.SUPABASE_KEY.trim();
  const queue = [...(deps.countries || report.COUNTRIES)];
  const done = [];
  const failed = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let cc; (cc = queue.shift());) {
      try {
        const ideas = clean(await ask(prompt(digest(await report.buildCountry(get, cc, new Date(), { ideas: false })))));
        if (ideas.length < 3) throw new Error(`only ${ideas.length} ideas`);
        const res = await fetchImpl(`${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/report_insights?on_conflict=country_code`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ country_code: cc, ideas, generated_at: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        done.push(cc);
      } catch (err) {
        failed.push(cc);
        log(`${cc}: ${String(err && err.message).split('\n')[0]}`);
      }
    }
  }));
  log(`Ideas saved for ${done.length} countries; failed: ${failed.join(', ') || 'none'}.`);
  // A failed run keeps last week's ideas; fail the job (GitHub emails) only if nearly everything failed.
  if (done.length < Math.ceil((deps.countries || report.COUNTRIES).length / 2)) throw new Error('Most countries failed.');
  return { done, failed };
}

if (require.main === module) run().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { run, digest, prompt, clean };
