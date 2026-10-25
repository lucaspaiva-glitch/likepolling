(async function () {
  // Short start page: no questions. Country and language come from the browser and can be changed in the extension (gear).
  // The demo video's channel (MrBeast) is already saved on Like Polling, so its stats show without a live YouTube lookup.
  const s = await chrome.storage.local.get('lang');
  const lang = CP.LANGS.includes(s.lang) ? s.lang : CP.detectLang(navigator.languages || navigator.language);
  const t = CP.translator(lang);
  document.documentElement.lang = CP.LOCALE[lang];
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  chrome.storage.local.set({ showPill: true });
})();
