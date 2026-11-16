#!/usr/bin/env node
// Fills new site languages into assets/i18n.js (rows of 7 -> 10: fr, zh, hi) and
// assets/report-i18n.js (adds "fr", "zh", "hi" objects) with Gemini. Idempotent:
// rows and keys that already have the languages are skipped.
//   GEMINI_API_KEY=... node scripts/translate-ui.js [--dry]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NEW = { fr: 'French', zh: 'Simplified Chinese (mainland China)', hi: 'Hindi (Devanagari script)' };
const OLD_COLS = 7;
const BATCH = 40;
const UI = path.join(__dirname, '..', 'assets', 'i18n.js');
const REPORT = path.join(__dirname, '..', 'assets', 'report-i18n.js');
const holders = (s) => (String(s).match(/\$\d|\{[a-z]+\}|<[^>]+>|https?:\/\/[\w./-]*\w/g) || []).sort().join('|');

// Each [ ... ] of exactly OLD_COLS string literals on a line: { line, start, end, values }.
function arrays(lines) {
  const out = [];
  lines.forEach((l, line) => {
    for (let i = l.indexOf('['); i >= 0; i = l.indexOf('[', i + 1)) {
      let q = null, depth = 0, j = i;
      for (; j < l.length; j++) {
        const c = l[j];
        if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '[') depth++;
        else if (c === ']' && --depth === 0) break;
      }
      if (j >= l.length) continue;
      let v;
      try { v = Function(`return ${l.slice(i, j + 1)}`)(); } catch (e) { continue; }
      if (Array.isArray(v) && (v.length === OLD_COLS || v.length === OLD_COLS + 3) && v.every((x) => typeof x === 'string')) {
        out.push({ line, start: i, end: j, values: v, context: l.slice(0, i).trim() });
        i = j;
      }
    }
  });
  return out;
}

async function translateAll(items, ask) {
  const done = new Map();
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    for (let attempt = 0; attempt < 3 && batch.some((b) => !done.has(b.id)); attempt++) {
      const todo = batch.filter((b) => !done.has(b.id));
      const prompt = `You translate the user interface of Like Polling, a website that explains what the world watches, reads and searches (news, YouTube, fashion, AI, reports) in plain words for regular people.
For each item, "en" is the English text (for a regex pattern, the text it matches, with $1 standing for the captured part) and "es"/"pt" are existing Spanish and Brazilian Portuguese versions of the same UI text, for context and length.
Translate the English into: ${Object.entries(NEW).map(([k, v]) => `"${k}" (${v})`).join(', ')}. Keep it short, natural and friendly, like the Spanish. Keep exactly the same placeholders ($1, {x}, {date} ...), HTML tags, URLs, numbers and brand names (Like Polling, YouTube, Google, GitHub, Gemini, Creators +, Chrome, Gumroad, Wikipedia). If "es" is an empty string, return empty strings. Keep leading/trailing spaces as in "es".
Reply with only a JSON array, one object per item in the same order: {"id": number, "fr": string, "zh": string, "hi": string}.
Items:
${JSON.stringify(todo.map((b) => ({ id: b.id, en: b.en, es: b.es, pt: b.pt })))}`;
      let reply = [];
      try { reply = await ask(prompt); } catch (e) { console.error('Gemini:', e.message); continue; }
      for (const r of Array.isArray(reply) ? reply : []) {
        const b = todo.find((x) => x.id === r.id);
        if (!b || !Object.keys(NEW).every((k) => typeof r[k] === 'string')) continue;
        const ok = Object.keys(NEW).every((k) => (b.es === '' ? true : r[k].trim() !== '' && holders(r[k]) === holders(b.es)));
        if (ok) done.set(b.id, Object.fromEntries(Object.keys(NEW).map((k) => [k, b.es === '' ? '' : r[k]])));
      }
    }
    console.log(`translated ${done.size}/${items.length}`);
  }
  return done;
}

async function main() {
  const dry = process.argv.includes('--dry');
  let ask = null;
  if (!dry) {
    const { geminiJson } = require('./news-world-routine.js');
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
    ask = geminiJson(process.env.GEMINI_API_KEY);
  }

  // Site UI rows.
  const lines = fs.readFileSync(UI, 'utf8').split('\n');
  // English source of a row: the dictionary key as plain text (or the regex source for patterns).
  const enOf = (a) => {
    const raw = a.context.replace(/^[\[{,\s]+|[:,\s]+$/g, '');
    const lit = raw.match(/(["'])(?:\\.|(?!\1).)*\1$/);
    try { return lit ? Function(`return ${lit[0]}`)() : raw; } catch (e) { return raw; }
  };
  const QUOTE = /^[«“"'„「]|[»”"'“」]$/;
  // Rows still at 7 languages, or filled badly by an earlier run (English fallback, added quotes).
  const rows = arrays(lines).filter((a) => !/^(const COLS|const LANGS)/.test(a.context))
    .filter((a) => a.values.length === OLD_COLS || a.values[1] !== '' && (a.values[8] === enOf(a) || a.values[8] === a.context.replace(/^[\[{,\s]+|[:,\s]+$/g, '')
      || a.values.slice(OLD_COLS).some((v) => QUOTE.test(v)) && !QUOTE.test(a.values[1])));
  const uiItems = rows.map((a, id) => ({ id, en: enOf(a), pt: a.values[0], es: a.values[1] }));
  // Report text.
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(REPORT, 'utf8'), sandbox);
  const dict = sandbox.window.LP_REPORT_DICT;
  const keys = Object.keys(dict.pt).filter((k) => Object.keys(NEW).some((l) => !(dict[l] && k in dict[l]) || dict[l][k] === k));
  const repItems = keys.map((k, i) => ({ id: 100000 + i, en: k, pt: dict.pt[k], es: (dict.es || {})[k] ?? dict.pt[k] }));
  console.log(`ui rows ${uiItems.length}, report keys ${repItems.length}`);
  if (dry) { console.log(uiItems.slice(0, 3), repItems.slice(0, 2)); return; }

  const got = await translateAll([...uiItems, ...repItems], ask);
  const missing = [...uiItems, ...repItems].filter((b) => !got.has(b.id));
  if (missing.length) console.error(`untranslated (kept English): ${missing.length}`, missing.slice(0, 10).map((b) => b.en));

  // Write UI rows back, last array on a line first so offsets stay valid.
  for (const a of [...rows].sort((x, y) => y.line - x.line || y.start - x.start)) {
    const id = rows.indexOf(a);
    if (!got.has(id) && a.values.length > OLD_COLS) continue;
    const t = got.get(id) || { fr: uiItems[id].en, zh: uiItems[id].en, hi: uiItems[id].en };
    const l = lines[a.line];
    const vals = [...a.values.slice(0, OLD_COLS), ...Object.keys(NEW).map((k) => t[k])].map((v) => JSON.stringify(v)).join(', ');
    lines[a.line] = `${l.slice(0, a.start)}[${vals}]${l.slice(a.end + 1)}`;
  }
  fs.writeFileSync(UI, lines.join('\n'));

  // (Re)write the new report language blocks before the closing "};".
  let rep = fs.readFileSync(REPORT, 'utf8');
  for (const l of Object.keys(NEW)) {
    const at = rep.indexOf(`\n${JSON.stringify(l)}: {\n`);
    if (at >= 0) rep = rep.slice(0, at) + rep.slice(rep.indexOf('\n},', at) + 3);
  }
  rep = rep.replace(/\}\s*\};\s*$/, '},\n};\n');
  const blocks = Object.keys(NEW).map((l) => `${JSON.stringify(l)}: {\n${Object.keys(dict.pt).map((k) => {
    const i = keys.indexOf(k);
    const v = i >= 0 && got.has(100000 + i) ? got.get(100000 + i)[l] : (dict[l] && dict[l][k]) || k;
    return `${JSON.stringify(k)}: ${JSON.stringify(v)},`;
  }).join('\n')}\n},`).join('\n');
  const end = rep.lastIndexOf('};');
  rep = `${rep.slice(0, end)}${blocks.replace(/,$/, '')}\n${rep.slice(end)}`;
  fs.writeFileSync(REPORT, rep);
}

main().catch((e) => { console.error(e); process.exit(1); });
