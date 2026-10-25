// Shared by every video section: the views/hour badge and the hover preview.
// Hovering a thumbnail with a mouse plays the video muted inside it (YouTube's own
// player); touch screens keep tap-to-open. Only one preview plays at a time.
(function () {
  const SEL = '.ytt-cth, .ymu-cth, .ysh-cth, .ci-th';

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
  };

  // YouTube draws its own play/pause controls for the first ~3.5s of playback.
  const CONTROLS_GONE = 3.7;
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
.ci-th { overflow: hidden; border-radius: 8px; }`;
  document.head.appendChild(css);

  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const DELAY = 120;
  const ICON_MUTED = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
  const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  // Remembered while the page is open, so the next preview starts the same way.
  const pref = { sound: false, cc: false };
  let box = null, timer = 0, warmed = false;
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
  function start(el) {
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
        if (b === snd) { pref.sound = !pref.sound; applySound(f, snd); }
        if (b === cc) { pref.cc = !pref.cc; applyCc(f, cc); }
      });
      let shown = false;
      ytWatch(f, (info, done) => {
        if (!shown && (info.playerState === 1 || info.currentTime > 0)) {
          shown = true;
          f.classList.add('on'); veil.classList.add('on'); ctl.classList.add('on');
          applySound(f, snd); applyCc(f, cc);
        }
        if (shown && info.currentTime >= CONTROLS_GONE) { veil.classList.remove('on'); done(); }
      });
      el.querySelector('img').after(f, veil, ctl);
    }, DELAY);
  }
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
})();
