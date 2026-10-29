// Fashion News: recent fashion headlines from Google News for each Trending Index
// country, in the country's language, with each article's own photo. Gemini
// translates each headline and checks it is really about fashion (title_tr.fashion);
// the site shows only those. Writes public.news_fashion through the service-role
// RPC replace_news_fashion. Run twice a day by .github/workflows/news-fashion.yml.
const { run: runNews, EDITIONS, WORLD } = require('./news-world-routine');

// Google News search term for "fashion" in each edition's language.
const TERMS = {
  es: 'moda', 'es-419': 'moda', pt: 'moda', 'pt-BR': 'moda', 'pt-PT': 'moda', it: 'moda', pl: 'moda', tr: 'moda', uk: 'мода',
  de: 'Mode', fr: 'mode', nl: 'mode', ja: 'ファッション', ko: '패션', th: 'แฟชั่น', vi: 'thời trang', id: 'fashion',
  ar: 'أزياء', bn: 'ফ্যাশন', 'zh-TW': '時尚',
};
// No Google News edition of their own (see news-world-routine.js): add the country's name.
const PLACE = { DZ: 'Algérie', EC: 'Ecuador', IQ: 'العراق' };

function fashionUrl(cc, days = 2) {
  const [hl, ceid] = EDITIONS[cc];
  const term = TERMS[hl] || 'fashion';
  const q = `${term}${PLACE[cc] ? ` ${PLACE[cc]}` : ''} when:${days}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${cc}&ceid=${ceid}`;
}

const FASHION = {
  ...WORLD,
  table: 'news_fashion', rpc: 'replace_news_fashion', feed: fashionUrl, searchTopUp: () => true,
  // Iraq has too little fashion news to fill a list.
  countries: Object.keys(EDITIONS).filter((cc) => cc !== 'IQ'),
  maxPerSource: 3, photoTarget: 20, imageLookups: 1000, translations: 1000, classify: true, summaries: false,
};

const run = (env, deps) => runNews(env, deps, FASHION);

module.exports = { run, fashionUrl, TERMS, FASHION };

if (require.main === module) {
  run().catch((err) => {
    console.error(`Fashion news routine failed: ${err.message}`);
    process.exit(1);
  });
}
