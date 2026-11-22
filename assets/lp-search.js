// Homepage search bar (Google suggestions) and the search pages at /s/<sample> or /s?q=<name>.
// Samples are fully unlocked: their full history is the existing report (report.html?embed=1 in an iframe).
(() => {
  const SAMPLES = {
    shakira: { name: 'Shakira', cat: 'person' },
    zara: { name: 'Zara', cat: 'brand' },
    brazil: { name: 'Brazil', cat: 'country' },
    benfica: { name: 'Benfica', cat: 'sport' },
    'lula-vs-bolsonaro': { name: 'Lula vs Bolsonaro', cat: 'topic' },
  };
  const CATS = {
    person: { label: 'Person', color: '#b0000e', buy: 'https://lucaspoll.gumroad.com/l/ijixxs' },
    brand: { label: 'Brand', color: '#141414', buy: 'https://lucaspoll.gumroad.com/l/linzh' },
    country: { label: 'Country', color: '#009c3b', buy: 'https://lucaspoll.gumroad.com/l/udjsyu' },
    sport: { label: 'Sport', color: '#0a7a3d', buy: '' },
    topic: { label: 'Topic', color: '#3a4a66', buy: '' },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : num(n));
  const delta = (p, what) => (p == null ? '' : `<em class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% ${what}</em>`);
  const plain = (t) => String(t || '').replace(/ \([^)]*\)$/, '');
  const slugOf = (q) => {
    const t = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\blula\b|bolsonaro/.test(t)) return 'lula-vs-bolsonaro';
    if (/^shakira\b/.test(t)) return 'shakira';
    if (/^zara\b/.test(t)) return 'zara';
    if (/^(brazil|brasil)$/.test(t)) return 'brazil';
    if (/benfica/.test(t)) return 'benfica';
    return '';
  };
  const go = (q) => { q = String(q || '').trim(); if (!q) return; const s = slugOf(q); location.href = s ? `/s/${s}` : `/s?find=${encodeURIComponent(q)}`; };

  const form = document.querySelector('.lps-sform');
  const input = document.getElementById('lps-q');
  if (form && input) {
    form.addEventListener('submit', (e) => { e.preventDefault(); go(input.value); });
    if (window.LPSuggest) window.LPSuggest(input, { onPick: (it) => go(it.title) });
  }
  const box = document.getElementById('lps');
  if (box && input) {
    const open = () => box.classList.add('open');
    input.addEventListener('focus', open);
    box.addEventListener('pointerdown', open);
    if (document.documentElement.classList.contains('lp-subj')) open();
  }

  const page = document.getElementById('lps-page');
  if (!page || !document.documentElement.classList.contains('lp-subj')) return;
  const slug = location.pathname.replace(/^\/s\/?/, '').replace(/\/$/, '');
  const q = new URLSearchParams(location.search).get('find') || '';
  if (!slug && !q) { location.replace('/'); return; }
  const sample = SAMPLES[slug];
  if (slug && !sample) { location.replace(`/s?find=${encodeURIComponent(slug.replace(/-/g, ' '))}`); return; }
  if (input) input.value = sample ? sample.name : q;
  page.hidden = false;
  const STEPS = ['Finding {n}', 'Checking Google searches', 'Reading the news', 'Fetching official numbers', 'Building the page'];
  const wait = (what) => `<section class="lps-card lps-search lps-load" aria-live="polite"><div class="lps-term" aria-hidden="true"><i></i><i></i><i></i><span>bots — build</span></div><div class="lps-wait"><b>Bots are building <span data-no-i18n>${esc(what)}</span>’s page</b>
    <div class="lps-bar" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><i></i></div><ol class="lps-steps">${STEPS.map((t, i) => `<li data-i="${i}">${esc(t.replace('{n}', what))}</li>`).join('')}</ol></div>
    <div class="lps-track" aria-hidden="true">${document.querySelector('.lps-track') ? document.querySelector('.lps-track').innerHTML : ''}</div></section>`;
  let loadTimer = 0;
  const loading = (what, secs) => {
    page.innerHTML = wait(what);
    const bar = page.querySelector('.lps-bar'), fill = bar.firstElementChild, steps = [...page.querySelectorAll('.lps-steps li')];
    const t0 = Date.now();
    clearInterval(loadTimer);
    loadTimer = setInterval(() => {
      const p = Math.min(92, 100 * (1 - Math.exp(-(Date.now() - t0) / (secs * 450))));
      fill.style.width = `${p}%`; bar.setAttribute('aria-valuenow', String(Math.round(p)));
      const k = Math.min(steps.length - 1, Math.floor((p / 92) * steps.length));
      steps.forEach((li, i) => li.classList.toggle('done', i < k) || li.classList.toggle('now', i === k));
      steps.forEach((li, i) => li.classList.toggle('now', i === k));
    }, 120);
  };
  const loaded = () => clearInterval(loadTimer);
  loading(sample ? sample.name : q, sample ? 20 : 5);
  document.title = `${sample ? sample.name : q} · Like Polling`;
  const fail = (msg) => { loaded(); page.innerHTML = `<section class="lps-card"><p class="lps-err">${esc(msg)}</p><p class="lps-sub">Try one of the free samples above.</p></section>`; };
  const tags = (cat, free) => `<div class="lps-tags"><span class="lps-tag">${CATS[cat].label}</span>${free ? '<span class="lps-tag free">Free sample · full history unlocked</span>' : ''}</div>`;
  const stat = (big, label, extra = '', txt = false) => `<div class="lps-stat"><b class="${txt ? 'txt' : ''}" data-no-i18n>${big}</b><span>${label}</span>${extra}</div>`;

  function profile(data, cat) {
    if (!data.subject) {
      const c = data.countries[0];
      const search = c.searches && c.searches.top && c.searches.top[0], video = c.youtube && c.youtube[0];
      return [`<div class="lps-prof"><img class="lps-av flag" src="/assets/flags/${c.country.toLowerCase()}.svg" alt=""><div class="lps-who">${tags(cat, true)}<h1 data-no-i18n>Brazil</h1><p>What Brazil searches, watches and is in the news for.</p></div></div>`, `<h2>What Brazil searches and watches</h2>
        <div class="lps-stats">${stat(short(c.news_focus ? c.news_focus.articles : 0), 'News stories about Brazil, 30 days')}
        ${search ? stat(esc(search.query), 'Top Google search', '', true) : ''}${video ? stat(esc(video.title), `Top YouTube video · ${short(video.views)} views`, '', true) : ''}</div>`];
    }
    const s = data.subject;
    if (slug === 'lula-vs-bolsonaro' && data.peers && data.peers[0] && (s.share_pct != null || data.peers[0].share_pct != null)) {
      const side = (p) => `<div>${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}<h3 data-no-i18n>${esc(plain(p.title))}</h3><b data-no-i18n>${p.share_pct == null ? '–' : `${p.share_pct}%`}</b><span>of the Google searches for the two, last 4 weeks</span>${p.change_pct != null ? `<b data-no-i18n>${signed(p.change_pct)}</b><span>vs the 4 weeks before</span>` : ''}</div>`;
      return [`<div class="lps-who">${tags(cat, true)}<h1 data-no-i18n>Lula vs Bolsonaro</h1><p>Brazil’s two biggest political names, side by side.</p></div>`, `<h2>Who is searched more?</h2><p class="lps-sub">Google searches worldwide (Google Trends).</p><div class="lps-vs">${side(s)}${side(data.peers[0])}</div>`];
    }
    const name = sample.name;
    return [`<div class="lps-prof">${s.image ? `<img class="lps-av" src="${esc(s.image)}" alt="">` : ''}<div class="lps-who">${tags(cat, true)}<h1 data-no-i18n>${esc(name)}</h1><p>${esc(s.description)}</p></div></div>`,
      /<b/.test(searchStats(s, data.world)) ? `<h2>Is <span data-no-i18n>${esc(name)}</span> searched more?</h2>${searchStats(s, data.world)}` : ''];
  }

  async function openSample() {
    try {
      const res = await fetch(`/api/report?page=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Couldn’t load this page.');
      loaded();
      const cat = sample.cat;
      const who = sample.name;
      const [head, attn] = profile(data, cat);
      page.innerHTML = `<section class="lps-card" style="--cat:${CATS[cat].color}">${head}</section>${statsHtml(data.key_stats, CATS[cat], slug === 'lula-vs-bolsonaro' ? 'Lula vs Bolsonaro' : who)}${attn ? `<section class="lps-card lps-attn" style="--cat:${CATS[cat].color}">${attn}</section>` : ''}
        <section class="lps-card" id="lps-hist" style="--cat:${CATS[cat].color}"><h2>Full history</h2><p class="lps-sub">Graphs since 2017, saved snapshots and every number, ready to download. Unlocked in this free sample.</p>
        <div class="lps-acts lps-dl"><button type="button" data-act="pdf"><b>↓ Graphs</b><small>PDF</small></button><button type="button" data-act="pptx"><b>↓ Presentation</b><small>PowerPoint · Keynote · Google Slides</small></button><button type="button" data-act="xlsx"><b>↓ Excel</b><small>Excel · Google Sheets · Numbers</small></button></div>
        <p class="lps-dlerr" role="status" hidden>Couldn’t make the file. Please try again.</p>
        <iframe class="lps-frame" id="lps-frame" title="Full history of ${esc(who)}" src="/report?embed=1" aria-hidden="true" tabindex="-1"></iframe></section>`;
      liven();
      const frame = document.getElementById('lps-frame');
      const errLine = page.querySelector('.lps-dlerr');
      const send = (m) => frame.contentWindow && frame.contentWindow.postMessage(m, location.origin);
      let ready = false, queued = null;
      const btns = [...page.querySelectorAll('.lps-dl button')];
      const busy = (b, on) => { b.disabled = on; b.classList.toggle('busy', on); const sm = b.querySelector('small'); if (on) { b.dataset.was = sm.textContent; sm.textContent = 'Preparing…'; } else if (b.dataset.was) sm.textContent = b.dataset.was; };
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return;
        if (e.data.lp === 'ready') { send({ lp: 'data', data }); ready = true; if (queued) { send({ lp: 'export', kind: queued }); queued = null; } }
        if (e.data.lp === 'file' && e.data.blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(e.data.blob); a.download = e.data.name || 'report';
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        }
        if (e.data.lp === 'exported') { btns.filter((b) => b.dataset.act === e.data.kind).forEach((b) => busy(b, false)); errLine.hidden = e.data.ok !== false; }
      });
      page.querySelector('.lps-dl').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        errLine.hidden = true; busy(b, true);
        if (ready) send({ lp: 'export', kind: b.dataset.act }); else queued = b.dataset.act;
      });
    } catch (err) { fail(err.message); }
  }

  const mon = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const langName = (l) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(l); } catch { return l; } };
  const bars = (rows, label, value, suffix, flag) => `<ul class="lps-bars">${rows.map((r) => `<li>${flag ? `<img src="/assets/flags/${r.code.toLowerCase()}.svg" alt="" width="18" height="13" onerror="this.remove()">` : ''}<span data-no-i18n>${esc(label(r))}</span><i><b style="--w:${Math.max(3, value(r))}%"></b></i><em data-no-i18n>${value(r)}${suffix}</em></li>`).join('')}</ul>`;
  function chart(months, name, extra = '') {
    if (months.length < 3) return '';
    const max = Math.max(...months.map((m) => m.value)) || 1;
    const top = months.reduce((b, m) => (m.value > b.value ? m : b), months[0]);
    return `<section class="lps-card lps-chart"><h2>Is <span data-no-i18n>${esc(name)}</span> searched more?</h2>
      <p class="lps-sub">Google searches worldwide, month by month. 100 = the busiest week. Most searched in <b data-no-i18n>${mon(top.month)}</b>. Tap a month.</p>${extra}
      <div class="lps-cols" role="list">${months.map((m) => `<button type="button" role="listitem" class="${m === top ? 'top' : ''}" data-tip="${mon(m.month)}: ${m.value} of 100" style="--h:${Math.max(2, Math.round((m.value / max) * 100))}%"><i></i><span data-no-i18n>${mon(m.month).split(' ')[0]}</span></button>`).join('')}</div>
      <p class="lps-tip" aria-live="polite" data-no-i18n>${mon(top.month)}: ${top.value} of 100</p></section>`;
  }
  // Real numbers from official or first-party sources (World Bank, SEC, Yahoo Finance, Deezer, TheSportsDB, TSE).
  const money = (v) => { const a = Math.abs(v), sg = v < 0 ? '−' : ''; return a >= 1e12 ? `${sg}$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${sg}$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${sg}$${(a / 1e6).toFixed(1)}M` : `${sg}$${num(Math.round(a))}`; };
  function statValue(t, kind) {
    if (t.unit === 'usd') return money(t.value);
    if (t.unit === 'pct') return `${t.value}%`;
    if (t.unit === 'pct_signed') return `${t.value >= 0 ? '+' : '−'}${Math.abs(t.value)}%`;
    if (t.unit === 'price') return `${esc(t.currency || '')} ${Number(t.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
    if (t.unit === 'n') return kind === 'election' ? num(t.value) : short(t.value);
    return esc(t.value);
  }
  const STAT_TITLE = { country: (n) => `<span data-no-i18n>${n}</span>’s economy in numbers`, company: (n) => `<span data-no-i18n>${n}</span> in numbers`,
    music: (n) => `<span data-no-i18n>${n}</span>’s music in numbers`, club: (n) => `<span data-no-i18n>${n}</span> on the pitch`, election: () => 'Who won the 2022 runoff?' };
  function statsHtml(k, c, name) {
    if (!k || !k.tiles || !k.tiles.length) return '';
    const n = esc(name);
    const sources = (k.sources || [{ name: k.source, link: k.link }]).map((x) => `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a>`).join(' · ');
    const tiles = `<dl class="lps-fgrid lps-kgrid">${k.tiles.map((t) => `<div><dt>${esc(t.label)}</dt><dd data-no-i18n>${statValue(t, k.kind)}</dd>${t.year || t.note || t.change != null ? `<small data-no-i18n>${[t.year, t.note].filter(Boolean).map(esc).join(' · ')}${t.change != null ? ` <em class="${t.change >= 0 ? 'up' : 'down'}">${t.change >= 0 ? '▲' : '▼'} ${Math.abs(t.change)}% ${t.change_label ? esc(t.change_label) : 'vs year before'}</em>` : ''}</small>` : ''}</div>`).join('')}</dl>`;
    const sp = k.split ? (() => { const tot = k.split.a.votes + k.split.b.votes, a = Math.round((k.split.a.votes / tot) * 1000) / 10;
      return `<div class="lps-split" role="img" aria-label="${esc(k.split.a.name)} ${a}%, ${esc(k.split.b.name)} ${Math.round((100 - a) * 10) / 10}%"><i style="--w:${a}%"><span data-no-i18n>${esc(k.split.a.name)} ${a}%</span></i><b><span data-no-i18n>${esc(k.split.b.name)} ${Math.round((100 - a) * 10) / 10}%</span></b></div><p class="lps-sub">${esc(k.split.label)}. ${esc(k.note || '')}</p>`; })() : '';
    const pts = k.series && k.series.points || [];
    const max = Math.max(...pts.map((p) => Math.abs(p.y))) || 1;
    const fmt = (y) => (k.series.unit === 'usd' ? money(y) : k.series.unit === 'pct' ? `${y}%` : statValue({ unit: 'price', value: y, currency: k.series.currency }));
    const series = pts.length >= 3 ? `<h3>${esc(k.series.label)}</h3><div class="lps-cols lps-kcols" role="list">${pts.map((p) => `<button type="button" role="listitem" class="${p.y < 0 ? 'neg' : ''}" data-tip="${esc(p.x)}: ${esc(fmt(p.y))}" style="--h:${Math.max(2, Math.round((Math.abs(p.y) / max) * 100))}%"><i></i><span data-no-i18n>’${esc(String(p.x).slice(-2))}</span></button>`).join('')}</div>
      <p class="lps-tip" aria-live="polite" data-no-i18n>${esc(pts[pts.length - 1].x)}: ${esc(fmt(pts[pts.length - 1].y))}</p>${pts.some((p) => p.y < 0) ? '<p class="lps-sub">Grey bars are years below zero. Tap a year.</p>' : ''}` : '';
    const list = k.list && k.list.items.length ? `<h3>${esc(k.list.label)}</h3><ul class="lps-news lps-klist" data-no-i18n>${k.list.items.map((x) => `<li><b>${esc(x.title)}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</li>`).join('')}</ul>` : '';
    return `<section class="lps-card lps-facts lps-key" style="--cat:${c.color}"><h2>${(STAT_TITLE[k.kind] || STAT_TITLE.company)(n)}</h2>
      <p class="lps-sub">${k.owner ? `Numbers for <span data-no-i18n>${esc(k.owner)}</span>, the company that owns <span data-no-i18n>${n}</span>. ` : ''}Source: <span data-no-i18n>${sources}</span></p>
      ${tiles}${sp}${series}${list}</section>`;
  }
  const signed = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`;
  const searchStats = (g, world) => `<div class="lps-stats three">${[
    g && g.change_pct != null ? stat(signed(g.change_pct), 'Google searches, last 4 weeks vs the 4 before') : '',
    g && g.yoy_pct != null ? stat(signed(g.yoy_pct), 'Google searches vs the same weeks last year') : g && g.peak ? stat(dayLabel(g.peak.day), g.peak.times >= 1.5 ? `its busiest week of the year: ${g.peak.times}× a normal week` : 'its busiest week of the year') : '',
    world && world[0] ? stat(`<span data-no-i18n>${esc(world[0].name)}</span>`, 'searches for it most, for its size', '', true) : '',
  ].join('')}</div>`;
  function freeHtml(a, c) {
    const name = a.name;
    const img = a.country ? `<img class="lps-av flag" src="/assets/flags/${a.country.toLowerCase()}.svg" alt="" onerror="this.remove()">` : a.image ? `<img class="lps-av" src="${esc(a.image)}" alt="">` : `<span class="lps-av lps-mono" aria-hidden="true">${esc(name[0] || '?')}</span>`;
    const g = a.searches;
    const where = a.world && a.world.length >= 2 ? `<section class="lps-card"><h2>Where do people search for <span data-no-i18n>${esc(name)}</span>?</h2><p class="lps-sub">Google searches by country, last 12 months. 100 = the country that searches it most for its size.</p>${bars(a.world, (r) => r.name, (r) => r.value, '', true)}</section>` : '';
    const news = a.headlines && a.headlines.length ? `<section class="lps-card"><h2>What’s in the news?</h2><p class="lps-sub">The latest headlines that name <span data-no-i18n>${esc(name)}</span> (Google News).</p>
      <ul class="lps-news" data-no-i18n>${a.headlines.map((h) => `<li><a href="${esc(h.link)}" target="_blank" rel="noopener"><b>${esc(h.title)}</b><span>${esc(h.source)}${h.day ? ` · ${dayLabel(h.day)}` : ''}</span></a></li>`).join('')}</ul></section>` : '';
    const headCard = `<section class="lps-card" style="--cat:${c.color}"><div class="lps-prof">${img}<div class="lps-who"><div class="lps-tags"><span class="lps-tag">${c.label}</span></div><h1 data-no-i18n>${esc(name)}</h1><p data-no-i18n>${esc(a.description)}</p>${a.website ? `<p class="lps-site"><a href="${esc(a.website)}" target="_blank" rel="noopener">Official website ↗</a></p>` : ''}</div></div></section>`;
    return `${headCard}
      ${statsHtml(a.key_stats, c, name)}${g ? chart(g.months || [], name, searchStats(g, a.world)) : ''}${where}${news}`;
  }
  // Numbers count up, bars grow, months answer a tap: small touches so the page feels alive (off with reduced motion).
  function liven() {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    page.querySelectorAll('.lps-count').forEach((el) => {
      const n = Number(el.dataset.n), dec = el.dataset.d === '1';
      if (still || !n) return;
      const t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 900), v = n * (1 - (1 - k) ** 3); el.textContent = dec ? v.toFixed(1).replace(/\.0$/, '') : short(Math.round(v)); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('lps-in')));
    page.querySelectorAll('.lps-cols button').forEach((b) => {
      const box = b.closest('.lps-card'), tip = box && box.querySelector('.lps-tip');
      const show = () => { box.querySelectorAll('.lps-cols button.on').forEach((x) => x.classList.remove('on')); b.classList.add('on'); if (tip) tip.textContent = b.dataset.tip; };
      b.addEventListener('click', show); b.addEventListener('pointerenter', show); b.addEventListener('focus', show);
    });
  }

  async function openSearch() {
    try {
      const res = await fetch(`/api/report?about=${encodeURIComponent(q)}`);
      const a = await res.json();
      if (!res.ok) throw new Error(a.error || 'Nothing found for that search.');
      loaded();
      const c = CATS[a.cat] || CATS.topic;
      const name = a.name;
      document.title = `${name} · Like Polling`;
      const buy = c.buy ? `<div class="lps-acts"><a href="${c.buy}" target="_blank" rel="noopener">Get the full history · €4</a></div>
        <form action="/report"><label class="lps-vh" for="lps-key">License key</label><input id="lps-key" placeholder="Paste your key" autocomplete="off" spellcheck="false" required><button type="submit">Open</button></form>`
        : '<p>Full history for this kind of search is coming soon. Meanwhile, try the free samples above.</p>';
      page.innerHTML = `${freeHtml(a, c)}
        <section class="lps-card lps-buy" style="--cat:${c.color}"><h2>Full history</h2>${c.buy ? `<p>Graphs since 2017, saved snapshots, comparisons with similar names, a PDF presentation and an Excel file about <span data-no-i18n>${esc(name)}</span>. No sign-up.</p>` : ''}${buy}</section>`;
      liven();
      const kf = page.querySelector('.lps-buy form');
      if (kf) kf.addEventListener('submit', (e) => { e.preventDefault(); location.href = `/report#k=${encodeURIComponent(document.getElementById('lps-key').value.trim())}`; });
    } catch (err) { fail(err.message); }
  }
  if (sample) openSample(); else openSearch();
})();
