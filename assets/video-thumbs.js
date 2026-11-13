// Shared by every video section: the views/hour badge and the hover preview.
// Hovering a thumbnail with a mouse plays the video muted inside it (YouTube's own
// player); on touch screens the thumbnail on the middle line of the screen plays while
// scrolling, and a tap opens the video. Only one preview plays at a time.
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
.lp-rth .lp-pvc { left: 5px; top: 27px; }
.lp-rth .lp-pvc button { width: 20px; height: 20px; }
@media (max-width: 560px) { .lp-rth-s { width: 50px; } }
/* Desktop: the video playing with sound, while it's scrolled out of view. */
.lp-np { position: fixed; left: 44px; bottom: 16px; z-index: 58; display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 5px; border: 1px solid rgba(255,42,60,.45); border-radius: 9px; background: rgba(20,0,4,.92); box-shadow: 0 8px 24px -8px rgba(60,0,6,.5); opacity: 0; transform: translateY(8px); visibility: hidden; transition: opacity .2s, transform .2s, visibility 0s .2s; }
.lp-np.on { opacity: 1; transform: none; visibility: visible; transition: opacity .2s, transform .2s; }
.lp-np img { display: block; width: 72px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 5px; cursor: pointer; }
.lp-np i { display: flex; align-items: flex-end; gap: 2px; height: 12px; }
.lp-np i b { width: 3px; height: 100%; border-radius: 1px; background: #ff2a3c; transform-origin: bottom; animation: lp-eq .9s ease-in-out infinite alternate; }
.lp-np i b:nth-child(2) { animation-delay: -.3s; } .lp-np i b:nth-child(3) { animation-delay: -.6s; }
@keyframes lp-eq { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .lp-np i b { animation: none; } }
.lp-np button { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 1px solid rgba(255,42,60,.8); border-radius: 50%; background: #b0000e; color: #fff; cursor: pointer; }
.lp-np button:hover { background: #7f000a; }
.lp-np svg { width: 13px; height: 13px; }`;
  document.head.appendChild(css);

  const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
  // Long enough that sweeping the mouse across thumbnails doesn't load a YouTube player for each one.
  const DELAY = 250;
  const ICON_MUTED = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
  const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  // Remembered while the page is open, so the next preview starts the same way.
  const pref = { sound: false, cc: false };
  let box = null, timer = 0, warmed = false, unwatch = null, dog = 0, carried = null;
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
    clearInterval(dog);
    if (unwatch) { unwatch(); unwatch = null; }
    if (box) box.querySelectorAll('.lp-prev, .lp-veil, .lp-pvc').forEach((n) => n.remove());
    box = null;
    carried = null;
    if (np) np.classList.remove('on');
  }
  let np = null;
  function paintSound(b, on) {
    if (b.getAttribute('aria-pressed') === String(on)) return;
    b.innerHTML = on ? ICON_SOUND : ICON_MUTED;
    b.setAttribute('aria-pressed', String(on));
    b.title = b.ariaLabel = on ? 'Mute' : 'Sound on';
  }
  function applySound(f, b) {
    if (pref.sound) { ytSend(f, 'unMute'); ytSend(f, 'setVolume', [100]); } else ytSend(f, 'mute');
    paintSound(b, pref.sound);
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
  function start(el, wait = DELAY) {
    const id = idOf(el);
    if (!id) return;
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
        if (b === snd) { pref.sound = snd.getAttribute('aria-pressed') !== 'true'; applySound(f, snd); }
        if (b === cc) { pref.cc = !pref.cc; applyCc(f, cc); }
      });
      // With sound on, the preview stays hidden until the unmuted video is really playing. A browser
      // that refuses sound without a tap (phones, mostly) pauses the video instead: it then restarts
      // muted, and the sound button shows off until the visitor taps it.
      let shown = false, tried = 0, blocked = false, ended = false, ps = -1, muted = true, dur = 0, lastT = -1, lastAt = Date.now(), kicks = 0;
      const show = () => { shown = true; f.classList.add('on'); veil.classList.add('on'); ctl.classList.add('on'); };
      // Desktop: a preview that stops moving (YouTube paused it, often when refusing the sound) is
      // restarted, then restarted muted; if it's still stuck it's removed so no frozen frame stays up.
      if (mouse) dog = setInterval(() => {
        if (!f.isConnected || !el.getClientRects().length) { if (box === el) stop(); return; } // removed, or hidden (sponsor card closed)
        if (document.hidden || !shown || Date.now() - lastAt < 2500) { if (document.hidden) lastAt = Date.now(); return; }
        lastAt = Date.now();
        if (++kicks === 1) ytSend(f, 'playVideo');
        else if (kicks === 2 && np?.classList.contains('on')) stop();
        else if (kicks === 2) { ytSend(f, 'mute'); ytSend(f, 'playVideo'); paintSound(snd, false); }
        else if (box === el) stop();
      }, 1000);
      unwatch = ytWatch(f, (info, done) => {
        if (typeof info.duration === 'number' && info.duration > 0) dur = info.duration;
        // Desktop, sound on: when the video ends the next one in the section plays, in ranking order.
        if (mouse && !ended && box === el && pref.sound && muted === false && shown &&
            (info.playerState === 0 || (dur && lastT > dur - 1.5 && info.currentTime < 1))) {
          const nx = nextOf(el);
          if (nx) { ended = true; return next(nx); }
        }
        if (typeof info.currentTime === 'number' && info.currentTime !== lastT) { lastT = info.currentTime; lastAt = Date.now(); kicks = 0; }
        // YouTube sends only what changed, so the latest state and mute are kept here.
        if (typeof info.playerState === 'number') ps = info.playerState;
        if (typeof info.muted === 'boolean') { muted = info.muted; paintSound(snd, !muted); }
        if (!tried && (ps === 1 || info.currentTime > 0)) {
          tried = Date.now();
          applyCc(f, cc);
          if (pref.sound) applySound(f, snd); else { paintSound(snd, false); show(); }
        }
        if (tried && info.playerState === 2 && !blocked && box === el && np?.classList.contains('on')) return stop(); // refused sound while out of view
        if (tried && info.playerState === 2 && !blocked) { blocked = true; ytSend(f, 'mute'); ytSend(f, 'playVideo'); paintSound(snd, false); }
        if (tried && !shown && ps === 1 && (blocked || muted === false || Date.now() - tried > 900)) show();
        if (shown && info.currentTime >= CONTROLS_GONE) { veil.classList.remove('on'); if (!mouse) done(); }
      });
      el.querySelector('img').after(f, veil, ctl);
    }, wait);
  }
  // The thumbnail after el in its section (wrapping to the first), skipping hidden ones.
  function nextOf(el) {
    const sec = el.closest('section');
    if (!sec) return null;
    const list = [...sec.querySelectorAll(SEL)].filter((x) => x.getClientRects().length && idOf(x));
    const i = list.indexOf(el);
    return i >= 0 && list.length > 1 ? list[(i + 1) % list.length] : null;
  }
  // Hands the sound to el; it counts as playing with sound until its own button shows it.
  let watch = () => {};
  function next(el) { stop(); carried = el; start(el, 0); watch(el); }
  if (mouse) {
    // With the sound on, the preview keeps playing after the mouse leaves it and while the page
    // scrolls; once it's out of view a small bar shows it, to jump back to it or mute it. It stops
    // when another thumbnail is hovered (that one takes over with sound), when muted, or when it's
    // hidden (e.g. the sponsor card closed).
    const loud = () => box?.isConnected && (box.querySelector('.lp-snd[aria-pressed="true"]') || (box === carried && pref.sound));
    let swap = 0, swapEl = null, mx = -1, my = -1;
    const cancelSwap = () => { clearTimeout(swap); swapEl = null; };
    document.addEventListener('mouseover', (e) => {
      if (loud()) return;
      cancelSwap();
      const el = e.target.closest?.(SEL);
      if (el === box) return;
      stop();
      if (el) { start(el); watch(el); }
    });
    // Only a real mouse move hands the sound to another video: content scrolling under a
    // resting mouse doesn't.
    document.addEventListener('mousemove', (e) => {
      const moved = e.clientX !== mx || e.clientY !== my;
      mx = e.clientX; my = e.clientY;
      if (!moved || !loud()) return;
      const el = e.target.closest?.(SEL);
      if (el === swapEl) return;
      cancelSwap();
      if (!el || el === box || el.closest('.lp-np')) return;
      swapEl = el;
      swap = setTimeout(() => { swapEl = null; next(el); }, DELAY);
    }, { passive: true });
    document.addEventListener('mouseout', (e) => {
      if (!box || box.contains(e.relatedTarget)) return;
      if (!loud()) stop();
    });
    function bar() {
      if (np) return np;
      np = document.createElement('div');
      np.className = 'lp-np';
      np.innerHTML = `<img alt=""><i aria-hidden="true"><b></b><b></b><b></b></i><button type="button" class="lp-np-snd" aria-pressed="true">${ICON_SOUND}</button>`;
      np.querySelector('img').title = 'Back to the video';
      np.querySelector('button').title = 'Mute';
      np.querySelector('button').ariaLabel = 'Mute';
      np.addEventListener('click', (e) => {
        if (!box) return;
        if (e.target.closest('button')) {
          const f = box.querySelector('.lp-prev');
          pref.sound = false;
          if (f) ytSend(f, 'mute');
          stop();
        } else box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      document.body.appendChild(np);
      return np;
    }
    const seenIo = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.target !== box) continue;
        if (e.isIntersecting) { np?.classList.remove('on'); continue; }
        if (!loud() || !box.getClientRects().length) { stop(); continue; }
        const b = bar();
        b.querySelector('img').src = box.querySelector('img')?.src || '';
        b.classList.add('on');
      }
    });
    watch = (el) => { seenIo.disconnect(); seenIo.observe(el); };
    addEventListener('blur', () => { if (!loud()) stop(); });
    return;
  }
  // Touch screens: while scrolling, the thumbnail on (or nearest) the middle line of the screen
  // plays muted inside itself; it stops the moment another one becomes nearer that line, so the
  // switch happens at one clear point. A tap still opens the video. Skipped with reduced motion
  // or Data Saver.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData || !('IntersectionObserver' in window)) return;
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target);
    check();
  });
  const known = new WeakSet();
  const scan = () => document.querySelectorAll(SEL).forEach((el) => { if (!known.has(el)) { known.add(el); io.observe(el); } });
  let scanT = 0;
  new MutationObserver(() => { clearTimeout(scanT); scanT = setTimeout(scan, 200); }).observe(document.body, { childList: true, subtree: true });
  scan();
  function pick() {
    if (document.hidden) return stop();
    const mid = innerHeight / 2;
    let best = null, bestD = Infinity;
    for (const el of seen) {
      if (!el.isConnected) { seen.delete(el); continue; }
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) continue;
      if (el.querySelector('iframe:not(.lp-prev)')) continue; // the section's own player is already showing it
      const d = r.top > mid ? r.top - mid : r.bottom < mid ? mid - r.bottom : 0;
      if (d < bestD) { best = el; bestD = d; }
    }
    if (best === box) return;
    stop();
    if (best) start(best); // starts after DELAY, so videos flicked past quickly never load
  }
  let raf = 0;
  function check() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); }
  addEventListener('scroll', check, { passive: true, capture: true });
  addEventListener('resize', check, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else check(); });
})();
