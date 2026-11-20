// Compact country strip for the World News, Trending, Music, Popular Shorts and Education panels.
// Each widget's own <select> sits invisibly over a "flag · NAME · CODE n/N" strip, so tapping
// the strip opens the native country list and the widgets load data exactly as before.
(() => {
  const PANELS = [
    ['#news-front', '.nw-wpick select'],
    ['#yt-trending', '.ytt-select'],
    ['#yt-music', '.ymu-select'],
    ['.nw-credits', '.nw-pick .nw-select'],
    ['#edu', '.edu-select'],
    ['#fashion', '.fsh-select'],
    ['#restaurants', '.rst-select'],
    ['#ai-age', '.aia-select'],
  ];
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

  const css = document.createElement('style');
  css.textContent = `
    html, body { overscroll-behavior-x: none; }
    .lp-cs-grp { position: relative; display: inline-flex; align-items: center; min-width: 0; max-width: 100%; height: 24px; box-sizing: border-box; border: 1px solid rgba(255,42,60,.55); border-radius: 5px; overflow: hidden; background: linear-gradient(180deg, #8c000c, #7f000a 55%, #6e0009); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 0 10px -5px rgba(255,42,60,.75); cursor: pointer; transition: border-color .15s, box-shadow .15s; }
    .lp-cs-grp:hover { border-color: #ff2a3c; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 0 12px -3px rgba(255,42,60,.85); }
    .lp-cs-grp:focus-within { outline: 2px solid rgba(255,42,60,.45); outline-offset: 2px; }
    .lp-cs-grp img { flex: none; width: 16px; height: 12px; margin: 0 0 0 8px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
    .lp-cs-name { min-width: 0; padding: 0 9px 0 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 10.5px/normal ${MONO}; letter-spacing: .08em; text-transform: uppercase; }
    .lp-cs-name:first-child { padding-left: 10px; }
    .lp-cs-pos { flex: none; display: flex; align-items: center; gap: 5px; height: 100%; padding: 0 8px; background: rgba(0,0,0,.24); font: 700 9.5px/1 ${MONO}; letter-spacing: .1em; color: #fff; font-variant-numeric: tabular-nums; }
    .lp-cs-pos:empty { display: none; }
    .lp-cs-pos b { color: #ff8a94; font-weight: 700; }
    .lp-cs-grp select.lp-cs-sel { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; min-width: 0; margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; font-size: 16px; -webkit-appearance: none; appearance: none; }
    .lp-cs-grp select.lp-cs-sel option { color: #0d0d0d; background: #fff; }
    .lp-cs-nav { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; flex: 0 1 auto; }
    .lp-cs-nav > select { min-width: 0; max-width: 100%; flex: 0 1 auto; text-overflow: ellipsis; }
    .lp-cs-arr { flex: none; width: 24px; height: 24px; padding: 0 0 2px; margin: 0; box-sizing: border-box; border: 1px solid rgba(255,42,60,.55); border-radius: 5px; background: linear-gradient(180deg, #8c000c, #7f000a 55%, #6e0009); color: #fff; font: 700 16px/1 ${MONO}; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    .lp-cs-arr:hover { border-color: #ff2a3c; box-shadow: 0 0 12px -3px rgba(255,42,60,.85); }
    .lp-note-row { display: flex; flex-wrap: wrap; align-items: center; }
    .lp-note-row > .lp-note-body { flex-basis: 100%; }
    .lp-cs-foot { display: flex; min-width: 0; margin-left: auto; padding: 6px 14px; }
    .lp-cs-foot.lp-cs-solo { justify-content: center; margin: 0; padding: 12px; }
    .lp-cs-foot[hidden] { display: none; }
    .lp-cs-next { display: inline-flex; align-items: center; gap: 7px; min-width: 0; max-width: 100%; height: 28px; padding: 0 10px; box-sizing: border-box; border: 1px solid rgba(255,42,60,.55); border-radius: 5px; background: linear-gradient(180deg, #b8121f, #a90e1a 55%, #960b16); color: #fff; font-family: inherit; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 0 10px -5px rgba(255,42,60,.75); -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    .lp-cs-next:hover { border-color: #ff2a3c; box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 0 12px -3px rgba(255,42,60,.85); }
    .lp-cs-next:focus-visible { outline: 2px solid rgba(255,42,60,.6); outline-offset: 2px; }
    .lp-cs-next-l { flex: none; font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; color: rgba(255,255,255,.8); }
    .lp-cs-next img { flex: none; width: 16px; height: 12px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
    .lp-cs-next img[hidden] { display: none; }
    .lp-cs-next .lp-cs-name { padding: 0; }
    .lp-cs-next-c { flex: none; font: 700 16px/1 ${MONO}; margin-top: -2px; }
    .lp-cs-arr:focus-visible { outline: 2px solid rgba(255,42,60,.6); outline-offset: 2px; }
    @media (max-width: 560px) {
      .lp-cs-arr { width: 32px; height: 28px; }
      .lp-note-row .lp-cs-foot { flex-basis: 100%; justify-content: center; margin: 0; padding: 0 12px 12px; }
      #news-front .nw-head .nw-wpick, #yt-trending .lp-cs-nav, #yt-music .lp-cs-nav, #edu .lp-cs-nav, #fashion .fsh-top .lp-cs-nav { order: 2; flex-basis: 100%; }
      #yt-trending .lp-cs-nav, #yt-music .lp-cs-nav, #edu .lp-cs-nav, #fashion .fsh-top .lp-cs-nav { flex: 0 0 auto; margin-right: 100%; }
      #news-front .nw-head .nw-spacer { display: none; }
    }
  `;
  document.head.append(css);

  function setup([root, selQ]) {
    const panel = document.querySelector(root);
    const sel = panel && panel.querySelector(selQ);
    if (!sel || sel.options.length < 2 || sel.dataset.lpStrip) return false;
    sel.dataset.lpStrip = '1';

    const mk = (cls) => {
      const el = document.createElement('span');
      el.className = cls;
      el.setAttribute('data-no-i18n', '');
      el.setAttribute('aria-hidden', 'true');
      return el;
    };
    const name = mk('lp-cs-name');
    const pos = mk('lp-cs-pos');
    const flag = sel.previousElementSibling && sel.previousElementSibling.matches('img') ? sel.previousElementSibling : sel;
    const grp = document.createElement('span');
    grp.className = 'lp-cs-grp';
    flag.before(grp);
    sel.classList.add('lp-cs-sel');
    grp.append(...(flag === sel ? [] : [flag]), name, pos, sel);
    function refresh() {
      const list = [...sel.options].filter((o) => !o.disabled);
      const k = list.findIndex((o) => o.value === sel.value);
      const img = grp.querySelector('img');
      const m = img && /\/([a-z]{2})\.svg/.exec(img.getAttribute('src') || '');
      const code = m ? m[1].toUpperCase() : sel.value.toUpperCase();
      pos.innerHTML = !code ? '' : k < 0 ? `<b>${code}</b>` : `<b>${code}</b><span>${k + 1}/${list.length}</span>`;
      const o = sel.options[sel.selectedIndex];
      name.textContent = o ? o.textContent.trim() : '';
    }
    // Widgets often rebuild the options and then set .value (no event), so read after they finish.
    const later = () => setTimeout(refresh, 0);
    sel.addEventListener('change', () => {
      refresh();
      if (!still()) grp.animate([{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2), 0 0 14px 0 rgba(255,42,60,.9)' }, { boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 0 10px -5px rgba(255,42,60,.75)' }], { duration: 650, easing: 'ease-out' });
    });
    new MutationObserver(later).observe(sel, { childList: true, subtree: true, characterData: true });
    if (flag !== sel) new MutationObserver(later).observe(flag, { attributes: true, attributeFilter: ['src'] });
    document.addEventListener('lp:lang', later);
    setInterval(() => { const o = sel.options[sel.selectedIndex]; if ((o ? o.textContent.trim() : '') !== name.textContent) refresh(); }, 1000);
    refresh();
    return true;
  }

  // A quick sideways swipe on a section moves to the next (swipe left) or previous (swipe right)
  // country through the widget's own <select>: a finger on phones, two fingers on a laptop
  // trackpad. Touch listeners are passive and leave touch-action alone, so vertical scrolling stays
  // the browser's own. Swipes from the screen edges (Safari's back gesture), on a form field or on a
  // row that scrolls sideways are ignored; overscroll-behavior-x stops Chrome's swipe-to-go-back.
  const SWIPE = PANELS;
  const EDGE = 24;
  const sideScroller = (el, panel) => {
    for (let n = el; n && n !== panel; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
    return false;
  };
  function swipe([root, selQ]) {
    const panel = document.querySelector(root);
    const sel = panel && panel.querySelector(selQ);
    if (!sel || sel.options.length < 2 || sel.dataset.lpSwipe) return false;
    sel.dataset.lpSwipe = '1';
    const step = (dir) => {
      const list = [...sel.options].filter((o) => !o.disabled);
      if (list.length < 2) return;
      const k = list.findIndex((o) => o.value === sel.value);
      sel.value = list[(k + dir + list.length) % list.length].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (!still()) panel.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    };
    // ‹ › buttons either side of the country picker: one click or tap per country, both ways.
    const anchor = sel.closest('.lp-cs-grp') || (sel.parentElement.matches('.nw-wpick') ? sel.parentElement : sel);
    const nav = document.createElement('span');
    nav.className = 'lp-cs-nav';
    anchor.before(nav);
    const arrow = (dir, label, ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lp-cs-arr';
      b.setAttribute('aria-label', label);
      b.setAttribute('data-no-i18n', '');
      b.textContent = ch;
      b.addEventListener('click', () => step(dir));
      return b;
    };
    nav.append(arrow(-1, 'Previous country', '‹'), anchor, arrow(1, 'Next country', '›'));
    foot(panel, sel, step);
    const skip = (t) => t.closest('input, select, textarea, button, [contenteditable]') || sideScroller(t, panel);
    panel.addEventListener('click', (e) => {
      if (!e.target.closest('.lp-next')) return;
      step(1);
      if (panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start', behavior: still() ? 'auto' : 'smooth' });
    });

    let sx = 0, sy = 0, st = 0, on = false;
    panel.addEventListener('touchstart', (e) => {
      const p = e.touches[0];
      on = e.touches.length === 1 && p.clientX > EDGE && p.clientX < innerWidth - EDGE && !skip(e.target);
      if (on) { sx = p.clientX; sy = p.clientY; st = e.timeStamp; }
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => { if (on && e.touches.length > 1) on = false; }, { passive: true });
    panel.addEventListener('touchcancel', () => { on = false; }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      if (!on) return;
      on = false;
      const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 2 && e.timeStamp - st <= 800) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    // Trackpad: add up one gesture's sideways scrolling, step once, then ignore the momentum tail.
    let acc = 0, used = false, quiet;
    panel.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY) || skip(e.target)) return;
      e.preventDefault();
      clearTimeout(quiet);
      quiet = setTimeout(() => { acc = 0; used = false; }, 250);
      if (used) return;
      acc += e.deltaX;
      if (Math.abs(acc) > 60) { used = true; step(acc > 0 ? 1 : -1); }
    }, { passive: false });
    return true;
  }

  // "Next country: 🇪🇸 Spain ›" in the section's footer row, beside "How this works", so a reader who
  // reached the end moves on without scrolling back up. It steps the same <select> as the top strip,
  // then brings the section's top into view for the new country.
  function foot(panel, sel, step) {
    const tr = (t) => (window.LP_I18N ? window.LP_I18N.t(t) : t);
    const bar = document.createElement('div');
    bar.className = 'lp-cs-foot';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lp-cs-next';
    btn.setAttribute('data-no-i18n', '');
    const label = document.createElement('span');
    label.className = 'lp-cs-next-l';
    const img = document.createElement('img');
    img.alt = '';
    img.width = 16; img.height = 12;
    const name = document.createElement('span');
    name.className = 'lp-cs-name';
    const chev = document.createElement('span');
    chev.className = 'lp-cs-next-c';
    chev.textContent = '›';
    btn.append(label, img, name, chev);
    bar.append(btn);
    btn.addEventListener('click', () => {
      step(1);
      if (panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start', behavior: still() ? 'auto' : 'smooth' });
    });
    const sync = () => {
      const list = [...sel.options].filter((o) => !o.disabled);
      const k = list.findIndex((o) => o.value === sel.value);
      const o = list[(k + 1) % list.length];
      bar.hidden = list.length < 2 || !o;
      if (!o) return;
      const cc = /^[a-z]{2}$/i.test(o.value) ? o.value.toLowerCase() : '';
      img.hidden = !cc;
      if (cc && img.getAttribute('src') !== `/assets/flags/${cc}.svg`) img.setAttribute('src', `/assets/flags/${cc}.svg`);
      const t = o.textContent.trim();
      if (name.textContent !== t) name.textContent = t;
      const l = tr('Next country');
      if (label.textContent !== l) label.textContent = l;
      btn.setAttribute('aria-label', `${l}: ${t}`);
      const notes = panel.querySelectorAll('.lp-note');
      const note = notes[notes.length - 1];
      if (note && note.offsetParent !== null) {
        note.classList.add('lp-note-row');
        bar.classList.remove('lp-cs-solo');
        if (bar.previousElementSibling !== note.firstElementChild) note.firstElementChild.after(bar);
      } else {
        bar.classList.add('lp-cs-solo');
        if (bar !== panel.lastElementChild) panel.append(bar);
      }
    };
    const later = () => setTimeout(sync, 0);
    sel.addEventListener('change', later);
    new MutationObserver(later).observe(sel, { childList: true, subtree: true, characterData: true });
    document.addEventListener('lp:lang', later);
    setInterval(sync, 1000);
    sync();
  }

  // Long country names get their short form so the ‹ › arrows stay on screen ('United States' -> 'U.S.').
  const SHORT_NAMES = { US: { en: 'U.S.', pt: 'EUA', es: 'EE. UU.', de: 'USA', ru: 'США', uk: 'США' }, GB: { en: 'U.K.', de: 'UK' }, ZA: { ru: 'ЮАР', uk: 'ПАР' } };
  // Full names in the page language -> short form, e.g. pt 'Estados Unidos' -> 'EUA'.
  function shorten(sel) {
    const l = (window.LP_I18N && window.LP_I18N.lang) || document.documentElement.lang || 'en';
    const base = l.slice(0, 2), map = new Map();
    for (const [cc, by] of Object.entries(SHORT_NAMES)) {
      if (!by[base]) continue;
      for (const loc of [l, base, base === 'pt' ? 'pt-BR' : base, base === 'pt' ? 'pt-PT' : base, 'en']) {
        try { map.set(new Intl.DisplayNames([loc], { type: 'region' }).of(cc), by[base]); } catch (e) { /* no Intl */ }
      }
    }
    for (const o of sel.options) { const t = map.get(o.textContent.trim()); if (t) o.textContent = t; }
  }
  const shortened = new Set();
  function watchNames(sel) {
    if (shortened.has(sel)) return;
    shortened.add(sel);
    shorten(sel);
    new MutationObserver(() => shorten(sel)).observe(sel, { childList: true, subtree: true, characterData: true });
  }

  // A section with more than 14 countries shows only the 14 main ones.
  const MAIN = ['BR', 'PT', 'US', 'ES', 'FR', 'DE', 'GB', 'JP', 'KR', 'RU', 'UA', 'MX', 'IN', 'CN'];
  const trim = (sel) => {
    const cc = [...sel.options].filter((o) => /^[A-Z]{2}$/.test(o.value));
    if (cc.length <= MAIN.length) return;
    const keep = cc.filter((o) => MAIN.includes(o.value.toUpperCase()));
    if (!keep.length) return;
    const was = sel.value;
    cc.forEach((o) => { if (!keep.includes(o)) o.remove(); });
    if (sel.value === was) return;
    sel.value = window.LP_CC ? window.LP_CC(keep.map((o) => o.value)) : keep[0].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const trimmed = new Set();

  const done = new Set(), swiped = new Set();
  let tries = 0;
  const timer = setInterval(() => {
    PANELS.forEach(([root, q]) => {
      const sel = document.querySelector(`${root} ${q}`);
      if (!sel || trimmed.has(sel)) return;
      trimmed.add(sel);
      trim(sel);
      new MutationObserver(() => trim(sel)).observe(sel, { childList: true, subtree: true });
    });
    PANELS.forEach((p, i) => { if (!done.has(i) && setup(p)) done.add(i); });
    SWIPE.forEach((p, i) => { if (!swiped.has(i) && swipe(p)) swiped.add(i); });
    SWIPE.forEach(([root, q]) => { const sel = document.querySelector(`${root} ${q}`); if (sel && sel.options.length) watchNames(sel); });
    if ((done.size === PANELS.length && swiped.size === SWIPE.length) || ++tries > 120) clearInterval(timer);
  }, 500);
})();
