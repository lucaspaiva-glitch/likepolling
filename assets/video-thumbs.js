// Shared by every video section: the views/hour badge and the hover preview.
// Hovering a thumbnail with a mouse plays the video muted inside it (YouTube's own
// player); touch screens keep tap-to-open. Only one preview plays at a time.
(function () {
  const SEL = '.ytt-cth, .ymu-cth, .ysh-cth, .ci-th';
  const DELAY = 350;

  window.lpVph = (views, publishedAt, asOf) => {
    const h = (Date.parse(asOf || Date.now()) - Date.parse(publishedAt)) / 3600000;
    return views == null || !(h > 0) ? null : Math.max(0, Math.round(Number(views) / Math.max(h, 1)));
  };

  // Calls back once a YouTube embed (enablejsapi=1) is really playing, so the
  // thumbnail stays up and YouTube's big play button is never seen.
  window.lpWhenPlaying = (f, cb) => {
    let done = false, poll = 0;
    const onMsg = (e) => {
      if (e.source !== f.contentWindow) return;
      let d; try { d = JSON.parse(e.data); } catch { return; }
      const info = d && d.info;
      if (info && (info.playerState === 1 || info.currentTime > 0.2)) finish(true);
    };
    const finish = (ok) => {
      if (done) return;
      done = true; clearInterval(poll); removeEventListener('message', onMsg);
      if (ok && f.isConnected) cb();
    };
    addEventListener('message', onMsg);
    f.addEventListener('load', () => {
      let n = 0;
      const hello = () => { if (!f.isConnected || ++n > 40) return finish(false); f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); };
      hello(); poll = setInterval(hello, 250);
    }, { once: true });
  };

  const css = document.createElement('style');
  css.textContent = `
.lp-vph { position: absolute; right: 6px; top: 6px; z-index: 2; padding: 3px 5px; border: 1px solid rgba(255,42,60,.6); border-radius: 3px; background: #7f000a; color: #fff; font: 700 10px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-style: normal; letter-spacing: .04em; pointer-events: none; }
.lp-vph-t { display: block; margin-top: 4px; color: var(--red, #b0000e); font: 650 11px/1 ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.lp-prev { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; border: 0; border-radius: 8px; background: #000; pointer-events: none; opacity: 0; transition: opacity .25s; }
.lp-prev.on { opacity: 1; }
${SEL.split(', ').map((s) => `${s} > b, ${s} > i:not(.lp-vph)`).join(', ')} { z-index: 2; }`;
  document.head.appendChild(css);

  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let box = null, timer = 0;
  const idOf = (el) => (el.querySelector('img')?.src.match(/\/vi\/([A-Za-z0-9_-]{11})\//) || [])[1];
  function stop() {
    clearTimeout(timer);
    if (box) box.querySelector('.lp-prev')?.remove();
    box = null;
  }
  function start(el) {
    const id = idOf(el);
    if (!id) return;
    box = el;
    timer = setTimeout(() => {
      if (box !== el) return;
      const f = document.createElement('iframe');
      f.className = 'lp-prev';
      f.tabIndex = -1;
      f.setAttribute('aria-hidden', 'true');
      f.allow = 'autoplay; encrypted-media';
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${id}&rel=0&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
      lpWhenPlaying(f, () => f.classList.add('on'));
      el.querySelector('img').after(f);
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
