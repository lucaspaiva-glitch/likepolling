// One-off check: does YouTube serve a "Howto & Style" (category 26) most-popular chart per country?
// videos.list chart=mostPopular costs 1 quota unit per country (41 total).
const COUNTRIES = 'AR AU BD BE BR CA CL CO DE DZ EC EG ES FR GB ID IE IN IQ IT JP KE KR MA MX MY NG NL PE PH PK PL PT SA TH TR TW UA US VN ZA'.split(' ');
const YT = 'https://www.googleapis.com/youtube/v3/videos';

(async () => {
  const ok = [];
  const failed = {};
  for (const cc of COUNTRIES) {
    const q = new URLSearchParams({ part: 'snippet,statistics', chart: 'mostPopular', videoCategoryId: '26', regionCode: cc, maxResults: '10', key: process.env.YOUTUBE_API_KEY });
    const j = await (await fetch(`${YT}?${q}`)).json();
    if (j.error) { failed[cc] = j.error.message; if (/quota/i.test(j.error.message)) break; continue; }
    const items = j.items || [];
    ok.push(cc);
    console.log(`${cc} ${items.length} videos`);
    for (const it of items) console.log(`  ${it.statistics?.viewCount} | ${it.snippet.channelTitle} | ${it.snippet.title}`);
  }
  console.log(JSON.stringify({ ok: ok.length, okCountries: ok, failed }));
})();
