// One-off helper to find Education channels for new countries.
// MODE=handles: looks up each handle in education-candidates.json (1 YouTube unit each).
// MODE=search: one channel search per country in SEARCHES (100 units each).
const CANDIDATES = require('./education-candidates.json');
const YT = 'https://www.googleapis.com/youtube/v3';

const SEARCHES = {
  PT: 'explicações aulas matemática exames nacionais', UA: 'уроки НМТ ЗНО освіта', BD: 'শিক্ষা ক্লাস HSC SSC',
  MY: 'pendidikan cikgu SPM tuisyen', NG: 'WAEC JAMB lessons tutorial', CO: 'clases ICFES educación Colombia'
};

const get = async (path) => (await fetch(`${YT}/${path}&key=${process.env.YOUTUBE_API_KEY}`)).json();

async function details(ids) {
  if (!ids.length) return [];
  const j = await get(`channels?part=snippet,statistics&id=${ids.join(',')}`);
  return (j.items || []).map((c) => ({ id: c.id, handle: c.snippet.customUrl || null, name: c.snippet.title,
    country: c.snippet.country || null, subs: Number(c.statistics.subscriberCount || 0), videos: Number(c.statistics.videoCount || 0) }));
}

async function handles() {
  const out = {};
  for (const [cc, list] of Object.entries(CANDIDATES)) {
    out[cc] = [];
    for (const h of [...new Set(list)]) {
      const j = await get(`channels?part=snippet,statistics&forHandle=${encodeURIComponent(h)}`);
      const c = j.items && j.items[0];
      out[cc].push(c ? { handle: h, found: true, id: c.id, name: c.snippet.title, country: c.snippet.country || null,
        subs: Number(c.statistics.subscriberCount || 0), videos: Number(c.statistics.videoCount || 0) } : { handle: h, found: false });
    }
  }
  return out;
}

async function search() {
  const out = {};
  for (const [cc, q] of Object.entries(SEARCHES)) {
    const j = await get(`search?part=snippet&type=channel&maxResults=25&regionCode=${cc}&q=${encodeURIComponent(q)}`);
    if (j.error) { out[cc] = { error: j.error.message }; if (/quota/i.test(j.error.message)) break; continue; }
    out[cc] = await details((j.items || []).map((i) => i.id.channelId));
  }
  return out;
}

(async () => {
  const out = process.env.MODE === 'search' ? await search() : await handles();
  console.log('RESULT_JSON ' + JSON.stringify(out));
})();
