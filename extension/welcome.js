(async function () {
  // No questions on install: country and language come from the browser and can be changed in the extension (gear).
  const s = await chrome.storage.local.get('lang');
  const lang = CP.LANGS.includes(s.lang) ? s.lang : CP.detectLang(navigator.languages || navigator.language);
  const t = CP.translator(lang);
  document.documentElement.lang = CP.LOCALE[lang];
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.getElementById('start').addEventListener('click', async () => {
    await chrome.storage.local.set({ showPill: true });
    document.getElementById('done').style.display = 'block';
    location.href = 'https://www.youtube.com/';
  });
})();
