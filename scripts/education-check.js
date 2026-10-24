// One-off check of proposed Education channel handles (1 YouTube unit each).
// Prints id, name, country, subscribers and last upload for each handle.
const CANDIDATES = require('./education-candidates.json');

async function check(handle, key) {
  const u = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${key}`;
  const j = await (await fetch(u)).json();
  const c = j.items && j.items[0];
  if (!c) return { handle, found: false, error: j.error && j.error.message };
  return { handle, found: true, id: c.id, name: c.snippet.title, country: c.snippet.country || null,
    subs: Number(c.statistics.subscriberCount || 0), videos: Number(c.statistics.videoCount || 0) };
}

(async () => {
  const key = process.env.YOUTUBE_API_KEY;
  const out = {};
  for (const [cc, handles] of Object.entries(CANDIDATES)) {
    out[cc] = [];
    for (const h of [...new Set(handles)]) out[cc].push(await check(h, key));
  }
  console.log('RESULT_JSON ' + JSON.stringify(out));
})();
