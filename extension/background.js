// Creators + service worker: fetches from the Like Polling API (the only place data comes
// from) with a short local cache, and opens the welcome page on install.
importScripts('config.js');

const TTL_MS = { channel: 5 * 60 * 1000, default: 10 * 60 * 1000 };

async function apiGet(path, refresh) {
  const key = `api:${path.replace('&refresh=1', '')}`;
  if (!refresh) {
    const hit = (await chrome.storage.session.get(key))[key];
    const ttl = path.startsWith('channel') ? TTL_MS.channel : TTL_MS.default;
    if (hit && Date.now() - hit.at < ttl) return hit.res;
  }
  let res;
  try {
    const r = await fetch(`${self.CP_CONFIG.API_BASE}/api/v1/${path}`, { headers: { Accept: 'application/json' } });
    res = { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    return { ok: false, status: 0, body: null };
  }
  if (res.ok || res.status === 404) await chrome.storage.session.set({ [key]: { at: Date.now(), res } });
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'api' && typeof msg.path === 'string' && /^(channel|trending|music|worldwide)\b/.test(msg.path)) {
    apiGet(msg.path, !!msg.refresh).then(reply);
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});
