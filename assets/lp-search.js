// Homepage search bar (Wikipedia suggestions) and the search pages at /s/<sample> or /s?q=<name>.
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

  const page = document.getElementById('lps-page');
  if (!page || !document.documentElement.classList.contains('lp-subj')) return;
  const slug = location.pathname.replace(/^\/s\/?/, '').replace(/\/$/, '');
  const q = new URLSearchParams(location.search).get('find') || '';
  if (!slug && !q) { location.replace('/'); return; }
  const sample = SAMPLES[slug];
  if (slug && !sample) { location.replace(`/s?find=${encodeURIComponent(slug.replace(/-/g, ' '))}`); return; }
  if (input) input.value = sample ? sample.name : q;
  page.hidden = false;
  const STEPS = ['Finding {n}', 'Counting Wikipedia reads', 'Checking Google searches', 'Reading the news', 'Building the page'];
  const wait = (what) => `<section class="lps-card lps-search lps-load" aria-live="polite"><div class="lps-wait"><b>Bots are building <span data-no-i18n>${esc(what)}</span>’s page</b>
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
      const reads = (c.wikipedia_daily_total || []).reduce((t, n) => t + n, 0);
      const top = c.wikipedia && c.wikipedia[0], search = c.searches && c.searches.top && c.searches.top[0];
      return `<div class="lps-prof"><img class="lps-av flag" src="/assets/flags/${c.country.toLowerCase()}.svg" alt=""><div class="lps-who">${tags(cat, true)}<h1 data-no-i18n>Brazil</h1><p>What Brazil reads, searches and is in the news for.</p></div></div>
        <div class="lps-stats">${stat(short(reads), 'Wikipedia reads of its top pages, 30 days')}${stat(short(c.news_focus ? c.news_focus.articles : 0), 'News stories about Brazil, 30 days')}
        ${top ? stat(esc(top.title), 'Most-read page', '', true) : ''}${search ? stat(esc(search.query), 'Top Google search', '', true) : ''}</div>`;
    }
    const s = data.subject;
    const f = data.field;
    if (slug === 'lula-vs-bolsonaro' && data.peers && data.peers[0]) {
      const side = (p) => `<div>${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}<h3 data-no-i18n>${esc(plain(p.title))}</h3><b data-no-i18n>${short(p.views)}</b><span>Wikipedia reads, 30 days</span>${delta(p.change_pct, 'vs the 30 days before')}<b data-no-i18n>${num(p.languages)}</b><span>Wikipedia languages</span></div>`;
      return `<div class="lps-who">${tags(cat, true)}<h1 data-no-i18n>Lula vs Bolsonaro</h1><p>Brazil’s two biggest political names, side by side.</p></div><div class="lps-vs">${side(s)}${side(data.peers[0])}</div>`;
    }
    const name = sample.name;
    return `<div class="lps-prof">${s.image ? `<img class="lps-av" src="${esc(s.image)}" alt="">` : ''}<div class="lps-who">${tags(cat, true)}<h1 data-no-i18n>${esc(name)}</h1><p>${esc(s.description)}</p></div></div>
      <div class="lps-stats">${stat(short(s.views), 'Wikipedia reads, last 30 days', delta(s.change_pct, 'vs the 30 days before'))}${stat(s.yoy_pct == null ? '–' : `${s.yoy_pct >= 0 ? '+' : ''}${s.yoy_pct}%`, 'Compared with a year ago')}
      ${stat(num(s.languages), 'Wikipedia languages')}${f && f.rank ? stat(`#${f.rank}`, `Most read of ${f.compared}: ${esc(f.name)}`) : s.peak ? stat(short(s.peak.views), `Reads on its busiest day, ${new Date(`${s.peak.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`) : ''}</div>`;
  }

  async function openSample() {
    try {
      const res = await fetch(`/api/report?page=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Couldn’t load this page.');
      loaded();
      const cat = sample.cat;
      const who = sample.name;
      page.innerHTML = `<section class="lps-card" style="--cat:${CATS[cat].color}">${profile(data, cat)}</section>
        <section class="lps-card" id="lps-hist" style="--cat:${CATS[cat].color}"><h2>Full history</h2><p class="lps-sub">Graphs since 2017, saved snapshots and downloads. Unlocked in this free sample.</p>
        <div class="lps-acts"><button type="button" data-act="graphs">Graphs</button><button type="button" class="ghost" data-act="pdf">Download PDF presentation</button><button type="button" class="ghost" data-act="xlsx"><span data-no-i18n>${esc(who)}’s</span> data in Excel</button></div>
        <iframe class="lps-frame" id="lps-frame" title="Full history of ${esc(who)}" src="/report?embed=1"></iframe></section>`;
      const frame = document.getElementById('lps-frame');
      const send = (m) => frame.contentWindow && frame.contentWindow.postMessage(m, location.origin);
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return;
        if (e.data.lp === 'ready') send({ lp: 'data', data });
        if (e.data.lp === 'height') frame.style.height = `${Math.max(400, e.data.h + 4)}px`;
      });
      page.querySelector('.lps-acts').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'graphs') frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else send({ lp: 'export', kind: b.dataset.act });
      });
    } catch (err) { fail(err.message); }
  }

  const mon = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const langName = (l) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(l); } catch { return l; } };
  const bars = (rows, label, value, suffix, flag) => `<ul class="lps-bars">${rows.map((r) => `<li>${flag ? `<img src="/assets/flags/${r.code.toLowerCase()}.svg" alt="" width="18" height="13">` : ''}<span data-no-i18n>${esc(label(r))}</span><i><b style="--w:${Math.max(3, value(r))}%"></b></i><em data-no-i18n>${value(r)}${suffix}</em></li>`).join('')}</ul>`;
  function chart(months, name) {
    if (months.length < 3) return '';
    const max = Math.max(...months.map((m) => m.views)) || 1;
    const top = months.reduce((b, m) => (m.views > b.views ? m : b), months[0]);
    const lastM = months[months.length - 1];
    return `<section class="lps-card lps-chart"><h2>Is <span data-no-i18n>${esc(name)}</span> getting more attention?</h2>
      <p class="lps-sub">Most reads in <b data-no-i18n>${mon(top.month)}</b>. Last month: <b data-no-i18n>${short(lastM.views)}</b> Wikipedia reads. Tap a month.</p>
      <div class="lps-cols" role="list">${months.map((m) => `<button type="button" role="listitem" class="${m === top ? 'top' : ''}" data-tip="${mon(m.month)}: ${short(m.views)} reads" style="--h:${Math.max(2, Math.round((m.views / max) * 100))}%"><i></i><span data-no-i18n>${mon(m.month).split(' ')[0]}</span></button>`).join('')}</div>
      <p class="lps-tip" aria-live="polite" data-no-i18n>${mon(top.month)}: ${short(top.views)} reads</p></section>`;
  }
  const FACTS = {
    person: [['born', 'Born'], ['from', 'From'], ['occupation', 'Known as'], ['genre', 'Music'], ['team', 'Plays for'], ['label', 'Record labels'], ['works', 'Known for']],
    company: [['founded', 'Founded'], ['founders', 'Founded by'], ['ceo', 'CEO'], ['hq', 'Headquarters'], ['industry', 'Industry'], ['employees', 'Employees'], ['exchange', 'Stock exchange'], ['part_of', 'Part of']],
    country: [['capital', 'Capital'], ['population', 'Population'], ['languages', 'Languages'], ['head_state', 'Head of state'], ['head_gov', 'Head of government'], ['currency', 'Currency']],
  };
  const age = (y, m = '') => { const n = new Date().getUTCFullYear() - y - (m && m > new Date().toISOString().slice(5, 10) ? 1 : 0); return n; };
  function factValue(k, v, name) {
    if (Array.isArray(v)) { const l = v.filter((x) => x !== name); return l.length ? esc((k === 'from' ? l.slice(0, 1) : l.slice(0, 3)).join(', ')) : ''; }
    if (v && v.n != null) return `${short(v.n)}${v.year ? ` <small>(${v.year})</small>` : ''}`;
    if (v && v.year) return k === 'born' ? `${v.day ? new Date(`${v.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : v.year} <small>(age ${age(v.year, v.day ? v.day.slice(5) : '')})</small>` : `${v.year} <small>(${age(v.year)} years ago)</small>`;
    return '';
  }
  function factsHtml(a, c) {
    const set = FACTS[a.cat === 'person' ? 'person' : a.cat === 'country' ? 'country' : 'company'];
    const f = a.facts || {};
    const tiles = set.map(([k, label]) => [label, factValue(k, f[k], a.title)]).filter(([, v]) => v);
    const owns = [...(f.owns || []), ...(f.subsidiaries || [])].filter((x, i, l) => x !== a.title && l.indexOf(x) === i).slice(0, 10);
    const aw = a.awards && a.awards.count ? a.awards : null;
    const fol = (a.followers || []).filter((x) => x.followers > 0);
    if (!tiles.length && !owns.length && !aw && !fol.length) return '';
    const title = a.cat === 'person' ? `Who is <span data-no-i18n>${esc(a.name)}</span>?` : a.cat === 'country' ? `<span data-no-i18n>${esc(a.name)}</span> at a glance` : `About <span data-no-i18n>${esc(a.name)}</span>`;
    return `<section class="lps-card lps-facts" style="--cat:${c.color}"><h2>${title}</h2><p class="lps-sub">From Wikidata, the free database behind Wikipedia.</p>
      ${tiles.length ? `<dl class="lps-fgrid">${tiles.map(([l, v]) => `<div><dt>${l}</dt><dd data-no-i18n>${v}</dd></div>`).join('')}</dl>` : ''}
      ${owns.length ? `<h3>What <span data-no-i18n>${esc(a.name)}</span> owns</h3><div class="lps-chips" data-no-i18n>${owns.map((o) => `<a href="/s?find=${encodeURIComponent(o)}">${esc(o)}</a>`).join('')}</div>` : ''}
      ${aw ? `<h3><span class="lps-big" data-no-i18n>${aw.count}</span> ${aw.count === 1 ? "award" : "awards"}</h3><ul class="lps-awards" data-no-i18n>${aw.recent.map((x) => `<li><b>${esc(x.name)}</b>${x.year ? `<span>${x.year}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${fol.length ? `<h3>Followers</h3><div class="lps-fol" data-no-i18n>${fol.map((x) => `<div><b>${short(x.followers)}</b><span>${esc(x.platform)} · ${x.year}</span></div>`).join('')}</div>` : ''}
      ${a.website ? `<p class="lps-site"><a href="${esc(a.website)}" target="_blank" rel="noopener">Official website ↗</a></p>` : ''}</section>`;
  }
  function freeHtml(a, c) {
    const name = a.name;
    const img = a.country ? `<img class="lps-av flag" src="/assets/flags/${a.country.toLowerCase()}.svg" alt="">` : a.image ? `<img class="lps-av" src="${esc(a.image)}" alt="">` : '';
    const peak = a.peak ? (a.peak.times >= 2 ? stat(`<span class="lps-count" data-n="${a.peak.times}" data-d="1">${a.peak.times}</span>×`, `a normal day’s reads on ${dayLabel(a.peak.day)}, the busiest day`)
      : stat(`<span class="lps-count" data-n="${a.peak.views}">${short(a.peak.views)}</span>`, `reads on ${dayLabel(a.peak.day)}, the busiest day`)) : '';
    const where = a.countries && a.countries.length >= 2 ? `<div><h3>Where do people search for <span data-no-i18n>${esc(name)}</span>?</h3><p class="lps-sub">Google searches in our 14 countries, last 30 days. 100 = the most.</p>${bars(a.countries, (r) => r.name, (r) => r.value, '', true)}</div>` : '';
    const langs = a.top_languages && a.top_languages.length >= 2 ? `<div><h3>Which languages read about <span data-no-i18n>${esc(name)}</span>?</h3><p class="lps-sub">Share of Wikipedia reads, last 30 days.</p>${bars(a.top_languages, (r) => langName(r.lang), (r) => r.share, '%')}</div>` : '';
    const news = a.headlines && a.headlines.length ? `<section class="lps-card"><h2>What’s in the news?</h2><p class="lps-sub">The latest headlines that name <span data-no-i18n>${esc(name)}</span>.</p>
      <ul class="lps-news" data-no-i18n>${a.headlines.map((h) => `<li><a href="${esc(h.link)}" target="_blank" rel="noopener"><b>${esc(h.title)}</b><span>${esc(h.source)}${h.day ? ` · ${dayLabel(h.day)}` : ''}</span></a></li>`).join('')}</ul></section>` : '';
    return `<section class="lps-card" style="--cat:${c.color}"><div class="lps-prof">${img}<div class="lps-who"><div class="lps-tags"><span class="lps-tag">${c.label}</span></div><h1 data-no-i18n>${esc(name)}</h1><p>${esc(a.description || a.extract)}</p></div></div>
      <div class="lps-stats three">${stat(`<span class="lps-count" data-n="${a.views_30d}">${short(a.views_30d)}</span>`, 'Wikipedia reads, last 30 days', delta(a.change_pct, 'vs the 30 days before'))}${peak}${stat(`<span class="lps-count" data-n="${a.languages}">${num(a.languages)}</span>`, 'languages have a Wikipedia page about them')}</div></section>
      ${factsHtml(a, c)}${chart(a.months || [], name)}${where || langs ? `<section class="lps-card lps-two">${where}${langs}</section>` : ''}${news}`;
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
    const tip = page.querySelector('.lps-tip');
    page.querySelectorAll('.lps-cols button').forEach((b) => {
      const show = () => { page.querySelectorAll('.lps-cols button.on').forEach((x) => x.classList.remove('on')); b.classList.add('on'); if (tip) tip.textContent = b.dataset.tip; };
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
