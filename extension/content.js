// Creators + on YouTube: finds the channel of the current channel/video/Shorts page locally,
// shows the floating pill (left-middle by default) and the dashboard in a Shadow DOM.
// Only the channel ID/handle leaves the page (to the Like Polling API via background.js).
(function () {
  'use strict';
  if (window.top !== window || document.getElementById('creators-plus-root')) return;
  const CP = globalThis.CP;
  const lang = CP.detectLang(navigator.languages || navigator.language);
  const t = CP.translator(lang);
  const f = CP.formatter(lang);
  const request = (path, opt = {}) => chrome.runtime.sendMessage({ type: 'api', path, refresh: !!opt.refresh });

  for (const [family, file, weight] of [['CP Inter', 'inter-var-latin.woff2', '100 900'], ['CP Chakra', 'chakra-petch-bold-latin.woff2', '700']]) {
    const face = new FontFace(family, `url(${chrome.runtime.getURL('fonts/' + file)})`, { weight, display: 'swap' });
    face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
  }

  const host = document.createElement('div');
  host.id = 'creators-plus-root';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;left:0;top:0;width:0;height:0;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<link rel="stylesheet" href="${chrome.runtime.getURL('lib/dashboard.css')}"><div class="wrap" style="position:fixed;display:none"></div>`;
  const wrap = shadow.querySelector('.wrap');
  document.documentElement.appendChild(host);

  let settings = { country: CP.HOME_COUNTRY[lang] || 'US', showPill: true, pos: null };
  let state = 'hidden';   // hidden | pill | panel | full | closed
  let ref = null, closedKey = null, summary = null;

  const pill = document.createElement('div');
  const panel = document.createElement('div');
  wrap.append(pill, panel);

  const dash = CP.Dashboard(panel, {
    mode: 'hud', lang, country: settings.country, request,
    onChannel: (ch) => { summary = ch; drawPill(); },
    onAction: (act, value) => {
      if (act === 'min') setState('pill');
      else if (act === 'close') { closedKey = CP.refKey(ref); setState('closed'); }
      else if (act === 'full') setState('full');
      else if (act === 'panel') setState('panel');
      else if (act === 'country') { settings.country = value; chrome.storage.local.set({ country: value }); }
    },
  });

  function drawPill() {
    const b = summary?.body;
    const name = b?.channel.handle || (ref ? (ref.handle ? '@' + ref.handle : 'YouTube') : '');
    const stat = b?.metrics ? `<b>${f.num(b.metrics.views_30d)}</b><span>${t('views')} / 30d</span>` : `<span>${t('channel_hint')}</span>`;
    pill.innerHTML = `<div class="cp-pill" role="button" tabindex="0" aria-label="Creators +: ${CP.LOGO ? '' : ''}${name}">${CP.LOGO}<span style="color:#0d0d0d;font-weight:700">${name.replace(/[<>&]/g, '')}</span>${stat}</div>`;
  }

  function place() {
    const el = state === 'pill' ? pill.firstElementChild : panel.firstElementChild;
    if (state === 'full') { Object.assign(wrap.style, { left: '24px', top: '24px', width: 'calc(100vw - 48px)', height: 'calc(100vh - 48px)' }); return; }
    Object.assign(wrap.style, { width: 'auto', height: 'auto' });
    const w = el?.offsetWidth || 360, h = el?.offsetHeight || 40;
    const p = settings.pos || { x: 16, y: Math.round(innerHeight / 2 - h / 2) };
    wrap.style.left = Math.max(8, Math.min(p.x, innerWidth - w - 8)) + 'px';
    wrap.style.top = Math.max(8, Math.min(p.y, innerHeight - h - 8)) + 'px';
  }

  function setState(next) {
    state = next;
    const visible = ['pill', 'panel', 'full'].includes(state);
    wrap.style.display = visible ? 'block' : 'none';
    pill.style.display = state === 'pill' ? 'block' : 'none';
    panel.style.display = state === 'panel' || state === 'full' ? 'block' : 'none';
    if (state === 'panel' || state === 'full') {
      dash.setFull(state === 'full');
      dash.activate(true);
      if (state === 'panel' && panel.firstElementChild) panel.firstElementChild.style.height = '';
    } else dash.activate(false);
    requestAnimationFrame(place);
  }

  // Drag by the pill or the panel header; a press without movement on the pill opens the panel.
  function startDrag(e) {
    if (e.button !== 0 || state === 'full') return;
    const onPill = !!e.target.closest('.cp-pill');
    const onBar = e.target.closest('[data-drag]') && !e.target.closest('button');
    if (!onPill && !onBar) return;
    const sx = e.clientX, sy = e.clientY, ox = parseFloat(wrap.style.left), oy = parseFloat(wrap.style.top);
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      settings.pos = { x: Math.round(ox + ev.clientX - sx), y: Math.round(oy + ev.clientY - sy) };
      place();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      if (moved) { settings.pos = { x: parseFloat(wrap.style.left), y: parseFloat(wrap.style.top) }; chrome.storage.local.set({ pos: settings.pos }); }
      else if (onPill) setState('panel');
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    e.preventDefault();
  }
  wrap.addEventListener('pointerdown', startDrag);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('.cp-pill')) setState('panel');
    if (e.key === 'Escape' && state === 'full') setState('panel');
  });
  addEventListener('resize', () => state !== 'hidden' && place());

  // ---------- channel detection (local, structured page data only) ----------
  function detect() {
    const kind = CP.pageKind(location.href);
    if (kind.type === 'channel') return kind.ref;
    if (kind.type === 'watch') {
      const flexy = document.querySelector('ytd-watch-flexy');
      if (!flexy || flexy.getAttribute('video-id') !== kind.videoId) return null;
      const a = document.querySelector('ytd-watch-metadata ytd-video-owner-renderer a[href], #owner ytd-video-owner-renderer a[href]');
      return CP.channelRefFromHref(a?.getAttribute('href'));
    }
    if (kind.type === 'shorts') {
      const reel = document.querySelector('ytd-reel-video-renderer[is-active]') || document;
      const a = reel.querySelector('a[href^="/@"], a[href^="/channel/UC"]');
      return CP.channelRefFromHref(a?.getAttribute('href'));
    }
    if (kind.type === 'legacy-channel') {
      const canon = document.querySelector('link[rel="canonical"]')?.href || '';
      return /\/(c|user)\//.test(location.pathname) && canon ? CP.channelRefFromHref(canon) : null;
    }
    return null;
  }

  let lastHref = '', timer = null;
  function onNavigate() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    clearInterval(timer);
    const kind = CP.pageKind(location.href).type;
    if (kind === 'other') return show(null);
    let tries = 0;
    timer = setInterval(() => {
      const found = detect();
      if (found || ++tries > 30) { clearInterval(timer); show(found); }
    }, 250);
  }

  function show(next) {
    ref = next;
    dash.setChannel(next);
    if (!next) { if (state === 'pill') setState('hidden'); return; }
    summary = null;
    drawPill();
    if (state === 'panel' || state === 'full') return;
    if (closedKey === CP.refKey(next)) return setState('closed');
    closedKey = null;
    setState(settings.showPill ? 'pill' : 'hidden');
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'getChannel') reply({ ref });
    if (msg?.type === 'showPanel' && ref) { closedKey = null; setState('panel'); reply({ ok: true }); }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.showPill) { settings.showPill = changes.showPill.newValue !== false; if (!settings.showPill && state === 'pill') setState('hidden'); else if (settings.showPill && ref && state === 'hidden') setState('pill'); }
  });

  chrome.storage.local.get(['country', 'showPill', 'pos']).then((s) => {
    settings = { ...settings, ...s, showPill: s.showPill !== false };
    if (s.country) dash.state.country = s.country;
    document.addEventListener('yt-navigate-finish', onNavigate);
    addEventListener('popstate', onNavigate);
    setInterval(onNavigate, 1000);
    onNavigate();
  });
})();
