// api/metrics.js
// Vercel Serverless Function: GET /api/metrics?entity=cazetv
//
// Env vars required (set in Vercel Project Settings -> Environment Variables):
//   YOUTUBE_API_KEY   - YouTube Data API v3 key
//   GEMINI_API_KEY    - Google Generative AI (Gemini) key
//
// Dependencies (add to package.json):
//   npm install @google/generative-ai

const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Entity registry -------------------------------------------------
// Map each dropdown entity id to the YouTube channel that should be polled
// for a live viewer count. Fill in real channel IDs for production use.
const ENTITIES = {
  cazetv:  { name: 'CazéTV',        channelId: 'UCJH98Ic8j2SUFY4E1RXNQAg' },
  flow:    { name: 'Flow Podcast',  channelId: 'UC5DVpxWKlktoTVDlT4LNqRA' },
  podpah:  { name: 'Podpah',        channelId: 'UCiHGxTOZFyvXeXQMbUeMims' },
  alok:    { name: 'Alok',          channelId: 'UCkozQCU8pXmR2yzUEdaN9YQ' },
  anitta:  { name: 'Anitta',        channelId: 'UC7lWSDbn2iN0oazW8QYQ0dQ' },
  casimiro:{ name: 'Casimiro',      channelId: 'UCz-eLc6yTdw4NDx6uzcT5Xw' },
  nubank:  { name: 'Nubank',        channelId: 'UC2r2LUn8qKGmnkS5xoDXgVQ' },
  mercado: { name: 'Mercado Livre', channelId: 'UCwCTn8v0OcvenZjjNKb-3AA' },
  itau:    { name: 'Itaú',          channelId: 'UCXqZukloIhUFYaBILoauJmA' },
};

// Hardcoded recent chat sample per entity, fed to the Truth Engine.
// Replace with a real chat/log ingestion pipeline when one exists.
const CHAT_SAMPLES = {
  cazetv: [
    'kkkkkkkkk mds q golaço',
    'CazéTV top demais, audio ficou top',
    'bora time bora time bora time bora time',
    'alguem sabe o link do jogo de amanha?',
    'primeiraaaaa kkkk',
    'esse narrador é sensacional',
  ],
  flow: [
    'esse convidado ta mandando mto bem',
    'flow > qualquer outro podcast',
    'link do episodio completo pfv',
    'kkkkkkkkkk cade o ipiranga',
    'audio comecou baixo, ajusta ai',
    'melhor pauta do mes sem duvida',
  ],
  podpah: [
    'monark tinha que tar aqui',
    'kkkkkk vina sempre entregando',
    'podpah simbora, call de sabado',
    'esse corte vai bombar',
    'link do spotify pfv',
    'audio 10/10 hoje',
  ],
  alok: [
    'set insano, meu deus',
    'alok sempre inovando',
    'live do festival ta phoda',
    'quero o tracklist desse set',
    'som bom demais mano',
    'quando vem pro brasil de novo?',
  ],
  anitta: [
    'anitta rainha, musica nova ja',
    'clipe ficou show demais',
    'quando lanca o proximo single',
    'ela nao erra mesmo',
    'coreografia insana gente',
    'apoiando sempre reginaaaa',
  ],
  casimiro: [
    'casimito narrando é outro nivel',
    'live do jogo bombando',
    'kkkkkkk reação foi otima',
    'cadê o cortes canal',
    'melhor live de hoje sem duvida',
    'chat too fast, calma ai',
  ],
  nubank: [
    'atendimento resolveu rapido, gostei',
    'app caiu aqui agora',
    'cartao chegou antes do prazo',
    'taxa de cambio ta melhor que banco tradicional',
    'suporte respondeu em minutos',
    'nubank sempre entregando bem',
  ],
  mercado: [
    'entrega chegou antes do prazo',
    'promocao boa hoje no site',
    'produto veio com defeito, abri chamado',
    'frete gratis funcionou direitinho',
    'vendedor respondeu rapido',
    'compra facil, recomendo',
  ],
  itau: [
    'app do itau atualizou, ficou melhor',
    'gerente resolveu meu problema rapido',
    'taxa de rendimento subiu esse mes',
    'fila no app ta grande hoje',
    'cartao internacional sem anuidade, bom',
    'atendimento telefonico demorou um pouco',
  ],
};

function jsonError(res, status, message) {
  res.status(status).json({ error: message });
}

// --- YouTube: resolve the channel's current live broadcast, then read
// concurrentViewers from its liveStreamingDetails. Falls back to null
// (no live broadcast right now) instead of throwing.
async function fetchConcurrentViewers(channelId, apiKey) {
  const searchUrl =
    'https://www.googleapis.com/youtube/v3/search' +
    `?part=id&channelId=${encodeURIComponent(channelId)}` +
    '&eventType=live&type=video&maxResults=1' +
    `&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(`YouTube search.list failed: ${searchRes.status}`);
  }
  const searchData = await searchRes.json();
  const videoId = searchData.items && searchData.items[0] && searchData.items[0].id.videoId;

  if (!videoId) {
    // No active live stream for this channel right now.
    return { viewers: null, live: false, videoId: null };
  }

  const videosUrl =
    'https://www.googleapis.com/youtube/v3/videos' +
    `?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}` +
    `&key=${apiKey}`;

  const videosRes = await fetch(videosUrl);
  if (!videosRes.ok) {
    throw new Error(`YouTube videos.list failed: ${videosRes.status}`);
  }
  const videosData = await videosRes.json();
  const details = videosData.items && videosData.items[0] && videosData.items[0].liveStreamingDetails;
  const concurrent = details && details.concurrentViewers ? Number(details.concurrentViewers) : null;

  return { viewers: concurrent, live: true, videoId };
}

// --- Gemini "Truth Engine": score the chat sample for bot-like patterns
// (repetitive syntax, copy-pasted lines, dialect consistency) and produce
// a one-sentence sentiment log line. Expects strict JSON back from the model.
async function runTruthEngine(entityName, chatSample, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are the "Truth Engine" for a live-audience analytics terminal called Like Polling.
Entity: ${entityName}

Below is a sample of recent live-chat messages for this entity:
${chatSample.map((line, i) => `${i + 1}. ${line}`).join('\n')}

Analyze the sample for signs of bot or coordinated activity: repetitive syntax,
copy-pasted phrasing, unnatural posting cadence, and whether the dialect/slang
is consistent with genuine human fans versus scripted spam.

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly
this shape:
{"authenticityScore": <integer 0-100, share of the sample judged human>, "sentimentLog": "<one sentence, plain language, no quotes inside>"}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Truth Engine returned non-JSON output: ' + raw.slice(0, 200));
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.authenticityScore))));
  const sentimentLog = String(parsed.sentimentLog || '').slice(0, 300);

  if (Number.isNaN(score) || !sentimentLog) {
    throw new Error('Truth Engine returned an incomplete payload');
  }

  return { authenticityScore: score, sentimentLog };
}

module.exports = async function handler(req, res) {
  const entityId = String(req.query.entity || '').toLowerCase();
  const entity = ENTITIES[entityId];

  if (!entity) {
    return jsonError(res, 400, `Unknown or missing entity "${req.query.entity || ''}". Valid values: ${Object.keys(ENTITIES).join(', ')}`);
  }

  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!youtubeKey || !geminiKey) {
    return jsonError(res, 500, 'Server is missing YOUTUBE_API_KEY or GEMINI_API_KEY.');
  }

  const chatSample = CHAT_SAMPLES[entityId] || [];

  try {
    const [viewerResult, truthResult] = await Promise.all([
      fetchConcurrentViewers(entity.channelId, youtubeKey),
      runTruthEngine(entity.name, chatSample, geminiKey),
    ]);

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      entity: entityId,
      name: entity.name,
      viewers: viewerResult.viewers,       // null when no live broadcast is active
      live: viewerResult.live,
      authenticityScore: truthResult.authenticityScore,
      sentimentLog: truthResult.sentimentLog,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('metrics.js error:', err);
    return jsonError(res, 502, 'Failed to fetch live metrics: ' + err.message);
  }
};
