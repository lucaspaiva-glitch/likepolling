// Swipe sideways on a country panel (World News, Trending, Music, Popular Shorts) to move to the
// next/previous country. It drives each widget's own <select> (sets its value and fires "change"),
// so the widgets keep loading data exactly as before. Also adds ‹ › buttons and a position counter.
(() => {
  const PANELS = [
    ['#news-front', '.nw-wpick select', '.nw-feed-wrap'],
    ['#yt-trending', '.ytt-select', '.ytt-body'],
    ['#yt-music', '.ymu-select', '.ymu-body'],
    ['.nw-credits', '.nw-pick .nw-select', '.nw-feed-wrap'],
  ];
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const EDGE = 28;

  const css = document.createElement('style');
  css.textContent = `
    .lp-cs-surface { touch-action: pan-y pinch-zoom; }
    .lp-cs-btn { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--line, #ebebeb); border-radius: 8px; background: #fff; color: var(--red, #b0000e); font: 600 16px/1 system-ui, sans-serif; cursor: pointer; transition: border-color .15s, background-color .15s; }
    .lp-cs-btn:hover { border-color: var(--red, #b0000e); background: var(--red-soft, #fbf1f1); }
    .lp-cs-btn:focus-visible { outline: none; border-color: var(--red, #b0000e); box-shadow: 0 0 0 3px var(--red-ring, rgba(176,0,14,.12)); }
    .lp-cs-grp { display: inline-flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; max-width: 100%; }
    .lp-cs-grp select { min-width: 0; }
    .lp-cs-pos { flex: none; font: 600 10.5px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .06em; color: var(--muted, #737373); font-variant-numeric: tabular-nums; }
    .lp-cs-hint { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0; padding: 7px 14px; font: 600 10.5px/1.2 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--muted, #737373); }
    .lp-cs-hint b { color: var(--red, #b0000e); font-weight: 700; }
    .lp-cs-hint[hidden] { display: none; }
  `;
  document.head.append(css);

  function enabled(sel) { return [...sel.options].filter((o) => !o.disabled); }

  function setup([root, selQ, surfQ], i) {
    const panel = document.querySelector(root);
    const sel = panel && panel.querySelector(selQ);
    const surf = panel && panel.querySelector(surfQ);
    if (!sel || !surf || sel.options.length < 2 || sel.dataset.lpSwipe) return false;
    sel.dataset.lpSwipe = '1';
    surf.classList.add('lp-cs-surface');

    const mk = (label, txt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lp-cs-btn';
      b.setAttribute('aria-label', label);
      b.setAttribute('data-no-i18n', '');
      b.textContent = txt;
      return b;
    };
    const prev = mk(t('Previous country'), '‹');
    const next = mk(t('Next country'), '›');
    const pos = document.createElement('span');
    pos.className = 'lp-cs-pos';
    pos.setAttribute('data-no-i18n', '');
    pos.setAttribute('aria-hidden', 'true');
    const flag = sel.previousElementSibling && sel.previousElementSibling.matches('img') ? sel.previousElementSibling : sel;
    const grp = document.createElement('span');
    grp.className = 'lp-cs-grp';
    flag.before(grp);
    grp.append(prev, ...(flag === sel ? [] : [flag]), sel, next, pos);

    let hint = null;
    if (touch) {
      hint = document.createElement('p');
      hint.className = 'lp-cs-hint';
      hint.setAttribute('data-no-i18n', '');
      surf.before(hint);
    }

    function refresh() {
      const list = enabled(sel);
      const k = list.findIndex((o) => o.value === sel.value);
      pos.textContent = k < 0 ? '' : `${k + 1}/${list.length}`;
      prev.setAttribute('aria-label', t('Previous country'));
      next.setAttribute('aria-label', t('Next country'));
      if (hint) hint.innerHTML = `<b>‹</b><span>${t('Swipe to change country')}</span><b>›</b>`;
    }

    let pending = 0, fallback = 0;
    function slide() {
      clearTimeout(fallback);
      const dir = pending;
      pending = 0;
      if (!dir || still()) return;
      surf.animate([{ transform: `translateX(${dir * 44}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    new MutationObserver(() => { if (pending) slide(); }).observe(surf, { childList: true, subtree: true });

    function step(dir) {
      const list = enabled(sel);
      if (list.length < 2) return;
      const k = list.findIndex((o) => o.value === sel.value);
      sel.value = list[(k + dir + list.length) % list.length].value;
      pending = dir;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      refresh();
      fallback = setTimeout(slide, 700);
    }
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    sel.addEventListener('change', refresh);
    new MutationObserver(refresh).observe(sel, { childList: true });
    refresh();

    let sx = 0, sy = 0, st = 0, track = false, lock = '';
    surf.addEventListener('touchstart', (e) => {
      const p = e.touches[0];
      track = e.touches.length === 1 && p.clientX > EDGE && !e.target.closest('input, select, textarea');
      if (!track) return;
      sx = p.clientX; sy = p.clientY; st = performance.now(); lock = '';
    }, { passive: true });
    surf.addEventListener('touchmove', (e) => {
      if (!track) return;
      const p = e.touches[0], dx = p.clientX - sx, dy = p.clientY - sy;
      if (!lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
      if (lock === 'x' && !still()) surf.style.transform = `translateX(${dx * 0.35}px)`;
    }, { passive: true });
    const end = (e) => {
      if (!track) return;
      track = false;
      surf.style.transform = '';
      const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
      if (lock === 'x' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - st < 900) step(dx < 0 ? 1 : -1);
    };
    surf.addEventListener('touchend', end, { passive: true });
    surf.addEventListener('touchcancel', () => { track = false; surf.style.transform = ''; }, { passive: true });

    if (touch && !still() && 'IntersectionObserver' in window) {
      const key = `lp-cs-nudge-${i}`;
      let seen = false;
      try { seen = sessionStorage.getItem(key) === '1'; } catch (e) { /* no storage */ }
      if (!seen) {
        const io = new IntersectionObserver((ents) => {
          if (!ents.some((x) => x.isIntersecting)) return;
          io.disconnect();
          try { sessionStorage.setItem(key, '1'); } catch (e) { /* no storage */ }
          surf.animate([{ transform: 'none' }, { transform: 'translateX(-26px)' }, { transform: 'none' }, { transform: 'translateX(-12px)' }, { transform: 'none' }], { duration: 1200, delay: 400, easing: 'ease-in-out' });
        }, { threshold: 0.5 });
        io.observe(surf);
      }
    }
    return true;
  }

  const done = new Set();
  let tries = 0;
  const timer = setInterval(() => {
    PANELS.forEach((p, i) => { if (!done.has(i) && setup(p, i)) done.add(i); });
    if (done.size === PANELS.length || ++tries > 120) clearInterval(timer);
  }, 500);
})();
