// Toolbar popup: on a YouTube channel/video it shows that channel (Creators); anywhere else
// it opens on Trending. It never reads the page; on YouTube it asks our own content script.
(async function () {
  const lang = CP.detectLang(navigator.languages || navigator.language);
  const s = await chrome.storage.local.get(['country', 'showPill']);
  const request = (path, opt = {}) => chrome.runtime.sendMessage({ type: 'api', path, refresh: !!opt.refresh });
  let ref = null, tabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // tab.url is only visible for sites in host_permissions (YouTube), so other sites stay private.
    if (tab?.url && CP.pageKind(tab.url).type !== 'other') {
      tabId = tab.id;
      ref = (await chrome.tabs.sendMessage(tab.id, { type: 'getChannel' }).catch(() => null))?.ref || null;
    }
  } catch (e) { /* not a YouTube tab */ }

  const dash = CP.Dashboard(document.getElementById('app'), {
    mode: 'popup', lang, request, tab: ref ? 'creators' : 'trending',
    country: s.country || CP.HOME_COUNTRY[lang] || 'US', showPill: s.showPill !== false, canShowOnPage: !!ref,
    onAction: (act, value) => {
      if (act === 'country') chrome.storage.local.set({ country: value });
      if (act === 'pill') chrome.storage.local.set({ showPill: value });
      if (act === 'show-on-page' && tabId) chrome.tabs.sendMessage(tabId, { type: 'showPanel' }).then(() => window.close()).catch(() => {});
    },
  });
  dash.activate(true);
  if (ref) dash.setChannel(ref);
})();
