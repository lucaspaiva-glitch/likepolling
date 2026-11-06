// "Your ad here" tab on the right edge of the homepage, lettered like the Hollywood sign.
// Computers: resting the mouse on it opens the ad-spot card; phones: a tap opens it. Self-contained.
(function () {
  'use strict';
  const MAIL = 'lucaspaiva@likepolling.com';
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const css = `
  .lp-sign { position: fixed; right: 0; top: 50%; z-index: 59; transform: translateY(-50%); font-family: Inter, system-ui, sans-serif; }
  .lp-sign-tab { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; width: 30px; padding: 12px 0 16px; border: 0; border-radius: 10px 0 0 10px; cursor: pointer;
    background: linear-gradient(180deg, #8fb4d9 0%, #c9dcef 38%, #6f8a4e 62%, #4f6634 100%); box-shadow: -2px 4px 14px -6px rgba(0,0,0,.45); overflow: hidden; }
  .lp-sign-tab b { position: relative; z-index: 1; display: block; font: 900 13px/1 'Kanit', 'Arial Black', system-ui, sans-serif; color: #fff; letter-spacing: 0; text-shadow: 0 1px 0 rgba(0,0,0,.35), 0 0 1px rgba(0,0,0,.5); }
  .lp-sign-tab b:nth-child(odd) { transform: translateX(-1px) rotate(-2deg); }
  .lp-sign-tab b:nth-child(even) { transform: translateX(1px) rotate(2deg); }
  .lp-sign-tab i { display: block; height: 6px; }
  .lp-sign-tab::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 1px, transparent 1px 5px); opacity: .5; }
  .lp-sign-tab:hover, .lp-sign-tab[aria-expanded="true"] { filter: brightness(1.08); }
  .lp-sign-tab:focus-visible { outline: 2px solid #b0000e; outline-offset: 2px; }
  .lp-sign-pop { position: absolute; right: 38px; top: 50%; width: 236px; transform: translateY(-50%); }
  .lp-sign-pop[hidden] { display: none; }
  .lp-sign-pop .svc { box-shadow: 0 18px 40px -16px rgba(0,0,0,.35); }
  .lp-sign-pop .svc-body { max-height: none; padding: 2px 14px 16px; opacity: 1; }
  @media (max-width: 700px) {
    .lp-sign { top: auto; bottom: 90px; transform: none; }
    .lp-sign-tab { width: 24px; padding: 9px 0 12px; }
    .lp-sign-tab b { font-size: 10.5px; }
    .lp-sign-pop { top: auto; bottom: 0; transform: none; right: 30px; width: min(260px, calc(100vw - 48px)); }
  }
  @media print { .lp-sign { display: none; } }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const letters = (w) => [...w].map((c) => `<b>${c}</b>`).join('');
  const root = document.createElement('div');
  root.className = 'lp-sign';
  root.setAttribute('data-no-i18n', '');
  document.body.appendChild(root);
  let open = false, hover = false, t = 0;
  function draw() {
    const mail = `mailto:${MAIL}?subject=${encodeURIComponent('Sponsoring Like Polling')}&body=${encodeURIComponent('Hi! I\'d like to know about the ad spot on Like Polling.\n\nBrand:\nCountries we target:\nWebsite:')}`;
    root.innerHTML = `<button type="button" class="lp-sign-tab" aria-expanded="${open}" aria-controls="lp-sign-pop" aria-label="${tr('Ad spot')}: ${tr('YOUR BRAND\nHERE').replace(/\n/g, ' ')}">${letters('YOUR')}<i></i>${letters('AD')}<i></i>${letters('HERE')}</button>
      <div class="lp-sign-pop" id="lp-sign-pop" ${open ? '' : 'hidden'}><section class="svc open">
        <div class="svc-tab" style="cursor:default"><span class="svc-top"><span class="svc-sym">${tr('Ad spot')}</span><span>${tr('Launch rate')}</span></span>
        <span class="svc-name svc-glitch" data-text="${tr('YOUR BRAND\nHERE')}">${tr('YOUR BRAND\nHERE')}</span><span class="svc-bar" aria-hidden="true"></span>
        <span class="svc-sub">${tr('A card on Like Polling, seen in 41 countries.')}</span></div>
        <div class="svc-body"><div class="svc-stats"><div><b>41</b><span>${tr('countries')}</span></div><div><b>2×</b><span>${tr('updated a day')}</span></div><div><b>1</b><span>${tr('brand at a time')}</span></div></div>
        <a class="svc-btn" href="${mail}">${tr('Ask about the ad spot')}</a><p class="svc-fine">${tr('Like the Machu Picchu Energy card. Monthly views and clicks included.')}</p></div>
      </section></div>`;
    root.querySelector('.lp-sign-tab').addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(t); if (hover) { hover = false; return; } set(!open); });
  }
  function set(on) { open = on; draw(); }
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    root.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); if (!open) t = setTimeout(() => { hover = true; set(true); }, 150); });
    root.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); t = setTimeout(() => { if (hover) { hover = false; set(false); } }, 350); });
  }
  document.addEventListener('click', (e) => { if (open && !root.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) set(false); });
  document.addEventListener('lp:lang', draw);
  draw();
})();
