// /report: opens an Extended Country, Artist or Company Report (artist/company: renderEntity). ?sample=BR-PT is free; otherwise the buyer pastes the
// license key from their receipt (Lemon Squeezy or Gumroad) once, and this browser remembers it (localStorage only).
(function () {
  'use strict';
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const name = (c) => names.of(c) || c;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
  };

  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));

  function show(id) { ['access', 'loading', 'report'].forEach((s) => { $(s).hidden = s !== id; }); }
  function error(msg) { $('err').textContent = msg || ''; $('err').hidden = !msg; }

  function fillPickers() {
    const sorted = COUNTRIES.map((c) => [c, name(c)]).sort((a, b) => a[1].localeCompare(b[1]));
    $('p1').innerHTML = sorted.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
    $('p2').innerHTML = '<option value="">No comparison</option>' + $('p1').innerHTML;
    const pre = String(localStorage.getItem('lp_report_countries') || '').split(',').filter((c) => COUNTRIES.includes(c));
    $('p1').value = pre[0] || 'BR';
    $('p2').value = pre[1] || '';
  }

  async function open(body) {
    show('loading');
    error('');
    try {
      const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        show('access');
        $('key').value = body.key || '';
        if (data.need_countries) { $('pick').hidden = false; $('go').textContent = 'Open my report'; }
        if (data.need_choice) {
          const kind = data.need_choice;
          $('pick-e').hidden = false;
          $('pe-kind').textContent = kind;
          $('pe-l').textContent = kind === 'artist' ? 'Artist' : 'Company or brand';
          $('e1').placeholder = kind === 'artist' ? 'e.g. Anitta' : 'e.g. Nike';
        }
        error(data.error);
        if (res.status === 403 || res.status === 404) store.del('lp_report');
        return;
      }
      store.set('lp_report', { key: body.key, instance: data.instance_id });
      history.replaceState(null, '', `/report#k=${encodeURIComponent(body.key)}&i=${encodeURIComponent(data.instance_id)}`);
      render(data);
    } catch {
      show('access');
      error('Couldn\'t reach Like Polling. Check your connection and try again.');
    }
  }

  async function openSample() {
    show('loading');
    const kind = params.get('sample');
    try {
      const res = await fetch(kind === 'artist' || kind === 'company' ? `/api/report?type=${kind}` : '/api/report?country=BR&compare=PT');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      render(data);
    } catch (err) {
      show('access');
      error(err.message || 'Couldn\'t load the sample.');
    }
  }

  // ---- rendering ----
  const empty = '<p class="muted small">Not enough saved data yet.</p>';
  const utc = (d, o) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  const dshort = (d) => utc(d, { day: 'numeric', month: 'short' });
  const dlong = (d) => utc(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : num(n));
  const nice = (m) => { const p = 10 ** Math.floor(Math.log10(m || 1)); return Math.ceil(m / p / (m / p > 5 ? 2 : 1)) * p * (m / p > 5 ? 2 : 1); };

  // Line chart of one daily series, peak marked. Plain SVG so it prints into the PDF.
  function lineChart(points, what) {
    if (points.length < 2) return empty;
    const W = 600, H = 210, L = 44, R = 14, T = 16, B = 30;
    const max = nice(Math.max(...points.map((p) => p.value)));
    const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const peak = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0);
    const grid = [0, max / 2, max].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('');
    const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${dshort(points[i].day)}</text>`).join('');
    const px = x(peak), anchor = px > W - 120 ? 'end' : px < L + 80 ? 'start' : 'middle';
    return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(what)} per day">${grid}${ticks}
      <polygon points="${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}" class="area"/><polyline points="${line}" class="ln"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === peak ? 4.5 : 2.5}" class="${i === peak ? 'pk' : 'dot'}"/>`).join('')}
      <text x="${px}" y="${y(points[peak].value) - 9}" text-anchor="${anchor}" class="pkl">Peak: ${num(points[peak].value)}</text></svg></figure>`;
  }

  function spark(series) {
    if (!series || series.length < 2) return '';
    const max = Math.max(...series) || 1, W = 96, H = 24;
    const pts = series.map((v, i) => `${((i * W) / (series.length - 1)).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }

  // Ranked bars: label and number on top, bar under it, extra line below.
  const rank = (items, val, label, extra) => {
    if (!items || !items.length) return empty;
    const max = Math.max(...items.map(val)) || 1;
    return `<ol class="rank">${items.map((it) => `<li><div class="rl"><span>${label(it)}</span><b>${num(val(it))}</b></div><i style="--w:${Math.max(2, (val(it) / max) * 100).toFixed(1)}%"></i>${extra ? `<div class="rx">${extra(it)}</div>` : ''}</li>`).join('')}</ol>`;
  };
  const wikiLabel = (w) => `<a href="${esc(w.link)}" target="_blank" rel="noopener">${esc(w.title)}</a>`;
  const wikiExtra = (c) => (w) => `${spark(w.series)}<small>${w.days} of ${c.wikipedia_days.length} days in the daily top 30 · first seen <span style="white-space:nowrap">${dshort(w.first_day)}</span></small>`;

  const sum = (a) => a.reduce((t, n) => t + n, 0);
  function facts(c) {
    const nd = c.news_daily || [];
    const busy = nd.reduce((m, d) => (!m || d.articles > m.articles ? d : m), null);
    const calm = nd.reduce((m, d) => (!m || d.articles < m.articles ? d : m), null);
    const views = sum(c.wikipedia_daily_total || []);
    return { nd, busy, calm, views, top: c.wikipedia[0], partner: c.news_partners[0], f: c.news_focus };
  }

  function glance(c) {
    const k = facts(c);
    const card = (n, label, sub) => `<div class="kpi"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    return `<div class="kpis">${[
      card(short(k.views), 'Wikipedia views', 'of the daily top 30 pages, all days added'),
      card(short(k.f.articles), 'News articles', 'about the country, worldwide'),
      k.f.cooperation_pct == null ? '' : card(`${k.f.cooperation_pct}%`, 'Cooperation news', 'talks, deals, aid. The rest is tension or conflict'),
      k.partner ? card(esc(name(k.partner.country)), 'Most in the news with', `${num(k.partner.articles)} articles together`) : '',
      k.top ? card(esc(k.top.title), 'Most-read page', `${num(k.top.views)} views`) : '',
      card(String(c.wikipedia_rising.length), 'New this week', 'pages that just entered the top 30'),
    ].join('')}</div>`;
  }

  const SECTIONS = [
    ['At a glance', 'The main numbers for the period, explained in the sections below.', glance],
    ['News coverage per day', 'How many news articles worldwide mentioned the country each day. Spikes usually mean a big event.', (c) => {
      const k = facts(c);
      if (!k.nd.length) return empty;
      return `${lineChart(k.nd.map((d) => ({ day: d.day, value: d.articles })), 'News articles')}<p class="take">Busiest day: <b>${dshort(k.busy.day)}</b> with ${num(k.busy.articles)} articles${k.calm.articles ? `, ${(k.busy.articles / k.calm.articles).toFixed(1)}× the quietest day (${dshort(k.calm.day)}, ${num(k.calm.articles)})` : ''}. Average: ${num(Math.round(sum(k.nd.map((d) => d.articles)) / k.nd.length))} a day.</p>`;
    }],
    ['Wikipedia attention per day', 'Total views of the 30 most-read pages each day. It shows how busy people were looking things up.', (c) => {
      const pts = (c.wikipedia_days || []).map((d, i) => ({ day: d, value: c.wikipedia_daily_total[i] }));
      if (pts.length < 2) return empty;
      const top = c.wikipedia[0];
      return `${lineChart(pts, 'Wikipedia views')}${top ? `<p class="take">The #1 page, <b>${esc(top.title)}</b>, had ${num(top.views)} views: ${Math.round((top.views / (sum(c.wikipedia_daily_total) || 1)) * 100)}% of all top-30 views in the period.</p>` : ''}`;
    }],
    ['Most-read on Wikipedia', 'Total views over the period. The small line shows that page\'s views day by day.', (c) => rank(c.wikipedia, (w) => w.views, wikiLabel, wikiExtra(c))],
    ['Rising this week', 'Pages that entered the daily top 30 only in the last 7 days. Often the best early signals.', (c) => rank(c.wikipedia_rising, (w) => w.views, wikiLabel, wikiExtra(c))],
    ['What the news talks about', 'Share of all news articles about the country, by type of event.', (c) => {
      const f = c.news_focus;
      if (!f.articles) return empty;
      return `<div class="split"><i style="--w:${f.cooperation_pct}%"></i></div><div class="splitl"><span><b>${f.cooperation_pct}%</b> cooperation</span><span><b>${100 - f.cooperation_pct}%</b> tension or conflict</span></div>
        <ul class="bars">${f.topics.map((t) => `<li><span>${esc(t.topic)}</span><i style="--w:${Math.max(2, t.pct)}%"></i><b>${t.pct}%</b></li>`).join('')}</ul>
        <p class="take">The most common type was <b>${esc(f.topics[0].topic.toLowerCase())}</b>, at ${f.topics[0].pct}% of ${num(f.articles)} articles.</p>`;
    }],
    ['In the news with', 'Countries that appeared in the same news articles most often. A sign of who the country deals with.', (c) => rank(c.news_partners, (p) => p.articles, (p) => esc(name(p.country)))],
    ['Ideas to copy', 'Written each week by AI from the data above. Use them as starting points.', (c) => (c.ideas.length
      ? `<ol class="ideas">${c.ideas.map((i) => `<li><b>${esc(i.title)}</b><p>${esc(i.idea)}</p>${i.based_on ? `<small>Based on: ${esc(i.based_on)}</small>` : ''}</li>`).join('')}</ol>`
      : '<p class="muted small">This week\'s ideas are being written. Check back soon.</p>')],
  ];

  const GLOSSARY = `<section class="rsec"><h2>How to read the numbers</h2><dl class="gloss">
    <dt>Views</dt><dd>Times a Wikipedia page was opened from that country. Wikimedia rounds them up a little to protect privacy.</dd>
    <dt>Days in the top 30</dt><dd>On how many recorded days the page was among the country's 30 most-read. More days means lasting interest, not a one-day spike.</dd>
    <dt>News articles</dt><dd>Online news articles worldwide that mention the country, counted by The GDELT Project. One article can count for two countries.</dd>
    <dt>Cooperation and conflict</dt><dd>GDELT sorts every news event into 20 types, from statements and talks (cooperation) to protests and fighting (conflict).</dd>
    <dt>Period</dt><dd>Like Polling began recording on 24 October 2026. Each report covers up to the last 30 recorded days, so early reports cover fewer days.</dd></dl></section>`;

  // ---- artist / company reports: numbers and charts first, one short line each ----
  const LANG = new Intl.DisplayNames(['en'], { type: 'language' });
  const STARTED = '2026-10-24';
  const since = (extra) => `<p class="since"><b>Gathered since day one.</b> Like Polling has recorded its sources every day since ${dlong(STARTED)}, the day we started.${extra ? ` ${extra}` : ''}</p>`;
  const isoDay = (iso) => String(iso).slice(0, 10);
  const dates = (from, to, printed) => `<dl class="dates"><div><dt>Gathered from</dt><dd>${dlong(from)}</dd></div><div><dt>Latest data</dt><dd>${dlong(to)}</dd></div><div><dt>Printed</dt><dd>${dlong(isoDay(printed))}</dd></div></dl>`;
  const getYours = '<p class="print-only">Get your own report at <b>likepolling.com/services</b>. From €18, no sign-up.</p>';
  const COLORS = ['#b0000e', '#1d1d1f', '#9a9a9a', '#d08a2e'];
  const delta = (p) => (p == null ? '' : `<em class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</em>`);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function multiChart(lines) {
    const days = lines[0].points.map((p) => p.day);
    if (days.length < 2) return empty;
    const W = 600, H = 230, L = 48, R = 14, T = 16, B = 30;
    const max = nice(Math.max(...lines.flatMap((l) => l.points.map((p) => p.value))));
    const x = (i) => L + (i * (W - L - R)) / (days.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const grid = [0, max / 2, max].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('');
    const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}">${dshort(days[i])}</text>`).join('');
    const paths = lines.map((l, k) => ({ l, k })).reverse().map(({ l, k }) => {
      const byDay = new Map(l.points.map((p) => [p.day, p.value]));
      const pts = days.map((d, i) => `${x(i).toFixed(1)},${y(byDay.get(d) || 0).toFixed(1)}`).join(' ');
      return `<polyline points="${pts}" class="${k ? 'ln2' : 'ln1'}" style="stroke:${COLORS[k]}"/>`;
    }).join('');
    return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wikipedia views per day">${grid}${ticks}${paths}</svg></figure>
      <ul class="legend">${lines.map((l, k) => `<li><i style="background:${COLORS[k]}"></i>${esc(l.label)}</li>`).join('')}</ul>`;
  }

  function cbars(items, val, fmt) {
    const max = Math.max(...items.map((it) => Math.abs(val(it)))) || 1;
    return `<ul class="cbars">${items.map((it) => `<li class="${it.me ? 'me' : ''}"><div class="rl"><span>${esc(it.title)}</span><b>${fmt(val(it))}</b></div><i style="--w:${Math.max(2, (Math.abs(val(it)) / max) * 100).toFixed(1)}%;--c:${it.color}"></i></li>`).join('')}</ul>`;
  }

  function renderEntity(data) {
    const s = data.subject;
    const kind = data.type === 'artist' ? 'Artist' : 'Company';
    const similar = data.type === 'artist' ? 'similar artists' : 'similar brands';
    const plain = (x) => x.replace(/ \([^)]*\)$/, '');
    s.title = plain(s.title);
    const all = [{ ...s, me: true }, ...data.peers.map((p) => ({ ...p, title: plain(p.title) }))].map((p, k) => ({ ...p, color: COLORS[k] }));
    const card = (n, label, sub) => `<div class="kpi"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const langTotal = sum(data.languages.map((l) => l.views));
    const abroad = 100 - pct(s.views, langTotal);
    const second = [...all].sort((a, b) => b.views - a.views).find((p) => !p.me);
    document.title = `${s.title} · Extended ${kind} Report · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? `Free sample · Extended ${kind} Report` : `Extended ${kind} Report`}</span>
      <div class="ehead">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}<div><h1>${esc(s.title)}</h1><p class="muted" style="margin:4px 0 0">${esc(s.description)}</p></div></div>
      <p class="muted">Compared with ${all.length - 1} ${similar}.</p>
      ${dates(data.from, data.to, data.generated_at)}
      ${since('This report also uses Wikimedia\'s public view history.')}
      <div class="actions"><button class="btn" type="button" id="print">Save as PDF</button>${data.sample ? `<a class="btn ghost" href="/services#${data.type}">Get your own report</a>` : ''}</div></header>`;
    const kpis = `<section class="rsec"><h2>At a glance</h2><div class="kpis">${[
      card(`${short(s.views)}${delta(s.change_pct)}`, 'Wikipedia views', 'last 30 days, vs the 30 before'),
      card(`#${s.rank} of ${all.length}`, `Among ${similar}`, 'by views'),
      card(String(s.languages), 'Wikipedia languages', 'with a page about them'),
      card(`${abroad}%`, 'Read outside English', `of ${short(langTotal)} views in ${data.languages.length} languages`),
      s.peak ? card(dshort(s.peak.day), 'Busiest day', `${num(s.peak.views)} views`) : '',
      data.countries.length ? card(String(data.countries.length), 'Countries trending', 'days in a daily top 30') : (s.edits != null ? card(String(s.edits), 'Page edits', 'people updating it this month') : ''),
    ].join('')}</div></section>`;
    const lead = second ? (s.views >= second.views ? `<b>${esc(s.title)}</b> had ${(s.views / (second.views || 1)).toFixed(1)}× the views of ${esc(second.title)}.` : `<b>${esc(second.title)}</b> had ${(second.views / (s.views || 1)).toFixed(1)}× the views of ${esc(s.title)}.`) : '';
    const trend = `<section class="rsec"><h2>Attention, day by day</h2><p class="note">English Wikipedia views per day.</p>
      ${multiChart(all.map((p) => ({ label: p.title, points: p.series.map((d) => ({ day: d.day, value: d.views })) })))}${lead ? `<p class="take">${lead}</p>` : ''}</section>`;
    const growth = [...all].sort((a, b) => (b.change_pct ?? -1e9) - (a.change_pct ?? -1e9));
    const vs = `<section class="rsec"><h2>Side by side</h2><p class="note">The same three measures for each.</p><div class="vs">
      <div><h3>Views, 30 days</h3>${cbars([...all].sort((a, b) => b.views - a.views), (p) => p.views, short)}</div>
      <div><h3>Change vs last month</h3>${cbars(growth, (p) => p.change_pct || 0, (v) => `${v >= 0 ? '+' : ''}${v}%`)}</div>
      <div><h3>Languages</h3>${cbars([...all].sort((a, b) => b.languages - a.languages), (p) => p.languages, String)}</div>
    </div>${growth[0] ? `<p class="take">Fastest growing: <b>${esc(growth[0].title)}</b> (${growth[0].change_pct >= 0 ? '+' : ''}${growth[0].change_pct ?? 0}%).</p>` : ''}</section>`;
    const langs = `<section class="rsec"><h2>Where people read about ${esc(s.title)}</h2><p class="note">Views by Wikipedia language, last 30 days.</p>
      ${rank(data.languages.slice(0, 10), (l) => l.views, (l) => esc(LANG.of(l.lang) || l.lang), (l) => `<small>${pct(l.views, langTotal)}% of all views</small>`)}
      ${data.languages[1] ? `<p class="take">After English, the most readers are in <b>${esc(LANG.of(data.languages[1].lang) || data.languages[1].lang)}</b>.</p>` : ''}</section>`;
    const ctry = data.countries.length ? `<section class="rsec"><h2>Trending in countries</h2><p class="note">Days the page was in a country's daily top 30.</p>
      ${rank(data.countries.slice(0, 10), (c) => c.days, (c) => esc(name(c.country)))}</section>` : '';
    const sources = `<section class="rsec sources"><h2>Sources</h2><p class="small">Wikipedia page views and pages: Wikimedia Foundation (wikimedia.org), open data. ${data.peers_chosen ? 'Comparisons chosen by the buyer.' : 'Similar pages picked by Wikipedia\'s "more like this" search.'} No YouTube or news data.</p></section>`;
    $('report').innerHTML = head + kpis + trend + vs + langs + ctry + sources + (data.sample ? getYours : '');
    $('print').addEventListener('click', () => window.print());
    show('report');
    window.scrollTo(0, 0);
  }

  // Wikipedia title suggestions for the artist/company fields (straight from Wikipedia; nothing goes to Like Polling).
  let sugT = 0;
  ['e1', 'e2', 'e3', 'e4'].forEach((id) => $(id).addEventListener('input', (e) => {
    clearTimeout(sugT);
    const q = e.target.value.trim();
    if (q.length < 2) return;
    sugT = setTimeout(() => fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&format=json&namespace=0&limit=8&origin=*&search=${encodeURIComponent(q)}`)
      .then((r) => r.json()).then((j) => { $('e-sug').innerHTML = (j[1] || []).map((t) => `<option value="${esc(t)}">`).join(''); }).catch(() => {}), 250);
  }));

  function render(data) {
    if (data.type === 'artist' || data.type === 'company') return renderEntity(data);
    const cs = data.countries;
    const title = cs.map((c) => name(c.country)).join(' vs ');
    const allDays = [...new Set(cs.flatMap((c) => (c.wikipedia_days || []).concat((c.news_daily || []).map((d) => d.day))))].sort();
    document.title = `${title} · Extended Country Report · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? 'Free sample · Extended Country Report' : 'Extended Country Report'}</span>
      <h1>${esc(title)}</h1>
      <p class="muted">What ${cs.length > 1 ? 'these countries' : 'this country'} read and talked about.${data.expires_at ? ` Your access lasts until ${new Date(data.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
      ${allDays.length ? dates(allDays[0], allDays[allDays.length - 1], data.generated_at) : ''}
      ${since('Every number below comes from those records.')}
      <div class="actions"><button class="btn" type="button" id="print">Save as PDF</button>${data.sample ? '<a class="btn ghost" href="/services#country">Get your own report</a>' : ''}</div></header>`;
    let shared = '';
    if (data.shared) {
      const [a, b] = cs.map(facts);
      const row = (label, x, y) => `<tr><th>${label}</th><td>${x}</td><td>${y}</td></tr>`;
      shared = `<section class="rsec"><h2>Side by side</h2><p class="note">The same measures for both countries.</p>
        <table class="cmp"><thead><tr><th></th><th>${esc(name(cs[0].country))}</th><th>${esc(name(cs[1].country))}</th></tr></thead><tbody>
        ${row('News articles', num(a.f.articles), num(b.f.articles))}
        ${row('Cooperation news', a.f.cooperation_pct == null ? '–' : `${a.f.cooperation_pct}%`, b.f.cooperation_pct == null ? '–' : `${b.f.cooperation_pct}%`)}
        ${row('Busiest news day', a.busy ? dshort(a.busy.day) : '–', b.busy ? dshort(b.busy.day) : '–')}
        ${row('Wikipedia views (top 30)', short(a.views), short(b.views))}
        ${row('Most-read page', a.top ? esc(a.top.title) : '–', b.top ? esc(b.top.title) : '–')}
        ${row('Most in the news with', a.partner ? esc(name(a.partner.country)) : '–', b.partner ? esc(name(b.partner.country)) : '–')}
        </tbody></table>
        <p class="take"><b>${num(data.shared.articles_together)}</b> news articles mentioned both countries together.${data.shared.read_in_both.length ? ` <b>${data.shared.read_in_both.length}</b> ${data.shared.read_in_both.length === 1 ? 'page was' : 'pages were'} among the most-read in both:` : ' No page was among the most-read in both countries.'}</p>
        ${data.shared.read_in_both.length ? `<ol class="plain">${data.shared.read_in_both.map((w) => `<li>${wikiLabel(w)}</li>`).join('')}</ol>` : ''}</section>`;
    }
    const body = SECTIONS.map(([h, note, fn]) => `<section class="rsec${/^(Most-read|Rising)/.test(h) ? ' long' : ''}"><h2>${esc(h)}</h2><p class="note">${esc(note)}</p><div class="cols n${cs.length}">${cs.map((c) => `<div class="col">${cs.length > 1 ? `<h3>${esc(name(c.country))}</h3>` : ''}${fn(c)}</div>`).join('')}</div></section>`).join('');
    const sources = `<section class="rsec sources"><h2>Sources and limits</h2><p class="small">Built by Like Polling from its own daily records of open data. Wikipedia page views: Wikimedia Foundation (wikimedia.org), per country, rounded up by Wikimedia for privacy. News topics and countries: The GDELT Project (gdeltproject.org), counted from worldwide online news. Ideas are written by AI (Google Gemini) and can contain mistakes. YouTube and news headlines are not part of the report; see them free on <a href="/">likepolling.com</a>.</p></section>`;
    $('report').innerHTML = head + shared + body + GLOSSARY + sources + (data.sample ? getYours : '');
    $('print').addEventListener('click', () => window.print());
    show('report');
    window.scrollTo(0, 0);
  }

  // ---- start ----
  fillPickers();
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('key').value.trim();
    const countries = $('pick').hidden ? '' : [$('p1').value, $('p2').value].filter(Boolean).join(',');
    if (countries) localStorage.setItem('lp_report_countries', countries);
    const choice = $('pick-e').hidden ? undefined : { subject: $('e1').value.trim(), peers: ['e2', 'e3', 'e4'].map((id) => $(id).value.trim()).filter(Boolean) };
    if (choice && !choice.subject) { error(`Type the ${$('pe-kind').textContent} for your report.`); return; }
    open({ key, countries: countries || String(localStorage.getItem('lp_report_countries') || ''), choice });
  });

  if (params.has('sample')) return openSample();
  const saved = hash.get('k') ? { key: hash.get('k'), instance: hash.get('i') || '' } : store.get('lp_report');
  if (saved && saved.key) return open({ key: saved.key, instance: saved.instance || '', countries: String(localStorage.getItem('lp_report_countries') || '') });
  show('access');
})();
