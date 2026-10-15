// Site language switcher (EN | PT | ES). Load right after the page markup:
//   <script src="/assets/i18n.js"></script>
// Translates the page's English UI text in place, including text that scripts
// and widgets render later (watched with a MutationObserver), so existing code
// needs no changes. YouTube titles, channel names, AI summaries and anything
// inside [data-no-i18n] are left as they are. The choice is kept in localStorage
// and announced with a "lp:lang" event ({ detail: { lang } }) on document.
(function () {
  'use strict';
  const LANGS = ['en', 'pt', 'es'];
  const STORE = 'lp-lang';

  // English UI string -> [Portuguese, Spanish]
  const DICT = {
    'Live data, 24/7': ['Dados ao vivo, 24/7', 'Datos en vivo, 24/7'],
    "Monthly views, comment volume, estimated earnings, and an AI read on why it's trending.": ['Visualizações mensais, volume de comentários, ganhos estimados e uma análise de IA sobre por que está em alta.', 'Vistas mensuales, volumen de comentarios, ganancias estimadas y un análisis con IA de por qué es tendencia.'],
    'Single': ['Individual', 'Individual'],
    'Search': ['Pesquisar', 'Buscar'],
    'Compare': ['Comparar', 'Comparar'],
    'MrBeast, @handle, or channel URL': ['MrBeast, @handle ou URL do canal', 'MrBeast, @handle o URL del canal'],
    'Second channel': ['Segundo canal', 'Segundo canal'],
    'Channel': ['Canal', 'Canal'],
    'Mode': ['Modo', 'Modo'],
    'Tracked channels': ['Canais monitorados', 'Canales seguidos'],
    'Language': ['Idioma', 'Idioma'],
    'Est. watching': ['Est. assistindo', 'Est. viendo'],
    'Estimated number of people watching YouTube right now, by country': ['Número estimado de pessoas assistindo ao YouTube agora, por país', 'Número estimado de personas viendo YouTube ahora, por país'],
    "Estimated number of people watching YouTube at the same moment in each country (not monthly users). Modelled from approximate YouTube users per country and the typical share watching at that local time of day, not measured. User counts per country: Google's YouTube ad-reach figures, late 2025 (via DataReportal). Recalculated at 03:00 and 15:00 UTC, the two daily peaks in viewing across these countries.": [
      'Número estimado de pessoas assistindo ao YouTube ao mesmo tempo em cada país (não usuários mensais). Modelado a partir do número aproximado de usuários do YouTube por país e da parcela típica que assiste naquele horário local, não medido. Usuários por país: alcance publicitário do YouTube informado pelo Google, final de 2025 (via DataReportal). Recalculado às 03:00 e 15:00 UTC, os dois picos diários de audiência nesses países.',
      'Número estimado de personas viendo YouTube al mismo tiempo en cada país (no usuarios mensuales). Modelado a partir del número aproximado de usuarios de YouTube por país y la proporción típica que mira a esa hora local, no medido. Usuarios por país: alcance publicitario de YouTube según Google, finales de 2025 (vía DataReportal). Se recalcula a las 03:00 y 15:00 UTC, los dos picos diarios de audiencia en estos países.'],
    'Searching database…': ['Pesquisando no banco de dados…', 'Buscando en la base de datos…'],
    'Refreshing live metrics…': ['Atualizando métricas ao vivo…', 'Actualizando métricas en vivo…'],
    'Fetching live data from YouTube…': ['Buscando dados ao vivo do YouTube…', 'Obteniendo datos en vivo de YouTube…'],
    'Loading from database…': ['Carregando do banco de dados…', 'Cargando desde la base de datos…'],
    'Monthly views': ['Visualizações mensais', 'Vistas mensuales'],
    'LEADS': ['LIDERA', 'LIDERA'],
    'Uploads, last 30 days': ['Vídeos dos últimos 30 dias', 'Videos de los últimos 30 días'],
    'Comments': ['Comentários', 'Comentarios'],
    'Last 30 days': ['Últimos 30 dias', 'Últimos 30 días'],
    'Est. earnings': ['Ganhos est.', 'Ganancias est.'],
    'Per month, USD': ['Por mês, USD', 'Por mes, USD'],
    'AI executive summary': ['Resumo executivo por IA', 'Resumen ejecutivo con IA'],
    'AI summary unavailable for this snapshot.': ['Resumo de IA indisponível para este registro.', 'Resumen de IA no disponible para este registro.'],
    'Unknown error': ['Erro desconhecido', 'Error desconocido'],
    'Like Polling · Data via YouTube Data API · Summaries by Gemini · Earnings are estimates ($1–$4 per 1K views)': ['Like Polling · Dados via YouTube Data API · Resumos por Gemini · Ganhos são estimativas (US$1–US$4 por mil visualizações)', 'Like Polling · Datos vía YouTube Data API · Resúmenes por Gemini · Las ganancias son estimaciones (US$1–US$4 por cada mil vistas)'],
    // Trending Index + Music Index
    'Trending Index': ['Índice de Tendências', 'Índice de Tendencias'],
    'Music Index': ['Índice Musical', 'Índice Musical'],
    'Video': ['Vídeo', 'Video'],
    'Track': ['Faixa', 'Canción'],
    'Views': ['Visualizações', 'Vistas'],
    'Likes': ['Curtidas', 'Me gusta'],
    'Country': ['País', 'País'],
    'YouTube trending videos by country': ['Vídeos em alta no YouTube por país', 'Videos en tendencia de YouTube por país'],
    'YouTube trending music by country': ['Músicas em alta no YouTube por país', 'Música en tendencia de YouTube por país'],
    "YouTube's own Trending chart for each country, via the YouTube Data API. Refreshed hourly.": ['Ranking oficial Em Alta do YouTube em cada país, via YouTube Data API. Atualizado a cada hora.', 'Ranking oficial de Tendencias de YouTube en cada país, vía YouTube Data API. Se actualiza cada hora.'],
    "YouTube's own Trending chart for Music in each country, via the YouTube Data API. Refreshed hourly.": ['Ranking oficial Em Alta de Música do YouTube em cada país, via YouTube Data API. Atualizado a cada hora.', 'Ranking oficial de Tendencias de Música de YouTube en cada país, vía YouTube Data API. Se actualiza cada hora.'],
    'No trending data for this country yet.': ['Ainda não há dados de tendências para este país.', 'Aún no hay datos de tendencias para este país.'],
    'Trending data is unavailable right now.': ['Os dados de tendências estão indisponíveis no momento.', 'Los datos de tendencias no están disponibles en este momento.'],
    // Creator News Wire
    'Creator News Wire': ['Notícias de Criadores', 'Noticias de Creadores'],
    'YouTube and creator news': ['Notícias do YouTube e de criadores', 'Noticias de YouTube y creadores'],
    'All news': ['Todas', 'Todas'],
    'YouTube updates': ['Novidades do YouTube', 'Novedades de YouTube'],
    'Creator economy': ['Economia dos criadores', 'Economía de creadores'],
    'News filter': ['Filtro de notícias', 'Filtro de noticias'],
    'Creators': ['Criadores', 'Creadores'],
    'Load more': ['Carregar mais', 'Cargar más'],
    'No headlines in this filter yet.': ['Ainda não há manchetes neste filtro.', 'Aún no hay titulares en este filtro.'],
    'News is unavailable right now.': ['As notícias estão indisponíveis no momento.', 'Las noticias no están disponibles en este momento.'],
    'Latest headlines from Google News in the selected language. Refreshed hourly.': ['Manchetes mais recentes do Google News no idioma selecionado. Atualizado a cada hora.', 'Titulares más recientes de Google News en el idioma seleccionado. Se actualiza cada hora.'],
  };
  // Exact text nodes, whitespace included (the headline wraps the word "YouTube" in <em>).
  const RAW = {
    'Search any ': ['Pesquise qualquer canal do ', 'Busca cualquier canal de '],
    ' channel.': ['.', '.'],
  };
  const PATTERNS = [
    [/^As of (\d\d:\d\d) UTC$/, ['Às $1 UTC', 'A las $1 UTC']],
    [/^Updated (.+)$/, ['Atualizado: $1', 'Actualizado: $1'], localDate],
    [/^Couldn't load "([\s\S]*)"$/, ['Não foi possível carregar "$1"', 'No se pudo cargar "$1"']],
    [/^Showing cached data — live refresh failed \(([\s\S]*)\)\.$/, ['Mostrando dados em cache — a atualização ao vivo falhou ($1).', 'Mostrando datos en caché — la actualización en vivo falló ($1).']],
    [/^Gemini summary failed: ([\s\S]*)$/, ['Falha no resumo do Gemini: $1', 'Falló el resumen de Gemini: $1']],
    [/^Database lookup failed: ([\s\S]*)$/, ['Falha na consulta ao banco de dados: $1', 'Falló la consulta a la base de datos: $1']],
    [/^Metrics lookup failed: ([\s\S]*)$/, ['Falha na consulta de métricas: $1', 'Falló la consulta de métricas: $1']],
  ];
  // Narrower wording inside a container: [selector, { English: [pt, es] }]
  const CONTEXT = [
    ['.ytt', { 'Views': ['Visualiz.', 'Vistas'] }],
  ];
  const TITLES = {
    'Like Polling | YouTube Channel Intelligence': ['Like Polling | Inteligência de canais do YouTube', 'Like Polling | Inteligencia de canales de YouTube'],
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const idx = (l) => (l === 'pt' ? 0 : 1);
  const locale = (l) => (l === 'pt' ? 'pt-BR' : l);
  function localDate(s, lang) {
    const d = Date.parse(s);
    return Number.isNaN(d) ? s : new Date(d).toLocaleString(locale(lang), { dateStyle: 'medium', timeStyle: 'short' });
  }

  // English country names (as stored in Supabase) -> ISO code, for Intl.DisplayNames.
  const countryCode = {};
  try {
    const en = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = en.of(code);
      if (name && name !== code) countryCode[name] = code;
    }
    Object.assign(countryCode, { Turkey: 'TR', 'Türkiye': 'TR', 'South Korea': 'KR', Russia: 'RU', Vietnam: 'VN', 'Czech Republic': 'CZ' });
  } catch (e) { /* older browsers: country names stay in English */ }
  const regionNames = {};
  function country(name, lang) {
    const code = countryCode[name];
    if (!code) return null;
    try { return (regionNames[lang] ||= new Intl.DisplayNames([locale(lang)], { type: 'region' })).of(code); } catch (e) { return null; }
  }

  function translate(en, lang, el) {
    if (lang === 'en' || !en) return null;
    if (el) for (const [sel, map] of CONTEXT) if (map[en.trim()] && el.closest(sel)) return en.replace(en.trim(), map[en.trim()][idx(lang)]);
    if (RAW[en]) return RAW[en][idx(lang)];
    const core = en.trim();
    if (!core) return null;
    const lead = en.slice(0, en.indexOf(core)), trail = en.slice(en.indexOf(core) + core.length);
    let out = DICT[core] ? DICT[core][idx(lang)] : null;
    if (out == null) for (const [re, t, fn] of PATTERNS) {
      const m = core.match(re);
      if (m) { out = t[idx(lang)].replace('$1', () => (fn ? fn(m[1], lang) : m[1])); break; }
    }
    if (out == null) { const m = core.match(/^(.+?)(:?)$/); const c = m && country(m[1], lang); if (c) out = c + m[2]; }
    return out == null ? null : lead + out + trail;
  }
  function t(en) { return translate(en, lang) ?? en; }

  let stored = null;
  try { stored = localStorage.getItem(STORE); } catch (e) { /* storage blocked */ }
  const browser = (navigator.language || '').slice(0, 2).toLowerCase();
  let lang = LANGS.includes(stored) ? stored : LANGS.includes(browser) ? browser : 'en';

  const textEn = new WeakMap(), textOut = new WeakMap();
  const attrEn = new WeakMap();
  const skip = (el) => !el || el.closest('script, style, [data-no-i18n]');

  function doText(n) {
    if (skip(n.parentElement)) return;
    let en = textEn.get(n);
    if (en === undefined || n.data !== textOut.get(n)) { en = n.data; textEn.set(n, en); }
    const out = translate(en, lang, n.parentElement) ?? en;
    if (n.data !== out) n.data = out;
    textOut.set(n, out);
  }
  function doAttrs(el) {
    if (skip(el)) return;
    let rec = attrEn.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      rec ||= {};
      if (!rec[a] || cur !== rec[a].out) rec[a] = { en: cur };
      const out = translate(rec[a].en, lang) ?? rec[a].en;
      if (cur !== out) el.setAttribute(a, out);
      rec[a].out = out;
    }
    if (rec) attrEn.set(el, rec);
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) (n.nodeType === 3 ? doText : doAttrs)(n);
  }

  const titleEn = document.title;
  function apply() {
    observer.disconnect();
    walk(document.body);
    document.title = (TITLES[titleEn] && lang !== 'en') ? TITLES[titleEn][idx(lang)] : titleEn;
    document.documentElement.lang = locale(lang);
    switcher.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    observe();
  }

  const observer = new MutationObserver((records) => {
    observer.disconnect();
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') doText(r.target);
      else if (r.type === 'attributes') doAttrs(r.target);
    }
    observe();
  });
  function observe() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  const style = document.createElement('style');
  style.textContent = `
    .lp-lang { display: inline-flex; margin: 0 10px 0 auto; padding: 3px; border-radius: 999px; background: #f4f4f4; }
    .lp-lang button { border: 0; background: transparent; padding: 4px 9px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--muted, #737373); transition: color .15s, background .15s; }
    .lp-lang button:hover { color: var(--red, #b0000e); }
    .lp-lang button[aria-pressed="true"] { background: #fff; color: var(--red, #b0000e); box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 1px rgba(0,0,0,.04); }
    .lp-lang button:focus-visible { outline: 2px solid var(--red, #b0000e); outline-offset: 1px; }
    html[lang="es"] .ymu th { white-space: nowrap; }
    @media (max-width: 520px) {
      header.top:has(> .lp-lang) { flex-wrap: wrap; row-gap: 12px; }
      header.top > .brand, header.top > .live { white-space: nowrap; }
      .lp-lang { order: 3; margin: 0 0 0 auto; }
    }`;
  document.head.appendChild(style);

  const switcher = document.createElement('div');
  switcher.className = 'lp-lang';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Language');
  switcher.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" data-no-i18n lang="${l === 'pt' ? 'pt-BR' : l}">${l.toUpperCase()}</button>`).join('');
  switcher.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-lang]');
    if (b && b.dataset.lang !== lang) setLang(b.dataset.lang);
  });
  const header = document.querySelector('header.top');
  if (header) header.insertBefore(switcher, header.querySelector('.live'));

  function setLang(l) {
    if (!LANGS.includes(l)) return;
    lang = l;
    try { localStorage.setItem(STORE, l); } catch (e) { /* storage blocked */ }
    apply();
    document.dispatchEvent(new CustomEvent('lp:lang', { detail: { lang } }));
  }

  window.LP_I18N = { get lang() { return lang; }, setLang, t };
  apply();
})();
