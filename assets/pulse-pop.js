// Homepage report tabs: hover (or first tap on phones) opens the report's card, which offers.js fills.
(() => {
  const root = document.querySelector('.lp-free');
  if (!root) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pops = [...root.querySelectorAll('.lp-pp')];
  pops.forEach((w) => wireOpen(w, w.querySelector('.lp-chip')));

  function wireOpen(w, chip) {
    let t = 0;
    const later = (on, ms) => { clearTimeout(t); t = setTimeout(() => setOpen(w, on), ms); };
    const inCard = () => w.contains(document.activeElement) && document.activeElement !== chip;
    chip.setAttribute('aria-expanded', 'false');
    if (fine) {
      w.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') later(true, 120); });
      w.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !inCard()) later(false, 350); });
    }
    w.addEventListener('focusin', (e) => { if (e.target !== chip || chip.matches(':focus-visible')) { clearTimeout(t); setOpen(w, true); } });
    w.addEventListener('focusout', () => setTimeout(() => { if (!w.contains(document.activeElement) && !(fine && w.matches(':hover'))) setOpen(w, false); }, 0));
    chip.addEventListener('click', (e) => { if (!fine && !w.classList.contains('open')) { e.preventDefault(); setOpen(w, true); } });
  }

  function setOpen(w, on) {
    if (on) pops.forEach((x) => x !== w && setOpen(x, false));
    w.classList.toggle('open', on);
    w.querySelector('.lp-chip').setAttribute('aria-expanded', String(on));
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.lp-pp')) pops.forEach((x) => setOpen(x, false)); });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const w = pops.find((x) => x.classList.contains('open')); if (w) { setOpen(w, false); w.querySelector('.lp-chip').focus(); } });
})();
