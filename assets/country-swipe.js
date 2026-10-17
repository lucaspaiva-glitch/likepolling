// Compact country strip for the World News, Trending, Music and Popular Shorts panels.
// Each widget's own <select> sits invisibly over a "flag · NAME · CODE n/N" strip, so tapping
// the strip opens the native country list and the widgets load data exactly as before.
(() => {
  const PANELS = [
    ['#news-front', '.nw-wpick select'],
    ['#yt-trending', '.ytt-select'],
    ['#yt-music', '.ymu-select'],
    ['.nw-credits', '.nw-pick .nw-select'],
  ];
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

  const css = document.createElement('style');
  css.textContent = `
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
    @media (max-width: 560px) {
      #news-front .nw-head .nw-wpick, #yt-trending .lp-cs-grp, #yt-music .lp-cs-grp { order: 2; flex-basis: 100%; }
      #yt-trending .lp-cs-grp, #yt-music .lp-cs-grp { flex: 0 0 auto; margin-right: 100%; }
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

  const done = new Set();
  let tries = 0;
  const timer = setInterval(() => {
    PANELS.forEach((p, i) => { if (!done.has(i) && setup(p)) done.add(i); });
    if (done.size === PANELS.length || ++tries > 120) clearInterval(timer);
  }, 500);
})();
