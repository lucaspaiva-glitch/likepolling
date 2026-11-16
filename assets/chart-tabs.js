// Music Index / Trending Index tabs (Music opens first): below 1240px both charts share one spot (CSS in index.html).
(function () {
  'use strict';
  const tabs = document.getElementById('tm-tabs');
  const t = document.getElementById('yt-trending');
  const m = document.getElementById('yt-music');
  if (!tabs || !t || !m) return;
  const wrap = tabs.parentElement;
  const pick = (name) => {
    if (name === 'trending') wrap.dataset.tm = 'trending'; else delete wrap.dataset.tm;
    tabs.querySelectorAll('button[data-tm]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tm === (name === 'trending' ? 'trending' : 'music'))));
  };
  // A chart that hides itself (no data) leaves the other one on its own, without tabs.
  const sync = () => {
    tabs.hidden = t.hidden || m.hidden;
    if (m.hidden && !t.hidden) pick('trending');
    else if (t.hidden) pick('music');
  };
  // Switch on the first touch (pointerdown) instead of waiting for the click, keep the tabs where
  // they are on screen while the chart below changes height, and fade the new chart in.
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let touched = 0;
  const go = (b) => {
    const name = b.dataset.tm === 'trending' ? 'trending' : 'music';
    if (b.getAttribute('aria-selected') === 'true') return;
    const y = tabs.getBoundingClientRect().top;
    pick(name);
    const dy = tabs.getBoundingClientRect().top - y;
    if (dy) scrollBy(0, dy);
    if (!still.matches) (name === 'trending' ? t : m).animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
  };
  tabs.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button[data-tm]');
    if (!b || e.pointerType === 'mouse') return;
    touched = e.timeStamp;
    go(b);
  });
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tm]');
    if (b && e.timeStamp - touched > 800) go(b);
  });
  const watch = new MutationObserver(sync);
  watch.observe(t, { attributes: true, attributeFilter: ['hidden'] });
  watch.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
