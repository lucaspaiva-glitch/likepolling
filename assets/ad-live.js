// Homepage truck: up to 6 paid wagons (GET /api/ad) join the house sponsor wagon, each with its own card.
(function () {
  'use strict';
  const rail = document.getElementById('lp-rail'), tab0 = document.getElementById('ad-tab'), pop0 = document.getElementById('ad-pop');
  if (!rail || !tab0 || !pop0) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pops = [];

  function fill(tab, pop, a) {
    const host = new URL(a.website).hostname.replace(/^www\./, '');
    const words = a.brand.split(/\s+/).filter(Boolean);
    pop.querySelectorAll('a[href^="https://machupicchu.energy"]').forEach((l) => { l.href = a.website; });
    pop.querySelector('.mpe-main').setAttribute('aria-label', `Sponsored: ${a.brand} (opens ${host} in a new tab)`);
    pop.querySelector('.mpe-sym').textContent = (words.length > 1 ? words.map((w) => w[0]).join('') : a.brand).slice(0, 3).toUpperCase();
    const name = pop.querySelector('.mpe-name');
    name.textContent = name.dataset.text = a.brand.toUpperCase();
    if (a.tagline) {
      const t = document.createElement('div');
      t.textContent = a.tagline;
      t.setAttribute('data-no-i18n', '');
      t.style.cssText = 'padding:0 12px 9px;font:500 12px/1.35 Inter,system-ui,sans-serif;color:#ffd0d5';
      pop.querySelector('.mpe-bar').after(t);
    }
    if (/^[A-Za-z0-9_-]{11}$/.test(a.video || '')) {
      const v = document.createElement('a');
      v.className = 'mpe-vid'; v.href = `https://www.youtube.com/watch?v=${a.video}`; v.target = '_blank'; v.rel = 'sponsored noopener';
      v.setAttribute('aria-label', `${a.brand} video on YouTube (opens in a new tab)`);
      v.innerHTML = `<span class="lp-rth"><img src="https://i.ytimg.com/vi/${a.video}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180"><i class="mpe-play" aria-hidden="true"></i></span>`;
      pop.querySelector('.mpe-url').before(v);
    }
    const text = (el, s) => { const n = [...el.childNodes].reverse().find((x) => x.nodeType === 3 && x.textContent.trim()); if (n) n.textContent = s; };
    const urls = pop.querySelectorAll('.mpe-url');
    if (urls[0]) text(urls[0].querySelector('a'), `${host} `);
    if (urls[1]) {
      const ig = urls[1].querySelector('a');
      if (a.instagram) { ig.href = `https://www.instagram.com/${a.instagram}/`; ig.setAttribute('aria-label', `${a.brand} on Instagram (opens in a new tab)`); text(ig, `@${a.instagram} `); } else urls[1].remove();
    }
    tab.setAttribute('aria-label', `Sponsored: ${a.brand}`);
    tab.querySelectorAll('.lp-mq-t > span').forEach((s) => { s.textContent = a.brand; });
    const can = tab.querySelector('.mpe-can');
    if (can) can.remove();
  }

  function wire(tab, pop) {
    let hoverOpen = false, t = 0;
    const place = () => {
      if (pop.hidden) return;
      const r = tab.getBoundingClientRect();
      pop.style.setProperty('--pop-y', `${Math.round(Math.max(8, Math.min(r.top, innerHeight - pop.offsetHeight - 8)))}px`);
      requestAnimationFrame(place);
    };
    const set = (on) => {
      if (on) pops.forEach((p) => { if (p.pop !== pop) p.set(false); });
      if (!on) hoverOpen = false;
      pop.hidden = !on;
      tab.setAttribute('aria-expanded', String(on));
      place();
    };
    pops.push({ pop, set });
    tab.addEventListener('click', () => { clearTimeout(t); if (hoverOpen) { hoverOpen = false; return set(true); } set(pop.hidden); });
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && !tab.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) set(false); });
    if (fine) {
      [tab, pop].forEach((el) => {
        el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); if (pop.hidden) t = setTimeout(() => { hoverOpen = true; set(true); }, 150); });
        el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); if (hoverOpen) t = setTimeout(() => { if (hoverOpen) set(false); }, 350); });
      });
    }
  }

  // Right side: a plane flies up the edge about once a minute, towing one paid brand at a time, in turn.
  function flyby(planes) {
    if (!planes.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const st = document.createElement('style');
    st.textContent = `.lp-flyby { position: fixed; right: 6px; top: 0; z-index: 59; display: flex; flex-direction: column; align-items: center; text-decoration: none; transform: translateY(100vh); animation: lp-fly 11s linear forwards; }
      .lp-flyby svg { width: 24px; height: 28px; filter: drop-shadow(0 0 4px rgba(255,42,60,.8)); }
      .lp-flyby .rope { width: 1px; height: 9px; background: #ff2a3c; }
      .lp-flyby .flag { writing-mode: vertical-rl; padding: 9px 4px; border: 1px solid #ff2a3c; background: linear-gradient(90deg, #1f0004, #36000a); color: #ff4a5c; font: 700 11px/1 'Chakra Petch', Inter, sans-serif; letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; box-shadow: 0 0 12px -3px rgba(255,42,60,.9); animation: mpe-neon 4s ease-in-out infinite; }
      .lp-flyby small { margin-top: 3px; padding: 1px 3px; border-radius: 3px; background: rgba(255,42,60,.18); color: #ff6a78; font: 700 6.5px/1.2 'Chakra Petch', Inter, sans-serif; letter-spacing: .08em; }
      .lp-flyby:hover .flag, .lp-flyby:focus-visible .flag { color: #fff; }
      body.lp-drawer-open .lp-flyby { opacity: 0; pointer-events: none; }
      @keyframes lp-fly { from { transform: translateY(100vh); } to { transform: translateY(-100%); } }`;
    document.head.appendChild(st);
    let i = 0;
    const fly = () => {
      const a = planes[i++ % planes.length];
      const el = document.createElement('a');
      el.className = 'lp-flyby'; el.href = a.website; el.target = '_blank'; el.rel = 'sponsored noopener';
      el.setAttribute('aria-label', `Sponsored: ${a.brand} (opens ${new URL(a.website).hostname} in a new tab)`);
      el.setAttribute('data-no-i18n', '');
      el.innerHTML = '<svg viewBox="0 0 30 34" aria-hidden="true"><path fill="#ff2a3c" d="M15 1c1.6 0 2.6 1.6 2.6 4v7l11 6v3.2l-11-3.4v6.6l3.4 2.6V30L15 28.6 9 30v-2.4l3.4-2.6v-6.6l-11 3.4V18l11-6V5c0-2.4 1-4 2.6-4z"/></svg><span class="rope"></span><span class="flag"></span><small>AD</small>';
      el.querySelector('.flag').textContent = a.brand;
      el.addEventListener('animationend', (e) => { if (e.animationName === 'lp-fly') el.remove(); });
      document.body.appendChild(el);
    };
    setTimeout(() => { fly(); setInterval(() => { if (!document.hidden) fly(); }, 60000); }, 5000);
  }

  fetch('/api/ad').then((r) => (r.ok ? r.json() : null)).then((j) => {
    const all = (j && Array.isArray(j.live) ? j.live : []).filter((a) => a && /^https:\/\//.test(a.website));
    flyby(all.filter((a) => a.placement === 'plane' || a.placement === 'both').slice(0, 10));
    const ads = all.filter((a) => a.placement !== 'plane').slice(0, 6);
    if (!ads.length) return;
    const n = 3 + ads.length;
    const st = document.createElement('style');
    st.textContent = `.mpe-vid { display: block; margin: 0 12px 10px; }
      .mpe-vid .lp-rth { width: 100%; border-radius: 6px; background: #1f0004; box-shadow: 0 0 0 1px rgba(255,42,60,.35); }
      .mpe-play { position: absolute; left: 50%; top: 50%; width: 34px; height: 24px; margin: -12px 0 0 -17px; border-radius: 7px; background: rgba(176,0,14,.92); }
      .lp-rth:has(.lp-prev.on) .mpe-play { display: none; }
      .mpe-play::after { content: ''; position: absolute; left: 13px; top: 6px; border: 6px solid transparent; border-left: 10px solid #fff; border-right: 0; }
      #lp-rail .lp-tab .lp-mq { height: clamp(24px, calc((100vh - 330px) / ${n} - 40px), 104px); }
      @media (max-width: 560px) { #lp-rail .lp-tab .lp-mq { height: clamp(22px, calc((100vh - 310px) / ${n} - 32px), 96px); } }`;
    document.head.appendChild(st);
    let lastTab = tab0, lastPop = pop0;
    ads.forEach((a, i) => {
      const tab = tab0.cloneNode(true), pop = pop0.cloneNode(true);
      tab.id = `ad-tab-${i + 1}`; pop.id = `ad-pop-${i + 1}`;
      tab.classList.add('lp-paid-tab'); pop.classList.add('lp-paid-pop');
      tab.setAttribute('aria-controls', pop.id); tab.setAttribute('aria-expanded', 'false'); pop.hidden = true;
      fill(tab, pop, a);
      lastTab.after(tab); lastPop.after(pop); lastTab = tab; lastPop = pop;
      wire(tab, pop);
    });
    dispatchEvent(new Event('resize'));
  }).catch(() => {});
})();
