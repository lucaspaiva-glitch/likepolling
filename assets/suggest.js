// Google-style name suggestions for the artist/company boxes, straight from Wikipedia (free; nothing goes to Like Polling).
// LPSuggest(input, { type: () => 'artist' | 'company', onPick(item) }). Mouse, keyboard and touch.
(() => {
  const API = 'https://en.wikipedia.org/w/api.php?';
  const FIT = {
    artist: /\b(singer|rapper|musician|band|group|songwriter|DJ|producer|composer|duo|trio|artist|actor|actress|entertainer|performer|idol|vocalist|guitarist|pianist|drummer|YouTuber|influencer|comedian)\b/i,
    company: /\b(company|corporation|brand|manufacturer|retailer|business|conglomerate|airline|bank|multinational|chain|firm|maker|platform|enterprise|group|cooperative|subsidiary|startup|fashion house|label|store|network|service|operator|developer|publisher|franchise|restaurant|carrier|holding|beverage|drink|automaker|clothing|apparel|cosmetics|beer|website|app|marketplace|streaming)\b/i,
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const query = (p) => fetch(API + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1', prop: 'description|pageimages|pageprops', ppprop: 'disambiguation', piprop: 'thumbnail', pithumbsize: '80', ...p }))
    .then((r) => r.json()).then((j) => (j.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0))).catch(() => []);
  const ok = (p) => !p.missing && !p.pageprops && !/^Lists? of /.test(p.title);

  async function find(text, type) {
    let pages = (await query({ generator: 'prefixsearch', gpssearch: text, gpslimit: '10' })).filter(ok);
    if (pages.length < 4) {
      const seen = new Set(pages.map((p) => p.title));
      pages = pages.concat((await query({ generator: 'search', gsrsearch: text, gsrlimit: '8' })).filter((p) => ok(p) && !seen.has(p.title)));
    }
    const fit = FIT[type] || /$^/;
    return pages.map((p, i) => ({ title: p.title, description: p.description || '', image: p.thumbnail?.source || '', fit: fit.test(p.description || ''), i }))
      .sort((a, b) => b.fit - a.fit || a.i - b.i).slice(0, 6);
  }

  window.LPSuggest = (input, { type = () => '', onPick = () => {} } = {}) => {
    const wrap = document.createElement('span');
    wrap.className = 'lp-sug-wrap';
    input.before(wrap);
    const box = document.createElement('ul');
    box.className = 'lp-sug';
    box.id = `${input.id}-sug`;
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    wrap.append(input, box);
    input.removeAttribute('list');
    Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': box.id, 'aria-expanded': 'false', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'search' }).forEach(([k, v]) => input.setAttribute(k, v));
    let items = [], active = -1, seq = 0, timer = 0;

    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
    const mark = (i) => {
      active = i;
      [...box.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
      if (i >= 0) { input.setAttribute('aria-activedescendant', box.children[i].id); box.children[i].scrollIntoView({ block: 'nearest' }); }
    };
    const pick = (i) => { const it = items[i]; if (!it) return; input.value = it.title; input.dataset.picked = it.title; close(); onPick(it); };
    const title = (t, typed) => (t.toLowerCase().startsWith(typed.toLowerCase()) ? `${esc(t.slice(0, typed.length))}<strong>${esc(t.slice(typed.length))}</strong>` : `<strong>${esc(t)}</strong>`);
    function render(typed) {
      if (!items.length) return close();
      box.innerHTML = items.map((it, k) => `<li role="option" id="${box.id}-${k}" aria-selected="false">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : `<i>${esc(it.title[0])}</i>`}<span><b>${title(it.title, typed)}</b>${it.description ? `<small>${esc(it.description)}</small>` : ''}</span></li>`).join('');
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      mark(items[0].fit && items[0].title.toLowerCase().startsWith(typed.toLowerCase()) ? 0 : -1);
    }
    input.addEventListener('input', () => {
      delete input.dataset.picked;
      clearTimeout(timer);
      const typed = input.value.trim();
      if (typed.length < 2) { items = []; return close(); }
      const n = ++seq;
      timer = setTimeout(async () => { const found = await find(typed, type()); if (n === seq) { items = found; render(typed); } }, 150);
    });
    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mark((active + (e.key === 'ArrowDown' ? 1 : items.length - 1 + (active < 0 ? 1 : 0))) % items.length); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') close();
    });
    box.addEventListener('pointerdown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) pick([...box.children].indexOf(li)); });
    box.addEventListener('pointermove', (e) => { const li = e.target.closest('li'); if (li) mark([...box.children].indexOf(li)); });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('focus', () => { if (items.length && input.value.trim().length >= 2 && !input.dataset.picked) { box.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
  };
})();
