// Machine-readable snapshot of the numbers Like Polling gathers, for AI assistants and crawlers
// that do not run JavaScript. Served as /llms.txt (summary), /llms-full.txt (all countries) and /data (HTML).
const SITE = 'https://www.likepolling.com';
const CACHE = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';
const TOP = 10;

function rest(env, fetchImpl) {
  const base = `${env.SUPABASE_URL.trim().replace(/\/$/, '')}/rest/v1/`;
  const key = env.SUPABASE_KEY.trim();
  const once = async (path) => {
    const res = await fetchImpl(base + path, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Database read failed (${res.status})`);
    return res.json();
  };
  return (path) => once(path).catch(() => once(path));
}

async function load(get) {
  const chart = 'select=country_code,rank,video_id,title,channel_title,view_count,published_at,fetched_at';
  const [users, trending, music, news, subjects, fashion, fashionVideos] = await Promise.all([
    get('youtube_active_users?select=country_code,country_name,online_users_estimate,updated_at&order=online_users_estimate.desc'),
    get(`youtube_trending?${chart}&rank=lte.${TOP}&order=country_code,rank&limit=1000`),
    get(`youtube_music_chart?${chart}&rank=lte.${TOP}&order=country_code,rank&limit=1000`),
    get('news_world?select=country_code,rank,title,source,link,published_at&rank=lte.5&order=country_code,rank&limit=1000'),
    get('education_subjects?select=country_code,rank,subject,video_count,news_count&rank=lte.5&order=country_code,rank&limit=1000'),
    get('news_fashion?select=country_code,rank,title,title_tr,source,link&title_tr->>fashion=eq.true&rank=lte.12&order=country_code,rank&limit=1000').catch(() => []),
    get('fashion_videos?select=country_code,rank,video_id,title,channel_title,channel_country,view_count,views_per_hour&rank=lte.5&order=country_code,rank&limit=1000').catch(() => []),
  ]);
  const by = (rows) => rows.reduce((m, r) => ((m[r.country_code] ||= []).push(r), m), {});
  const fashionBy = by(fashion);
  for (const k of Object.keys(fashionBy)) fashionBy[k] = fashionBy[k].slice(0, 3);
  const countries = users.map((u) => ({ code: u.country_code, name: u.country_name, live: Number(u.online_users_estimate) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Map();
  for (const r of trending) {
    const v = seen.get(r.video_id) || { title: r.title, channel: r.channel_title, countries: [] };
    v.countries.push(r.country_code);
    seen.set(r.video_id, v);
  }
  const worldwide = [...seen.entries()].map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.countries.length > 1).sort((a, b) => b.countries.length - a.countries.length).slice(0, TOP);
  const stamp = (rows, k) => rows.reduce((t, r) => (r[k] && r[k] > t ? r[k] : t), '');
  return {
    countries, worldwide,
    live: users.reduce((s, u) => s + (Number(u.online_users_estimate) || 0), 0),
    liveAt: stamp(users, 'updated_at'), trendingAt: stamp(trending, 'fetched_at'),
    trending: by(trending), music: by(music), news: by(news), subjects: by(subjects), fashion: fashionBy, fashionVideos: by(fashionVideos),
  };
}

const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-US'));
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const utc = (s) => (s ? `${new Date(s).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'unknown');
const yt = (id) => `https://www.youtube.com/watch?v=${id}`;
const en = (r) => (r.title_tr && r.title_tr.en && r.title_tr.en !== r.title ? r.title_tr.en : '');
const md = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/([\[\]|*_`])/g, '\\$1').trim();

const ABOUT = [
  'Like Polling (likepolling.com) tracks what people watch on YouTube in 41 countries (live viewer estimates, YouTube Trending videos, YouTube Music, education and fashion videos) and the top news headlines in each country.',
  'All data is free to read and cite. Please credit "Like Polling (likepolling.com)".',
];
const SECTIONS = [
  ['YouTube Trending videos', 'the most popular YouTube VIDEOS in each country, from YouTube\'s Trending chart. These are videos, not news.'],
  ['YouTube Music', 'the most popular music videos on YouTube in each country.'],
  ['World News headlines', 'the top NEWS stories in each country, from its Google News edition. Use this for questions about news, top news or trending news.'],
  ['Creator News', 'news headlines about YouTube and the creator economy (shown on the website).'],
  ['Fashion News headlines', 'fashion news stories in each country, from Google News, checked by AI to be about fashion.'],
  ['Fashion Index', 'the fastest-growing recent VIDEOS from the fashion magazine, brand and fashion week channels Like Polling tracks in each country.'],
  ['Education topics', 'the subjects people are learning about on YouTube and reading about in the news in each country.'],
  ['Estimated people watching YouTube', 'a modelled estimate of how many people are watching YouTube right now in each country.'],
];
const METHOD = [
  'Estimated live viewers are modelled, not measured: YouTube users per country (Google ad reach, late 2025, via DataReportal) × about 80 minutes of viewing per person per day, spread over the day by a typical hourly pattern. Recalculated every 15 minutes; large countries (US, Canada, Brazil, Mexico, Australia, Indonesia) are split across their time zones by population. Read them as an order of magnitude.',
  'Trending and Music: YouTube Data API "most popular" charts per country, refreshed hourly. Views are YouTube\'s public counts at fetch time.',
  'World News headlines: top stories from each country\'s Google News edition. Education topics: recent videos from education channels plus local news, grouped into subjects with Google Gemini (AI).',
  'Fashion News headlines: Google News fashion stories per country, kept only when Google Gemini (AI) confirms they are about fashion. Fashion Index: tracked fashion channels\' uploads from the last 30 days, ranked by views per hour; Portugal follows the Italian, Spanish, French and UK channels.',
];
const LINKS = [
  [`${SITE}/llms-full.txt`, 'every country: YouTube Trending videos, YouTube Music, World News headlines, Fashion, Education'],
  [`${SITE}/data`, 'the same numbers as HTML tables'],
  [`${SITE}/api/v1/worldwide`, 'JSON: videos trending in the most countries'],
  [`${SITE}/api/v1/news?country=US`, 'JSON: World News headlines for one country (news stories; add &topic=fashion for Fashion News)'],
  [`${SITE}/api/v1/trending?country=US`, 'JSON: YouTube Trending videos for one country (also /music, /education)'],
  [`${SITE}/api/v1/channel?handle=@MrBeast`, 'JSON: one channel\'s 30-day views, comments and estimated earnings'],
];

function markdown(d, full) {
  const out = [`# Like Polling`, '', `> ${ABOUT[0]}`, '', ABOUT[1], '', '## What each section is', '', ...SECTIONS.map(([k, v]) => `- **${k}**: ${v}`), ''];
  out.push(`## Estimated people watching YouTube right now`, '', `Total across ${d.countries.length} countries: about ${short(d.live)} (as of ${utc(d.liveAt)}).`, '');
  out.push('| Country | Code | Est. watching now |', '|---|---|---|');
  for (const c of [...d.countries].sort((a, b) => b.live - a.live)) out.push(`| ${md(c.name)} | ${c.code} | ${fmt(c.live)} |`);
  out.push('', `## YouTube Trending videos in the most countries (videos, not news)`, '', `From each country's YouTube Trending top ${TOP} as of ${utc(d.trendingAt)}.`, '');
  d.worldwide.forEach((v, i) => out.push(`${i + 1}. [${md(v.title)}](${yt(v.id)}) – ${md(v.channel)} – trending in ${v.countries.length} countries (${v.countries.join(', ')})`));
  const headline = (r) => `[${md(r.title)}](${r.link})${en(r) ? ` (English: ${md(en(r))})` : ''}${r.source ? ` – ${md(r.source)}` : ''}`;
  if (!full) {
    out.push('', '## World News headlines by country (news, not videos)', '', 'Top 2 stories from each country\'s Google News edition. More per country in llms-full.txt.', '');
    for (const c of d.countries) {
      const rows = (d.news[c.code] || []).slice(0, 2);
      if (rows.length) out.push(`- ${md(c.name)} (${c.code}): ${rows.map((r) => `${r.rank}. ${headline(r)}`).join(' · ')}`);
    }
  }
  if (full) {
    for (const c of d.countries) {
      out.push('', `## ${md(c.name)} (${c.code})`, '', `Est. watching YouTube now: ${fmt(c.live)}`);
      const list = (title, rows, line) => { if (rows && rows.length) { out.push('', `### ${title}`, ''); rows.forEach((r, i) => out.push(line(r, i))); } };
      list('YouTube Trending videos', d.trending[c.code], (r) => `${r.rank}. [${md(r.title)}](${yt(r.video_id)}) – ${md(r.channel_title)} – ${fmt(r.view_count)} views`);
      list('YouTube Music', d.music[c.code], (r) => `${r.rank}. [${md(r.title)}](${yt(r.video_id)}) – ${md(r.channel_title)} – ${fmt(r.view_count)} views`);
      list('World News headlines (news)', d.news[c.code], (r) => `${r.rank}. ${headline(r)}`);
      list('Fashion News headlines', d.fashion[c.code], (r, i) => `${i + 1}. ${headline(r)}`);
      list('Fashion Index (fashion videos)', d.fashionVideos[c.code], (r) => `${r.rank}. [${md(r.title)}](${yt(r.video_id)}) – ${md(r.channel_title)}${r.channel_country && r.channel_country !== c.code ? ` (${r.channel_country})` : ''} – ${fmt(Math.round(r.views_per_hour))} views/hour`);
      list('Education topics', d.subjects[c.code], (r) => `${r.rank}. ${md(r.subject)} (${r.video_count} videos, ${r.news_count} news stories)`);
    }
  }
  out.push('', '## Method', '', ...METHOD.map((m) => `- ${m}`), '', '## More data', '', ...LINKS.map(([u, t]) => `- [${u}](${u}): ${t}`));
  if (!full) out.splice(out.indexOf('## Method'), 0, `Per-country YouTube Trending videos, YouTube Music, World News headlines, Fashion and Education: ${SITE}/llms-full.txt`, '');
  return out.join('\n') + '\n';
}

// Plain-text data for one country and topic, pasted into AIs (Gemini) that can't open links themselves.
const TOPICS = ['all', 'news', 'music', 'fashion', 'trending', 'world'];
function brief(d, cc, topic) {
  const c = d.countries.find((x) => x.code === cc);
  if (!c || !TOPICS.includes(topic)) return null;
  const t = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const news = (r) => `${t(r.title)}${en(r) ? ` (English: ${t(en(r))})` : ''}${r.source ? ` – ${t(r.source)}` : ''}`;
  const out = [];
  const list = (title, rows, line) => { if (rows && rows.length) out.push('', `${title}:`, ...rows.map((r, i) => `${i + 1}. ${line(r)}`)); };
  const vid = (r) => `${t(r.title)} – ${t(r.channel_title)} – ${fmt(r.view_count)} views`;
  if (topic === 'all' || topic === 'news') list(`Top news in ${c.name} (Google News)`, d.news[cc], news);
  if (topic === 'all' || topic === 'music') list(`Top 10 songs on YouTube in ${c.name} (YouTube Music chart)`, d.music[cc], vid);
  if (topic === 'all' || topic === 'fashion') {
    list(`Fashion Index for ${c.name}: fastest-growing videos from fashion brand and magazine channels`, d.fashionVideos[cc], (r) => `${t(r.title)} – ${t(r.channel_title)} – ${fmt(Math.round(r.views_per_hour))} views/hour`);
    list(`Fashion news in ${c.name} (Google News)`, d.fashion[cc], news);
  }
  if (topic === 'trending') list(`YouTube Trending videos in ${c.name}`, d.trending[cc], vid);
  if (topic === 'world') {
    list('YouTube videos trending in the most countries', d.worldwide, (v) => `${t(v.title)} – ${t(v.channel)} – trending in ${v.countries.length} countries (${v.countries.join(', ')})`);
    const tops = d.countries.map((x) => [x, (d.news[x.code] || [])[0]]).filter(([, r]) => r);
    if (tops.length) out.push('', 'Top news story in each country (Google News):', ...tops.map(([x, r]) => `- ${x.name}: ${news(r)}`));
  }
  if (!out.length) return null;
  return [`Like Polling live data for ${topic === 'world' ? 'the world' : c.name}, as of ${utc(new Date().toISOString())}. Answer using this data:`, ...out].join('\n') + '\n';
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function html(d) {
  const table = (head, rows) => rows && rows.length
    ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">No data right now.</p>';
  const news = (r) => [r.rank, `<a href="${esc(r.link)}">${esc(r.title)}</a>${en(r) ? `<br><small>${esc(en(r))}</small>` : ''}`, esc(r.source)];
  const vid = (r) => [r.rank, `<a href="${yt(r.video_id)}">${esc(r.title)}</a>`, esc(r.channel_title), fmt(r.view_count)];
  const sections = d.countries.map((c) => `<section id="${c.code}"><h2>${esc(c.name)} <small>${c.code}</small></h2>
<p>Est. watching YouTube now: <b>${fmt(c.live)}</b></p>
<h3>YouTube Trending videos</h3>${table(['#', 'Video', 'Channel', 'Views'], (d.trending[c.code] || []).map(vid))}
<h3>YouTube Music</h3>${table(['#', 'Video', 'Channel', 'Views'], (d.music[c.code] || []).map(vid))}
<h3>World News headlines (news)</h3>${table(['#', 'Headline', 'Source'], (d.news[c.code] || []).map(news))}
<h3>Fashion News headlines</h3>${table(['#', 'Headline', 'Source'], (d.fashion[c.code] || []).map((r, i) => news({ ...r, rank: i + 1 })))}
<h3>Fashion Index (fashion videos)</h3>${table(['#', 'Video', 'Channel', 'Views/hour'], (d.fashionVideos[c.code] || []).map((r) => [r.rank, `<a href="${yt(r.video_id)}">${esc(r.title)}</a>`, esc(r.channel_title), fmt(Math.round(r.views_per_hour))]))}
<h3>Education topics</h3>${table(['#', 'Subject', 'Videos', 'News'], (d.subjects[c.code] || []).map((r) => [r.rank, esc(r.subject), r.video_count, r.news_count]))}
</section>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Like Polling data: what the world watches on YouTube</title>
<meta name="description" content="${esc(ABOUT[0])}">
<link rel="canonical" href="${SITE}/data"><link rel="alternate" type="text/markdown" href="/llms-full.txt" title="Like Polling data (Markdown)">
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px;color:#16181d}a{color:#b0001c}h1{margin:.2em 0}h2{margin-top:2em;border-top:2px solid #b0001c;padding-top:.6em}small,.muted{color:#6b7280}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top}th{background:#f6f6f7}nav a{display:inline-block;margin:0 8px 4px 0}</style></head><body>
<p><a href="/">← Like Polling</a></p><h1>What the world watches on YouTube: open data</h1>
<p>${esc(ABOUT[0])} ${esc(ABOUT[1])}</p>
<h2>What each section is</h2><ul>${SECTIONS.map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul>
<p>Estimated people watching YouTube now in these ${d.countries.length} countries: <b>about ${short(d.live)}</b> (${utc(d.liveAt)}). Trending updated ${utc(d.trendingAt)}.</p>
<h2>YouTube Trending videos in the most countries (videos, not news)</h2>${table(['#', 'Video', 'Channel', 'Countries'], d.worldwide.map((v, i) => [i + 1, `<a href="${yt(v.id)}">${esc(v.title)}</a>`, esc(v.channel), `${v.countries.length}: ${v.countries.join(', ')}`]))}
<h2>Estimated people watching YouTube now</h2>${table(['Country', 'Code', 'Est. watching now'], [...d.countries].sort((a, b) => b.live - a.live).map((c) => [`<a href="#${c.code}">${esc(c.name)}</a>`, c.code, fmt(c.live)]))}
<h2>Countries</h2><nav>${d.countries.map((c) => `<a href="#${c.code}">${esc(c.name)}</a>`).join('')}</nav>
${sections}
<h2>Method</h2><ul>${METHOD.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
<h2>More data</h2><ul>${LINKS.map(([u, t]) => `<li><a href="${u}">${u.replace(SITE, '')}</a>: ${esc(t)}</li>`).join('')}</ul>
</body></html>`;
}

function createHandler(deps = {}) {
  return async (req, res) => {
    const env = deps.env || process.env;
    const format = ['full', 'html', 'brief'].includes(req.query?.format) ? req.query.format : 'summary';
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) throw new Error('Server is missing SUPABASE_URL/SUPABASE_KEY');
      const d = await load(rest(env, deps.fetch || fetch));
      if (format === 'brief') {
        const text = brief(d, String(req.query.country || '').toUpperCase(), String(req.query.topic || 'all'));
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', text ? CACHE : 'no-store');
        return res.status(text ? 200 : 404).end(text || 'No data for this country or topic.\n');
      }
      res.setHeader('Content-Type', format === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', CACHE);
      res.status(200).end(format === 'html' ? html(d) : markdown(d, format === 'full'));
    } catch (err) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(502).end(`Like Polling data is temporarily unavailable. Try again shortly, or use ${SITE}/api/v1/worldwide.\n`);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
