// /report: opens the Country Inspiration Report. ?sample=BR-PT is free; otherwise the buyer pastes the
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
    try {
      const res = await fetch('/api/report?country=BR&compare=PT');
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

  function render(data) {
    const cs = data.countries;
    const title = cs.map((c) => name(c.country)).join(' vs ');
    const days = cs[0].wikipedia_days || [];
    const range = days.length ? `Recorded from ${dshort(days[0])} to ${dlong(days[days.length - 1])} (${days.length} days)` : `The last ${data.period_days} days`;
    document.title = `${title} · Country Inspiration Report · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? 'Free sample' : 'Country Inspiration Report'}</span>
      <h1>${esc(title)}</h1>
      <p class="muted">What ${cs.length > 1 ? 'these countries' : 'this country'} read and talked about. ${range}. Updated ${new Date(data.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.${data.expires_at ? ` Your access lasts until ${new Date(data.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
      <div class="actions"><button class="btn" type="button" id="print">Save as PDF</button>${data.sample ? '<a class="btn ghost" href="/services#report">Get your own report</a>' : ''}</div></header>`;
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
    $('report').innerHTML = head + shared + body + GLOSSARY + sources;
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
    open({ key, countries: countries || String(localStorage.getItem('lp_report_countries') || '') });
  });

  if (params.has('sample')) return openSample();
  const saved = hash.get('k') ? { key: hash.get('k'), instance: hash.get('i') || '' } : store.get('lp_report');
  if (saved && saved.key) return open({ key: saved.key, instance: saved.instance || '', countries: String(localStorage.getItem('lp_report_countries') || '') });
  show('access');
})();
