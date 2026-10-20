(async function () {
  const lang = CP.detectLang(navigator.languages || navigator.language);
  const t = CP.translator(lang), f = CP.formatter(lang);
  document.documentElement.lang = CP.LOCALE[lang];
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  let langName = lang;
  try { langName = new Intl.DisplayNames([CP.LOCALE[lang]], { type: 'language' }).of(CP.LOCALE[lang]); } catch (e) { /* keep code */ }
  document.getElementById('lang').textContent = t('w_lang', { l: langName });
  const saved = (await chrome.storage.local.get('country')).country;
  const sel = document.getElementById('country');
  const collator = new Intl.Collator(CP.LOCALE[lang]);
  sel.innerHTML = CP.COUNTRIES.map((c) => [c, f.country(c)]).sort((a, b) => collator.compare(a[1], b[1]))
    .map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  sel.value = saved || CP.HOME_COUNTRY[lang] || 'US';
  document.getElementById('start').addEventListener('click', async () => {
    await chrome.storage.local.set({ country: sel.value, showPill: true });
    document.getElementById('done').style.display = 'block';
  });
})();
