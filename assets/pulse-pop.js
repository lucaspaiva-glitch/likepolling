// Homepage pulse and report tabs: hover (or first tap on phones) opens a small card with a live heartbeat,
// one line, a picker and "Download PDF", which opens /pulse?…&pdf=1 in a new tab (it prints itself to PDF).
(() => {
  const root = document.querySelector('.lp-free');
  if (!root) return;
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const INFO = {
    country: ['What a country searches, reads and celebrates today.', 'Pick a country'],
    artist: ['Who looks up a person this week, and where.', 'Pick a person', 'Type a person'],
    company: ['Who looks up a company or brand this week, and where.', 'Pick a company or brand', 'Type a company or brand'],
  };
  const BEAT = 'M0 30 H34 l5 -4 l5 4 H54 l4 6 l6 -30 l6 36 l5 -12 H92 l7 -6 l7 6 H154 l5 -4 l5 4 H174 l4 6 l6 -30 l6 36 l5 -12 H212 l7 -6 l7 6 H260';
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const loc = () => (window.LP_I18N ? window.LP_I18N.locale() : 'en');
  const cname = (c) => { try { return new Intl.DisplayNames([loc()], { type: 'region' }).of(c) || c; } catch { return c; } };
  const region = ((navigator.language || '').split('-')[1] || '').toUpperCase();
  let home = COUNTRIES.includes(region) ? region : 'US';
  const pops = [...root.querySelectorAll('.lp-pp')];

  pops.forEach((w, k) => {
    const chip = w.querySelector('.lp-chip');
    wireOpen(w, chip);
    const m = w.dataset.pp;
    if (!m) return; // report tabs: offers.js fills their card
    const [sub, lab, ph] = INFO[m];
    const card = document.createElement('div');
    card.className = 'lp-pp-card lp-pp-free';
    card.id = `lp-pp-${m}`;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', chip.querySelector('span').textContent.trim());
    card.innerHTML = `<div class="lp-pp-top"><span class="svc-sym">Free</span><span>Updated daily</span></div>
      <div class="lp-pp-beat" aria-hidden="true" style="--d:${[1.6, 1.15, 2][k] || 1.6}s"><svg viewBox="0 0 260 44" preserveAspectRatio="none"><path class="g" d="${BEAT}"/><path class="l" pathLength="100" d="${BEAT}"/></svg><b data-no-i18n>LIVE</b></div>
      <span class="lp-pp-name">${chip.querySelector('span').textContent.trim()}</span>
      <p class="lp-pp-sub">${sub}</p>
      <label class="lp-pp-lab" for="lp-pp-${m}-in">${lab}</label>
      ${m === 'country' ? `<select id="lp-pp-${m}-in" data-no-i18n></select>` : `<input id="lp-pp-${m}-in" placeholder="${ph}" spellcheck="false">`}
      <a class="svc-btn lp-pp-dl" target="_blank" rel="noopener"><span>Download PDF</span>&nbsp;<i aria-hidden="true">↗</i></a>
      <a class="svc-link lp-pp-open"><span>Open the page</span> <i aria-hidden="true">›</i></a>`;
    w.append(card);
    chip.setAttribute('aria-controls', card.id);
    const field = card.querySelector('select, input'), dl = card.querySelector('.lp-pp-dl'), open = card.querySelector('.lp-pp-open');
    const fill = () => { field.innerHTML = COUNTRIES.map((c) => ({ c, n: cname(c) })).sort((a, b) => a.n.localeCompare(b.n, loc())).map(({ c, n }) => `<option value="${c}"${c === home ? ' selected' : ''}>${n}</option>`).join(''); };
    const url = () => {
      const v = field.value.trim();
      return m === 'country' ? `/pulse?c=${v}` : `/pulse?${m}=${encodeURIComponent(v)}`;
    };
    const sync = () => { const u = url(); open.href = u; dl.href = `${u}&pdf=1`; field.classList.remove('need'); };
    if (m === 'country') { fill(); document.addEventListener('lp:lang', () => { const v = field.value; fill(); field.value = v; }); }
    else if (window.LPSuggest) window.LPSuggest(field, { type: () => m, onPick: sync });
    field.addEventListener('input', sync);
    field.addEventListener('change', () => { if (m === 'country') home = field.value; sync(); });
    sync();
    dl.addEventListener('click', (e) => { if (!field.value.trim()) { e.preventDefault(); field.classList.add('need'); field.focus(); } });
    if (m !== 'country') field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && field.getAttribute('aria-expanded') !== 'true' && field.value.trim()) { e.preventDefault(); dl.click(); } });

  });

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
    if (on && w.dataset.pp === 'country') { const s = w.querySelector('select'); if (s.value !== home) { s.value = home; s.dispatchEvent(new Event('input')); } }
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.lp-pp')) pops.forEach((x) => setOpen(x, false)); });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const w = pops.find((x) => x.classList.contains('open')); if (w) { setOpen(w, false); w.querySelector('.lp-chip').focus(); } });
})();
