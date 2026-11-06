// "Your ad here" tab on the right edge of the homepage, lettered like the Hollywood sign.
// Computers: resting the mouse on it opens the ad-spot card; phones: a tap opens it. Self-contained.
(function () {
  'use strict';
  const MAIL = 'lucaspaiva@likepolling.com';
  const BUY = ''; // Gumroad link for the ad spot; empty = email button
  const PRICE = '€18';
  const tr = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const css = `
  .lp-sign { position: fixed; right: 0; top: 50%; z-index: 59; transform: translateY(-50%); font-family: Inter, system-ui, sans-serif; }
  .lp-sign-tab { position: relative; display: flex; flex-direction: column; align-items: center; width: 34px; padding: 0; border: 0; background: none; cursor: pointer; animation: lp-fly 6s ease-in-out infinite; }
  .lp-sign-tab svg.plane { display: block; width: 30px; height: 34px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.25)); }
  .lp-sign-tab .rope { display: block; width: 1px; height: 8px; background: #b0000e; opacity: .7; }
  .lp-sign-tab .flag { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; width: 26px; padding: 8px 0; border: 1.5px solid #b0000e; border-radius: 3px; background: #fff; box-shadow: -2px 6px 14px -8px rgba(0,0,0,.45); transform-origin: top center; animation: lp-flap 2.2s ease-in-out infinite; }
  .lp-sign-tab .flag::after { content: ''; position: absolute; left: -1.5px; right: -1.5px; bottom: -8px; height: 8px; background: linear-gradient(135deg, #b0000e 50%, transparent 50%) left / 50% 100% no-repeat, linear-gradient(225deg, #b0000e 50%, transparent 50%) right / 50% 100% no-repeat; }
  .lp-sign-tab b { display: block; font: 900 12px/1.02 'Kanit', 'Arial Black', system-ui, sans-serif; color: #b0000e; }
  .lp-sign-tab i { display: block; height: 5px; }
  @keyframes lp-fly { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes lp-flap { 0%, 100% { transform: skewX(0deg); } 50% { transform: skewX(-4deg); } }
  @media (prefers-reduced-motion: reduce) { .lp-sign-tab, .lp-sign-tab .flag { animation: none; } }
  .lp-sign-tab:hover .flag, .lp-sign-tab[aria-expanded="true"] .flag { background: #fbeaec; }
  .lp-sign-tab:focus-visible { outline: 2px solid #b0000e; outline-offset: 2px; }
  .lp-sign-pop { position: absolute; right: 38px; top: 50%; width: 270px; transform: translateY(-50%); }
  .lp-sign-pop[hidden] { display: none; }
  .lp-sign-pop .svc { box-shadow: 0 18px 40px -16px rgba(0,0,0,.35); }
  .lp-sign-pop .svc-body { max-height: none; padding: 2px 14px 16px; opacity: 1; }
  .lp-sign-form p { margin: 0 0 12px; font: 500 14px/2 Inter, system-ui, sans-serif; color: #222; }
  .lp-sign-form input { width: 9.5em; max-width: 100%; padding: 1px 2px; border: 0; border-bottom: 1.5px solid #b0000e; background: transparent; font: 600 14px Inter, system-ui, sans-serif; color: #b0000e; outline: 0; }
  .lp-sign-form input[name="kind"] { width: 6.5em; }
  .lp-sign-form input::placeholder { color: #c98a8f; font-weight: 500; }
  .lp-sign-form input:focus { background: #fbeaec; }
  .lp-sign-form input.need { border-bottom-color: #ff5a1f; background: #fff3ec; }
  @media (max-width: 700px) {
    .lp-sign { top: auto; bottom: 90px; transform: none; }
    .lp-sign-tab { width: 28px; }
    .lp-sign-tab svg.plane { width: 24px; height: 28px; }
    .lp-sign-tab .flag { width: 22px; padding: 6px 0; }
    .lp-sign-tab b { font-size: 10px; }
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
    root.innerHTML = `<button type="button" class="lp-sign-tab" aria-expanded="${open}" aria-controls="lp-sign-pop" aria-label="${tr('Ad spot')}: ${tr('YOUR BRAND\nHERE').replace(/\n/g, ' ')}"><svg class="plane" viewBox="0 0 30 34" aria-hidden="true"><path d="M15 1c1.6 0 2.6 1.6 2.6 4v7l11 6v3.2l-11-3v7.3l3.6 2.8V31l-6.2-1.6L8.8 31v-2.7l3.6-2.8v-7.3l-11 3V18l11-6V5C12.4 2.6 13.4 1 15 1Z" fill="#b0000e"/><path d="M15 3.2c.8 0 1.2.9 1.2 2.2v3h-2.4v-3c0-1.3.4-2.2 1.2-2.2Z" fill="#fff"/><rect x="3" y="18.4" width="6" height="1.4" rx=".7" fill="#fff" transform="rotate(-16 6 19)"/><rect x="21" y="18.4" width="6" height="1.4" rx=".7" fill="#fff" transform="rotate(16 24 19)"/></svg><span class="rope"></span><span class="flag">${letters('YOUR')}<i></i>${letters('AD')}<i></i>${letters('HERE')}</span></button>
      <div class="lp-sign-pop" id="lp-sign-pop" ${open ? '' : 'hidden'}><section class="svc open">
        <div class="svc-tab" style="cursor:default"><span class="svc-top"><span class="svc-sym">${tr('Ad spot')}</span><span>${tr('Launch rate')}</span></span>
        <span class="svc-name svc-glitch" data-text="${tr('YOUR BRAND\nHERE')}">${tr('YOUR BRAND\nHERE')}</span><span class="svc-bar" aria-hidden="true"></span>
        <span class="svc-sub">${tr('A card on Like Polling, seen in 41 countries.')}</span></div>
        <div class="svc-body"><div class="svc-stats"><div><b>41</b><span>${tr('countries')}</span></div><div><b>2×</b><span>${tr('updated a day')}</span></div><div><b>1</b><span>${tr('brand at a time')}</span></div></div>
        <form class="lp-sign-form" novalidate><p>${tr('We are')} <input name="brand" placeholder="${tr('brand name')}" autocomplete="organization" required>, ${tr('a')} <input name="kind" placeholder="${tr('kind of')}" required> ${tr('company, at')} <input name="site" placeholder="${tr('website')}" inputmode="url" autocomplete="url" required>.</p>
        <a class="svc-btn" href="#">${tr('Buy')} · ${tr('1 week')} · ${PRICE}</a></form><p class="svc-fine">${tr('Like the Machu Picchu Energy card. Weekly views and clicks included.')}</p></div>
      </section></div>`;
    const f = root.querySelector('.lp-sign-form'), go = f.querySelector('.svc-btn');
    const val = () => Object.fromEntries([...f.elements].filter((e) => e.name).map((e) => [e.name, e.value.trim()]));
    const link = () => {
      const v = val();
      if (BUY) return `${BUY}?wanted=true&brand=${encodeURIComponent(v.brand)}&kind=${encodeURIComponent(v.kind)}&website=${encodeURIComponent(v.site)}`;
      return `mailto:${MAIL}?subject=${encodeURIComponent('Ad spot: ' + v.brand)}&body=${encodeURIComponent(`Hi! We'd like the ad spot on Like Polling for 1 week (${PRICE}).\n\nBrand: ${v.brand}\nKind of company: ${v.kind}\nWebsite: ${v.site}`)}`;
    };
    f.addEventListener('input', () => { go.href = link(); });
    go.addEventListener('click', (e) => {
      const empty = [...f.elements].find((x) => x.name && !x.value.trim());
      if (empty) { e.preventDefault(); empty.focus(); empty.classList.add('need'); return; }
      go.href = link();
      if (BUY) { go.target = '_blank'; go.rel = 'noopener'; }
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); go.click(); });
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
