// Shared by every video section: the views/hour badge and the hover preview.
// Hovering a thumbnail with a mouse plays the video muted inside it (YouTube's own
// player); on touch screens a finger on a thumbnail plays it, and a tap on the playing
// preview opens the video. Only one preview plays at a time.
(function () {
  const SEL = '.ytt-cth, .ymu-cth, .ysh-cth, .ci-th, .lp-rth';

  window.lpVph = (views, publishedAt, asOf) => {
    const h = (Date.parse(asOf || Date.now()) - Date.parse(publishedAt)) / 3600000;
    return views == null || !(h > 0) ? null : Math.max(0, Math.round(Number(views) / Math.max(h, 1)));
  };

  // Talks to a YouTube embed (enablejsapi=1): onInfo gets each state update.
  const ytSend = (f, func, args = []) =>
    f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  const ytWatch = (f, onInfo) => {
    let poll = 0, heard = false;
    const onMsg = (e) => {
      if (e.source !== f.contentWindow) return;
      if (!f.isConnected) return stop();
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d && d.info) { heard = true; onInfo(d.info, stop); }
    };
    const stop = () => { clearInterval(poll); removeEventListener('message', onMsg); };
    addEventListener('message', onMsg);
    f.addEventListener('load', () => {
      let n = 0;
      const hello = () => {
        if (!f.isConnected || ++n > 60) return stop();
        if (heard && n > 4) return clearInterval(poll);
        f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      };
      hello(); poll = setInterval(hello, 250);
    }, { once: true });
    return stop;
  };

  // YouTube draws its own play/pause controls for the first ~3.5s of playback.
  const CONTROLS_GONE = 3.7;
  // Returns a function that stops listening (call it when the preview is removed early).
  window.lpWhenPlaying = (f, cb, at = CONTROLS_GONE) =>
    ytWatch(f, (info, stop) => { if (info.currentTime >= at) { stop(); cb(); } });

  const css = document.createElement('style');
  css.textContent = `
.lp-vph { position: absolute; right: 6px; top: 6px; z-index: 2; padding: 3px 5px; border: 1px solid rgba(255,42,60,.6); border-radius: 3px; background: #7f000a; color: #fff; font: 700 10px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-style: normal; letter-spacing: .04em; pointer-events: none; }
.lp-vph-t { display: block; margin-top: 4px; color: var(--red, #b0000e); font: 650 11px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
/* Rendered 4x larger and scaled down, so YouTube's own buttons shrink; 10% overscan hides its title bar and logo. */
.lp-prev { position: absolute; left: -10%; top: -10%; z-index: 1; width: 480%; height: 480%; transform: scale(.25); transform-origin: 0 0; border: 0; background: #000; pointer-events: none; opacity: 0; transition: opacity .25s; }
.lp-prev.on { opacity: 1; }
/* Subtitles need a closer view (bigger text) and the bottom edge uncropped. */
.lp-prev.cc { left: 0; top: -6%; width: 200%; height: 212%; transform: scale(.5); }
/* Soft blur over the centre while YouTube's small start-up controls fade out. */
.lp-veil { position: absolute; left: 32%; top: 28%; z-index: 1; width: 36%; height: 44%; border-radius: 50%; backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); -webkit-mask-image: radial-gradient(closest-side, #000 55%, transparent); mask-image: radial-gradient(closest-side, #000 55%, transparent); pointer-events: none; opacity: 0; transition: opacity .4s; }
.lp-veil.on { opacity: 1; }
.lp-pvc { position: absolute; left: 6px; top: 34px; z-index: 3; display: flex; flex-direction: column; gap: 4px; opacity: 0; transition: opacity .2s; }
.lp-pvc.on { opacity: 1; }
.lp-pvc button { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,.25); border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; cursor: pointer; font: 800 8px/1 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing: .02em; }
.lp-pvc button:hover { background: rgba(0,0,0,.85); }
.lp-pvc button[aria-pressed="true"] { border-color: rgba(255,42,60,.8); background: #b0000e; }
.lp-pvc svg { width: 12px; height: 12px; }
${SEL.split(', ').map((s) => `${s} > b, ${s} > i:not(.lp-vph)`).join(', ')} { z-index: 2; }
.ci-th { overflow: hidden; border-radius: 8px; }
/* Lower-ranked rows: a smaller screen with the same preview. Rank badge shows only where the rank column is hidden. */
.lp-rth { position: relative; flex: none; display: block; width: 144px; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 7px; background: #f2f2f2; }
.lp-rth img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .2s; }
a:hover > .lp-rth img { transform: scale(1.04); }
.lp-rth > b { display: none; position: absolute; left: 5px; top: 5px; padding: 3px 4px; border: 1px solid rgba(255,42,60,.6); border-radius: 3px; background: #7f000a; color: #fff; font: 700 10px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; }
.lp-rth-s { width: 63px; aspect-ratio: 9 / 16; background: #111; }
.lp-rth .lp-pvc { left: auto; right: 5px; top: 5px; }
.lp-rth .lp-pvc button { width: 20px; height: 20px; }
@media (max-width: 560px) { .lp-rth-s { width: 50px; } }`;
  document.head.appendChild(css);

  const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
  // Long enough that sweeping the mouse across thumbnails doesn't load a YouTube player for each one.
  const DELAY = 250;
  const ICON_MUTED = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
  const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  // Remembered while the page is open, so the next preview starts the same way.
  const pref = { sound: false, cc: false };
  let box = null, timer = 0, warmed = false, unwatch = null;
  const idOf = (el) => (el.querySelector('img')?.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//) || [])[1];
  function warm() {
    if (warmed) return;
    warmed = true;
    for (const h of ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://i.ytimg.com', 'https://www.google.com']) {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = h; l.crossOrigin = '';
      document.head.appendChild(l);
    }
  }
  function stop() {
    clearTimeout(timer);
    if (unwatch) { unwatch(); unwatch = null; }
    if (box) box.querySelectorAll('.lp-prev, .lp-veil, .lp-pvc').forEach((n) => n.remove());
    box = null;
  }
  function applySound(f, b) {
    if (pref.sound) { ytSend(f, 'unMute'); ytSend(f, 'setVolume', [100]); } else ytSend(f, 'mute');
    b.innerHTML = pref.sound ? ICON_SOUND : ICON_MUTED;
    b.setAttribute('aria-pressed', String(pref.sound));
    b.title = b.ariaLabel = pref.sound ? 'Mute' : 'Sound on';
  }
  function applyCc(f, b) {
    if (pref.cc) {
      ytSend(f, 'loadModule', ['captions']);
      ytSend(f, 'setOption', ['captions', 'track', { languageCode: (window.LP_I18N && LP_I18N.lang) || 'en' }]);
      ytSend(f, 'setOption', ['captions', 'fontSize', 1]);
    } else ytSend(f, 'unloadModule', ['captions']);
    f.classList.toggle('cc', pref.cc);
    b.setAttribute('aria-pressed', String(pref.cc));
    b.title = b.ariaLabel = pref.cc ? 'Subtitles off' : 'Subtitles on';
  }
  function start(el, delay = DELAY) {
    const id = idOf(el);
    if (!id || el.querySelector('iframe:not(.lp-prev)')) return; // the section's own player is already showing it
    box = el;
    warm();
    timer = setTimeout(() => {
      if (box !== el) return;
      const f = document.createElement('iframe');
      f.className = 'lp-prev';
      f.tabIndex = -1;
      f.setAttribute('aria-hidden', 'true');
      f.allow = 'autoplay; encrypted-media';
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${id}&rel=0&iv_load_policy=3&disablekb=1&cc_load_policy=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
      const veil = document.createElement('span');
      veil.className = 'lp-veil';
      const ctl = document.createElement('span');
      ctl.className = 'lp-pvc';
      ctl.innerHTML = '<button type="button" class="lp-snd"></button><button type="button" class="lp-cc">CC</button>';
      const [snd, cc] = ctl.children;
      ctl.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const b = e.target.closest('button');
        if (b === snd) { pref.sound = !pref.sound; applySound(f, snd); }
        if (b === cc) { pref.cc = !pref.cc; applyCc(f, cc); }
      });
      let shown = false, state = null;
      unwatch = ytWatch(f, (info, done) => {
        if (info.playerState != null) state = info.playerState;
        if (!shown && (info.playerState === 1 || info.currentTime > 0)) {
          shown = true;
          f.classList.add('on'); veil.classList.add('on'); ctl.classList.add('on');
          applySound(f, snd); applyCc(f, cc);
        }
        if (shown && info.currentTime >= CONTROLS_GONE) { veil.classList.remove('on'); done(); }
      });
      el.querySelector('img').after(f, veil, ctl);
      // Phones that block autoplay (e.g. iPhone Low Power Mode): the player loads but stays
      // unstarted (-1) or cued (5), so show YouTube's own player and its play button instead.
      if (!mouse) f.addEventListener('load', () => setTimeout(() => {
        if (!shown && (state === -1 || state === 5) && box === el && f.isConnected) f.classList.add('lp-tap');
      }, 2500), { once: true });
    }, delay);
  }
  if (mouse) {
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest?.(SEL);
      if (el === box) return;
      stop();
      if (el) start(el);
    });
    document.addEventListener('mouseout', (e) => {
      if (box && !box.contains(e.relatedTarget)) stop();
    });
    addEventListener('blur', stop);
    return;
  }
  // Touch screens: putting a finger on a thumbnail plays it muted inside itself, and it keeps
  // playing after the finger lifts until it leaves the screen. A tap on the playing preview
  // opens the video. Moving the finger first (scrolling) plays nothing.
  const HOLD = 120, SLOP = 10;
  const tcss = document.createElement('style');
  tcss.textContent = `${SEL} { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
/* iPhones may not start a video that is invisible, so while loading it sits fully visible behind the thumbnail. */
${SEL.split(', ').map((s) => `${s} > img`).join(', ')} { position: relative; z-index: 1; }
.lp-prev { opacity: 1; z-index: 0; transition: none; }
.lp-prev.on { z-index: 1; }
.lp-prev.lp-tap { z-index: 1; pointer-events: auto; left: 0; top: 0; width: 100%; height: 100%; transform: none; }`;
  document.head.appendChild(tcss);
  let touch = null, holdT = 0, block = null;
  const play = (el) => { if (box !== el) { stop(); start(el, 0); } };
  document.addEventListener('touchstart', (e) => {
    clearTimeout(holdT);
    const el = e.target.closest?.(SEL);
    if (!el || e.touches.length > 1 || e.target.closest('.lp-pvc')) { touch = null; return; }
    const t = e.touches[0];
    const cur = touch = { el, x: t.clientX, y: t.clientY, playing: el === box };
    if (cur.playing) return;
    warm();
    holdT = setTimeout(() => { if (touch === cur) play(el); }, HOLD);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) <= SLOP) return;
    clearTimeout(holdT);
    if (!touch.playing && box === touch.el) stop();
    touch = null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    clearTimeout(holdT);
    const cur = touch;
    touch = null;
    if (!cur || cur.playing) return; // a tap on the playing preview opens the video
    play(cur.el);
    block = { el: cur.el, until: Date.now() + 800 };
    if (e.cancelable) e.preventDefault();
  });
  // Backup for browsers that still send the click after touchend: the first tap only plays.
  document.addEventListener('click', (e) => {
    if (!block || Date.now() > block.until || !block.el.contains(e.target)) return;
    block = null;
    e.preventDefault(); e.stopPropagation();
  }, true);
  document.addEventListener('touchcancel', () => { clearTimeout(holdT); touch = null; });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest?.(SEL)) e.preventDefault(); });
  let raf = 0;
  addEventListener('scroll', () => {
    if (!box || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (!box.isConnected || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) stop();
    });
  }, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();
