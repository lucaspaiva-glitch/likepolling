'use strict';
const { logGemini, isNoCredit } = require('../lib/gemini-usage');
// Automatic ad spot. Up to 6 paid wagons and 10 paid plane brands at a time, 7 days each, queued by activation time.
//   GET  /api/ad                         live paid cards (up to 6 wagons, 10 planes), free spots, and when the next one frees up
//   POST /api/ad {key, brand, kind, website, tagline?, instagram?, video?}   activate a paid Gumroad key
//   GET  /api/ad?admin=TOKEN / POST {admin, id, action: approve|remove}   owner controls (AD_ADMIN_TOKEN)
// Checks before a card can go live: paid, unused key; a real HTTPS site that names the brand; text
// rules; a blocklist (gambling, adult, scams, weapons, drugs); and one Gemini safety pass that says safe (goes live
// right away) or unsafe (refused). Only if Gemini can't answer at all is the card held for the owner.
const crypto = require('crypto');

const VERIFY = 'https://api.gumroad.com/v2/licenses/verify';
const WEEK = 7 * 864e5;
const SLOTS = { wagon: 6, plane: 10 }; // paid wagons on the left truck, paid plane flybys on the right
const LANES = { wagon: ['wagon', 'both'], plane: ['plane', 'both'] };
const uses = (r, lane) => LANES[lane].includes(r.placement || 'wagon');
// Gumroad version name -> placement: "Plane" (or Avião / Avión) gets the flyby, anything else a wagon.
const placementOf = (v) => (/plane|avi[aã]o|avi[oó]n/i.test(v || '') ? 'plane' : 'wagon');
const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
const SHORTENERS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|cutt\.ly|rebrand\.ly|buff\.ly|shorturl\.at|tiny\.cc|rb\.gy|linktr\.ee|lnk\.bio|beacons\.ai|wa\.me)$/i;
const BLOCK = new RegExp([
  '\\b(bets?|betting|bookmakers?|casinos?|poker|slots?|roulette|jackpots?|gambl\\w*|apuestas?|apostas?|cassinos?|sportwetten|wetten|lotter\\w*|lotto|tipster\\w*)\\b',
  '\\b(porn\\w*|xxx|nsfw|escorts?|onlyfans|camgirls?|nudes?|sex\\w*|erotic\\w*|viagra|cialis)\\b',
  '\\b(cannabis|marijuana|weed|thc|kratom|steroids?|firearms?|guns?|ammo|ammunition|weapons?|vapes?|vaping|tobacco|cigarettes?)\\b',
  '\\b(airdrops?|forex signals?|double your|get rich|guaranteed (returns?|profits?)|payday loans?|pyramid)\\b',
  'казино|ставк|букмекер|порно|カジノ|ギャンブル|賭博|アダルト|카지노|베팅|도박|토토|博彩|赌',
].join('|'), 'i');
// Glued-together gambling names such as BetKing, Bet365 or SuperCasino, checked on brand + domain.
const BLOCK_GLUED = /^bet(?!ter|h)|(sport|sporty|super|mega|win|1x|x)bet|bet\d|\dbet|casino|poker|gambl|wager|bingo|lotto|aposta|apuesta|sportsbook|xxx|porn/;
const blocked = (...parts) => BLOCK.test(parts.join(' ')) || parts.some((p) => BLOCK_GLUED.test(squash(p)));

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (s, m) => new HttpError(s, m);
const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const squash = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u0400-\u04ff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g, '');
const hash = (k) => crypto.createHash('sha256').update(String(k).trim()).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// YouTube link (watch, youtu.be, shorts or embed) -> 11-character id; '' when empty, undefined when not YouTube.
function videoId(s) {
  const t = clean(s);
  if (!t) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
  let u;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return undefined; }
  const h = u.hostname.replace(/^(www|m)\./, '');
  const id = h === 'youtu.be' ? u.pathname.slice(1) : /^youtube(-nocookie)?\.com$/.test(h) ? (u.searchParams.get('v') || (/^\/(shorts|embed|live)\/([^/]+)/.exec(u.pathname) || [])[2]) : null;
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : undefined;
}

// The video must exist and allow playing on other sites; its title goes to the safety check.
async function checkVideo(id, fetchImpl) {
  if (!id) return null;
  let r;
  try { r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(8000) }); } catch { r = null; }
  if (!r || !r.ok) throw fail(422, 'Video: that YouTube video wasn\'t found, is private, or can\'t be played on other sites.');
  const j = await r.json().catch(() => ({}));
  const v = { title: clean(j.title).slice(0, 160), channel: clean(j.author_name).slice(0, 80) };
  if (blocked(v.title, v.channel)) throw fail(422, 'We don\'t take ads for gambling, betting, adult content, weapons, drugs or get-rich offers.');
  return v;
}

// Text rules. Returns the cleaned card or throws 422 with a plain-words reason.
function checkText(b) {
  const v = {
    brand: clean(b.brand), kind: clean(b.kind), website: clean(b.website), tagline: clean(b.tagline),
    instagram: clean(b.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, ''),
    video: videoId(b.video),
  };
  if (v.video === undefined) throw fail(422, 'Video: paste a YouTube link, e.g. https://youtu.be/abc123XYZ_0.');
  if (v.brand.length < 2 || v.brand.length > 24) throw fail(422, 'Brand name: 2 to 24 characters.');
  if (v.kind.length < 2 || v.kind.length > 30) throw fail(422, 'Kind of company: 2 to 30 characters.');
  if (v.tagline.length > 60) throw fail(422, 'Slogan: 60 characters at most.');
  if (v.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(v.instagram)) throw fail(422, 'Instagram: just the @name, e.g. @yourbrand.');
  const text = `${v.brand} ${v.kind} ${v.tagline}`;
  if (/https?:|www\.|\.[a-z]{2,}\/|@/i.test(text)) throw fail(422, 'No links or @names in the text. Put the website and Instagram in their own boxes.');
  if (/\p{Extended_Pictographic}/u.test(text)) throw fail(422, 'No emojis, please. The card is text only.');
  const caps = v.tagline.replace(/[^A-Za-z]/g, '');
  if (caps.length > 8 && caps === caps.toUpperCase()) throw fail(422, 'Slogan: no ALL CAPS, please.');
  if (/(.)\1{4,}/.test(text)) throw fail(422, 'That text looks like spam. Write it as a normal sentence.');
  if (blocked(v.brand, v.kind, v.tagline)) throw fail(422, 'We don\'t take ads for gambling, betting, adult content, weapons, drugs or get-rich offers.');
  let u;
  try { u = new URL(/^https?:\/\//i.test(v.website) ? v.website : `https://${v.website}`); } catch { throw fail(422, 'Website: use the full address, e.g. https://yourbrand.com.'); }
  if (u.protocol !== 'https:' || !/\.[a-z]{2,}$/i.test(u.hostname) || u.username || u.port) throw fail(422, 'Website: it must be a normal https:// address.');
  if (SHORTENERS.test(u.hostname)) throw fail(422, 'Website: use your own site, not a link shortener or link page.');
  v.website = `https://${u.hostname.toLowerCase()}${u.pathname === '/' ? '' : u.pathname}`;
  return v;
}

// The site must open over HTTPS, not be a shortener after redirects, and name the brand.
async function checkSite(v, fetchImpl) {
  let res;
  try { res = await fetchImpl(v.website, { redirect: 'follow', headers: { 'User-Agent': 'LikePolling-AdCheck/1.0 (+https://www.likepolling.com/terms)', Accept: 'text/html' }, signal: AbortSignal.timeout(9000) }); } catch { throw fail(422, 'We couldn\'t open your website. Check the address and try again.'); }
  if (!res || res.status >= 400) throw fail(422, `Your website answered with an error (${res ? res.status : '?'}). Check the address and try again.`);
  const final = new URL(res.url || v.website);
  if (final.protocol !== 'https:' || SHORTENERS.test(final.hostname)) throw fail(422, 'Website: it must end on your own https:// site.');
  const html = String(await res.text()).slice(0, 400000);
  const title = clean((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]).slice(0, 160);
  const desc = clean((/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i.exec(html) || [])[1]).slice(0, 300);
  const b = squash(v.brand);
  if (b.length >= 2 && !squash(final.hostname).includes(b) && !squash(html.replace(/<[^>]+>/g, ' ')).includes(b)) throw fail(422, 'Your brand name doesn\'t appear on that website. Use the brand name as it appears on your site.');
  if (blocked(`${title} ${desc}`, final.hostname.replace(/\.[a-z]+$/i, ''))) throw fail(422, 'We don\'t take ads for gambling, betting, adult content, weapons, drugs or get-rich offers.');
  return { title, desc, host: final.hostname };
}

// Gemini safety pass: a yes/no decision. "unclear" only when no model answered.
async function aiCheck(env, fetchImpl, v, site, video) {
  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) return { verdict: 'unclear', reason: 'No safety check available' };
  const prompt = `You review ads for a public website whose audience includes teenagers. Rules: no gambling or betting, no adult or sexual content, no weapons, drugs, tobacco or vaping, no scams, crypto or get-rich offers, no hate, no political ads, no fake or impersonated brands, nothing misleading.
Ad: brand "${v.brand}", kind "${v.kind}", tagline "${v.tagline}", website ${site.host} (title "${site.title}", description "${site.desc}")${video ? `, YouTube video "${video.title}" by "${video.channel}"` : ''}.
Decide now, no human will review it: "unsafe" only if it clearly breaks a rule, otherwise "safe".
Answer JSON only: {"verdict":"safe"|"unsafe","reason":"short reason"}.`;
  for (const m of GEMINI_MODELS) {
    try {
      const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
      });
      if (r.status === 404) continue;
      const j = await r.json();
      if (r.ok || r.status === 402) await logGemini({ source: 'ad', model: m, usage: j && j.usageMetadata, status: r.ok ? 'ok' : 'no_credit' }, { env, fetchImpl });
      const out = JSON.parse(j.candidates[0].content.parts[0].text);
      if (['safe', 'unsafe'].includes(out.verdict)) return { verdict: out.verdict, reason: clean(out.reason).slice(0, 200) };
    } catch { /* try the next model */ }
  }
  return { verdict: 'unclear', reason: 'Safety check didn\'t answer' };
}

async function gumroad(env, fetchImpl, key, increment) {
  const id = String(env.GUMROAD_AD_PRODUCT_ID || '').trim();
  if (!id) throw fail(503, 'Ad activation isn\'t set up yet.');
  const res = await fetchImpl(VERIFY, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ product_id: id, license_key: key, increment_uses_count: String(increment) }).toString(),
  });
  const j = await res.json().catch(() => null);
  if (!j || res.status >= 500) throw fail(502, 'Gumroad didn\'t answer. Try again in a minute.');
  if (!j.success || !j.purchase) throw fail(404, 'That key wasn\'t found. Copy it from your Gumroad receipt.');
  const p = j.purchase;
  if (p.refunded || p.disputed || p.chargebacked) throw fail(403, 'This key was refunded or turned off.');
  return j;
}

function db(env, fetchImpl) {
  const base = `${String(env.SUPABASE_URL).trim().replace(/\/$/, '')}/rest/v1/`;
  const key = String(env.SUPABASE_KEY).trim();
  return async (method, path, body) => {
    const res = await fetchImpl(base + path, {
      method, signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw fail(502, `Database error (${res.status})`);
    return res.json();
  };
}

const PUBLIC = ['placement', 'brand', 'kind', 'website', 'tagline', 'instagram', 'video', 'ends_at'];
const pick = (r) => r && Object.fromEntries(PUBLIC.map((k) => [k, r[k] == null ? null : r[k]]));

// Ends finished cards and fills free wagons/planes from the queue, oldest first. Returns the live rows.
async function advance(q, now) {
  const live = [];
  for (const r of await q('GET', 'sponsors?status=eq.live&order=ends_at.asc&limit=40')) {
    if (Date.parse(r.ends_at) <= now) await q('PATCH', `sponsors?id=eq.${r.id}`, { status: 'done' });
    else live.push(r);
  }
  const room = (lane) => SLOTS[lane] - live.filter((r) => uses(r, lane)).length;
  if (room('wagon') > 0 || room('plane') > 0) {
    for (const n of await q('GET', 'sponsors?status=eq.queued&order=created_at.asc&limit=20')) {
      if (!Object.keys(LANES).every((l) => !uses(n, l) || room(l) > 0)) continue;
      const r = (await q('PATCH', `sponsors?id=eq.${n.id}&status=eq.queued`, { status: 'live', starts_at: new Date(now).toISOString(), ends_at: new Date(now + WEEK).toISOString() }))[0];
      if (r) live.push(r);
    }
  }
  return live;
}

// When a card with `ahead` queued cards in front of it gets a spot in one lane.
function startsAt(live, ahead, now, slots) {
  const free = Array.from({ length: slots }, (_, i) => (live[i] ? Date.parse(live[i].ends_at) : now)).sort((a, b) => a - b);
  let t = now;
  for (let k = 0; k <= ahead; k++) { t = free.shift(); free.push(t + WEEK); free.sort((a, b) => a - b); }
  return t;
}
const laneStart = (live, ahead, placement, now) => Math.max(...Object.keys(LANES).filter((l) => uses({ placement }, l))
  .map((l) => startsAt(live.filter((r) => uses(r, l)).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at)), ahead.filter((r) => uses(r, l)).length, now, SLOTS[l])));

async function activate(env, fetchImpl, q, body, now) {
  const key = clean(body.key);
  if (!/^[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/i.test(key)) throw fail(400, 'Paste the license key from your Gumroad receipt (4 blocks of 8 letters and numbers).');
  const v = checkText(body);
  const kh = hash(key);
  if ((await q('GET', `sponsors?select=id&key_hash=eq.${kh}`)).length) throw fail(409, 'This key was already used for an ad.');
  const g = await gumroad(env, fetchImpl, key, false);
  if (Number(g.uses) > 0) throw fail(409, 'This key was already used for an ad.');
  const site = await checkSite(v, fetchImpl);
  const video = await checkVideo(v.video, fetchImpl);
  const ai = await aiCheck(env, fetchImpl, v, site, video);
  if (ai.verdict === 'unsafe') throw fail(422, `This ad doesn't fit our rules (${ai.reason || 'safety check'}). Email lucaspaiva@likepolling.com for a refund or to change it.`);
  const placement = placementOf(g.purchase.variants);
  const row = (await q('POST', 'sponsors', { key_hash: kh, placement, ...v, tagline: v.tagline || null, instagram: v.instagram || null, video: v.video || null, status: ai.verdict === 'safe' ? 'queued' : 'held', reason: ai.reason || null }))[0];
  await gumroad(env, fetchImpl, key, true).catch(() => {});
  if (row.status === 'held') return { status: 'held' };
  const live = await advance(q, now);
  const mine = live.find((r) => r.id === row.id);
  if (mine) return { status: 'live', placement, starts_at: mine.starts_at, ends_at: mine.ends_at };
  const ahead = await q('GET', `sponsors?select=id,placement&status=eq.queued&created_at=lt.${encodeURIComponent(row.created_at)}`);
  return { status: 'queued', starts_at: new Date(laneStart(live, ahead, placement, now)).toISOString() };
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env, fetchImpl = deps.fetch || fetch;
    const now = deps.now ? deps.now() : Date.now();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw fail(503, 'Not configured');
      const q = db(env, fetchImpl);
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const token = String(env.AD_ADMIN_TOKEN || '').trim();
      const admin = (req.query && req.query.admin) || body.admin;
      if (admin) {
        if (!token || !safeEq(admin, token)) throw fail(403, 'Wrong admin link.');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'POST') {
          const id = Number(body.id);
          if (!Number.isInteger(id) || !['approve', 'remove'].includes(body.action)) throw fail(400, 'Bad action');
          await q('PATCH', `sponsors?id=eq.${id}${body.action === 'approve' ? '&status=eq.held' : ''}`, { status: body.action === 'approve' ? 'queued' : 'removed' });
          await advance(q, now);
        }
        return res.status(200).json({ ads: await q('GET', 'sponsors?select=id,placement,brand,kind,website,tagline,instagram,video,status,reason,starts_at,ends_at,created_at&order=created_at.desc&limit=40') });
      }
      if (req.method === 'POST') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(await activate(env, fetchImpl, q, body, now));
      }
      if (req.method !== 'GET') throw fail(405, 'Method not allowed');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
      const live = await advance(q, now);
      const waiting = await q('GET', 'sponsors?select=id,placement&status=eq.queued');
      const lane = (l) => {
        const free = Math.max(0, SLOTS[l] - live.filter((r) => uses(r, l)).length - waiting.filter((r) => uses(r, l)).length);
        return { free, next_at: free ? null : new Date(laneStart(live, waiting, l, now)).toISOString() };
      };
      return res.status(200).json({ live: live.map(pick), slots: SLOTS, wagons: lane('wagon'), planes: lane('plane') });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : err instanceof SyntaxError ? 400 : 500;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(status).json({ error: status === 500 ? 'Something went wrong. Try again in a minute.' : err.message });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.checkText = checkText;
module.exports.videoId = videoId;
