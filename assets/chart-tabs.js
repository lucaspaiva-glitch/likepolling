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
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tm]');
    if (b) pick(b.dataset.tm);
  });
  const watch = new MutationObserver(sync);
  watch.observe(t, { attributes: true, attributeFilter: ['hidden'] });
  watch.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
