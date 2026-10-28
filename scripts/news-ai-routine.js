// "Who am I in the age of AI?": recent artificial-intelligence headlines from Google News for
// each Trending Index country, in the country's language, with each article's own photo.
// Gemini translates each headline and sorts it (title_tr.ai) into how people use AI for good:
// medicine, work, creativity, life, or "none" (not mainly about that: risks, scandals,
// markets, product ads, politics). The site shows only the four kinds. Writes public.news_ai
// through the service-role RPC replace_news_ai. Run twice a day by .github/workflows/news-ai.yml.
const { run: runNews, EDITIONS, WORLD } = require('./news-world-routine');

// Google News search term for "artificial intelligence" in each edition's language.
const TERMS = {
  es: 'inteligencia artificial', 'es-419': 'inteligencia artificial', pt: 'inteligência artificial', 'pt-BR': 'inteligência artificial',
  'pt-PT': 'inteligência artificial', it: 'intelligenza artificiale', pl: 'sztuczna inteligencja', tr: 'yapay zeka', uk: 'штучний інтелект',
  de: 'künstliche Intelligenz', fr: 'intelligence artificielle', nl: 'kunstmatige intelligentie', ja: '人工知能', ko: '인공지능',
  th: 'ปัญญาประดิษฐ์', vi: 'trí tuệ nhân tạo', id: 'kecerdasan buatan', ar: 'الذكاء الاصطناعي', bn: 'কৃত্রিম বুদ্ধিমত্তা', 'zh-TW': '人工智慧',
};
// No Google News edition of their own (see news-world-routine.js): add the country's name.
const PLACE = { DZ: 'Algérie', EC: 'Ecuador', IQ: 'العراق' };

function aiUrl(cc, days = 2) {
  const [hl, ceid] = EDITIONS[cc];
  const term = TERMS[hl] || 'artificial intelligence';
  const q = `${term}${PLACE[cc] ? ` ${PLACE[cc]}` : ''} when:${days}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${cc}&ceid=${ceid}`;
}

const KINDS = ['medicine', 'work', 'creativity', 'life'];
const AI_CHECK = {
  key: 'ai',
  rule: '"ai" sorts the story by how people use artificial intelligence for good: "medicine" (health, medicine, diagnosis, drug discovery, scientific research), "work" (people creating jobs, careers, businesses or new skills with AI), "creativity" (art, music, film, design, writing or creators made with AI), "life" (education, accessibility, environment, farming, safety, public services or everyday help from AI). Use "none" if the headline is not mainly about AI, or is mainly about AI risks, fears, job losses, lawsuits, scandals, crime, deepfakes, war, regulation or politics, company finances, stock prices, investments, chips or data centres, or a product launch or advert.',
  ok: (v) => v === 'none' || KINDS.includes(v),
  hide: (v) => !KINDS.includes(v),
};

const AI = {
  ...WORLD,
  table: 'news_ai', rpc: 'replace_news_ai', feed: aiUrl, searchTopUp: () => true,
  photoTarget: 40, imageLookups: 2000, translations: 2000, classify: AI_CHECK, summaries: true,
};

const run = (env, deps) => runNews(env, deps, AI);

module.exports = { run, aiUrl, TERMS, KINDS, AI_CHECK, AI };

if (require.main === module) {
  run().catch((err) => {
    console.error(`AI news routine failed: ${err.message}`);
    process.exit(1);
  });
}
