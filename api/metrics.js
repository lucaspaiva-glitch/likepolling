// api/metrics.js
// GET /api/metrics?channel=<handle | @handle | channel URL | channel ID | name>
// Fetches a YouTube channel's trailing-30-day metrics, generates a one-sentence
// Gemini executive summary, and writes the result to Supabase `entity_metrics`.
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

const GEMINI_MODEL = 'gemini-3.5-flash';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const WINDOW_DAYS = 30;
const MAX_PLAYLIST_PAGES = 4;
const ENTITY_CATEGORY = 'creators';
// Estimated creator revenue per 1,000 views (USD). Mirrored in index.html.
const RPM_LOW = 1;
const RPM_HIGH = 4;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseChannelQuery(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;
  const idMatch = input.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:$|[/?#])/);
  if (idMatch) return { type: 'id', value: idMatch[1] };
  const handleMatch = input.match(/(?:youtube\.com\/)?@([\w.-]{3,30})/i);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };
  const bare = input.replace(/\s+/g, '');
  if (/^[\w.-]{3,30}$/.test(bare)) return { type: 'handle', value: bare, fallbackSearch: input };
  return { type: 'search', value: input };
}

async function ytGet(path, params, apiKey, fetchImpl) {
  const url = new URL(`${YT_API}/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: apiKey })) url.searchParams.set(k, v);
  const res = await fetchImpl(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.message || res.statusText;
    throw new HttpError(502, `YouTube API ${path} failed (${res.status}): ${reason}`);
  }
  return body;
}

async function resolveChannel(query, apiKey, fetchImpl) {
  const parts = 'snippet,statistics,contentDetails';
  let channel = null;
  if (query.type === 'id') {
    channel = (await ytGet('channels', { part: parts, id: query.value }, apiKey, fetchImpl)).items?.[0];
  } else if (query.type === 'handle') {
    channel = (await ytGet('channels', { part: parts, forHandle: `@${query.value}` }, apiKey, fetchImpl)).items?.[0];
  }
  const searchTerm = query.type === 'search' ? query.value : query.fallbackSearch;
  if (!channel && searchTerm) {
    const found = await ytGet('search', { part: 'snippet', type: 'channel', maxResults: '1', q: searchTerm }, apiKey, fetchImpl);
    const channelId = found.items?.[0]?.snippet?.channelId || found.items?.[0]?.id?.channelId;
    if (channelId) {
      channel = (await ytGet('channels', { part: parts, id: channelId }, apiKey, fetchImpl)).items?.[0];
    }
  }
  if (!channel) throw new HttpError(404, `No YouTube channel found for "${query.value}".`);
  return channel;
}

async function fetchRecentVideos(uploadsPlaylistId, apiKey, fetchImpl, now = Date.now()) {
  const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const ids = [];
  let pageToken;
  for (let page = 0; page < MAX_PLAYLIST_PAGES; page++) {
    const params = { part: 'contentDetails', maxResults: '50', playlistId: uploadsPlaylistId };
    if (pageToken) params.pageToken = pageToken;
    const data = await ytGet('playlistItems', params, apiKey, fetchImpl);
    const items = data.items || [];
    const recent = items.filter((it) => Date.parse(it.contentDetails?.videoPublishedAt) >= cutoff);
    ids.push(...recent.map((it) => it.contentDetails.videoId));
    if (recent.length < items.length || !data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await ytGet('videos', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') }, apiKey, fetchImpl);
    videos.push(...(data.items || []));
  }
  return videos;
}

function aggregate(videos) {
  let views = 0;
  let comments = 0;
  for (const v of videos) {
    views += Number(v.statistics?.viewCount || 0);
    comments += Number(v.statistics?.commentCount || 0);
  }
  const top = [...videos]
    .sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0))
    .slice(0, 5)
    .map((v) => ({ title: v.snippet?.title || '', views: Number(v.statistics?.viewCount || 0) }));
  return {
    monthlyViews: views,
    commentVolume: comments,
    videoCount: videos.length,
    topVideos: top,
    estimatedEarnings: { low: Math.round((views / 1000) * RPM_LOW), high: Math.round((views / 1000) * RPM_HIGH), currency: 'USD' },
  };
}

async function generateSummary(ai, channel, stats) {
  const topList = stats.topVideos.map((v) => `- "${v.title}" (${v.views.toLocaleString('en-US')} views)`).join('\n') || '- no uploads in the last 30 days';
  const prompt = [
    `You are a media analyst. In ONE crisp sentence (max 30 words), explain why the YouTube channel "${channel.snippet.title}" is trending right now.`,
    `Subscribers: ${Number(channel.statistics?.subscriberCount || 0).toLocaleString('en-US')}.`,
    `Views on videos uploaded in the last ${WINDOW_DAYS} days: ${stats.monthlyViews.toLocaleString('en-US')} across ${stats.videoCount} uploads; comments: ${stats.commentVolume.toLocaleString('en-US')}.`,
    `Top recent uploads:\n${topList}`,
    'Respond with the sentence only: no preamble, quotes, or markdown.',
  ].join('\n');

  const result = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  const text = String(result.text || '').replace(/\s+/g, ' ').replace(/^["'*\s]+|["'*\s]+$/g, '').trim();
  if (!text) throw new Error('Gemini returned an empty summary.');
  return text.slice(0, 300);
}

function entityIdFor(channel) {
  const custom = String(channel.snippet?.customUrl || '').replace(/^@/, '').toLowerCase();
  return /^[\w.-]+$/.test(custom) ? custom : channel.id.toLowerCase();
}

async function upsertEntity(db, channel) {
  const handle = channel.snippet?.customUrl || null;
  const candidateId = entityIdFor(channel);
  const filters = [`id.eq.${candidateId}`, `handles->>youtube_channel_id.eq.${channel.id}`];
  if (handle && /^@[\w.-]+$/.test(handle)) filters.push(`handles->>youtube.ilike.${handle}`);

  const { data: existing, error: findErr } = await db.from('entities').select('id, category, handles').or(filters.join(',')).limit(1);
  if (findErr) throw new HttpError(502, `Supabase entities lookup failed: ${findErr.message}`);

  const prior = existing?.[0];
  const handles = {
    ...(prior?.handles || {}),
    youtube: prior?.handles?.youtube || handle,
    youtube_channel_id: channel.id,
    youtube_avatar: channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null,
  };
  const row = { id: prior?.id || candidateId, name: channel.snippet.title, category: prior?.category || ENTITY_CATEGORY, handles };

  const { error } = await db.from('entities').upsert(row, { onConflict: 'id' });
  if (error) throw new HttpError(502, `Supabase entities write failed: ${error.message}`);
  return row;
}

async function insertMetric(db, entityId, stats, summary, now = new Date()) {
  const row = {
    entity_id: entityId,
    platform: 'youtube',
    metric_date: now.toISOString().slice(0, 10),
    primary_volume: stats.monthlyViews,
    comment_volume: stats.commentVolume,
    intelligence_note: summary,
  };
  const { data, error } = await db.from('entity_metrics').insert(row).select().single();
  if (error) throw new HttpError(502, `Supabase entity_metrics write failed: ${error.message}`);
  return data;
}

function createHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    const fetchImpl = deps.fetch || fetch;
    const missing = ['YOUTUBE_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'].filter((k) => !env[k]);
    if (missing.length) return res.status(500).json({ error: `Server is missing env vars: ${missing.join(', ')}` });

    const query = parseChannelQuery(req.query?.channel);
    if (!query) return res.status(400).json({ error: 'Provide ?channel=<handle, URL, or channel ID>.' });

    const db = deps.db || createClient(env.SUPABASE_URL, env.SUPABASE_KEY, { auth: { persistSession: false } });
    const ai = deps.ai || new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    try {
      const channel = await resolveChannel(query, env.YOUTUBE_API_KEY, fetchImpl);
      const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
      const videos = uploads ? await fetchRecentVideos(uploads, env.YOUTUBE_API_KEY, fetchImpl) : [];
      const stats = aggregate(videos);

      let summary = null;
      let summaryError = null;
      try {
        summary = await generateSummary(ai, channel, stats);
      } catch (err) {
        summaryError = `Gemini summary failed: ${err.message}`;
        console.error('[metrics]', summaryError);
      }

      const entity = await upsertEntity(db, channel);
      const metric = await insertMetric(db, entity.id, stats, summary);

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        entity,
        metric,
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          handle: channel.snippet.customUrl || null,
          subscribers: Number(channel.statistics?.subscriberCount || 0),
          totalViews: Number(channel.statistics?.viewCount || 0),
        },
        ...stats,
        summary,
        summaryError,
        model: GEMINI_MODEL,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[metrics]', err);
      return res.status(err.status || 500).json({ error: err.message });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.parseChannelQuery = parseChannelQuery;
module.exports.aggregate = aggregate;
module.exports.GEMINI_MODEL = GEMINI_MODEL;
