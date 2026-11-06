// /report: opens an Extended Country, Artist or Company Report (artist/company: renderEntity). ?sample=BR-PT is free; otherwise the buyer pastes the
// license key from their receipt (Lemon Squeezy or Gumroad) once, and this browser remembers it (localStorage only).
(function () {
  'use strict';
  const COUNTRIES = ['AR', 'AU', 'BD', 'BE', 'BR', 'CA', 'CL', 'CO', 'DE', 'DZ', 'EC', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE', 'IN', 'IQ', 'IT', 'JP', 'KE',
    'KR', 'MA', 'MX', 'MY', 'NG', 'NL', 'PE', 'PH', 'PK', 'PL', 'PT', 'SA', 'TH', 'TR', 'TW', 'UA', 'US', 'VN', 'ZA'];
  // Language: the site switcher (assets/i18n.js) picks it; report text comes from assets/report-i18n.js.
  const LANG_ID = () => (window.LP_I18N && window.LP_I18N.lang) || 'en';
  const loc = () => (LANG_ID() === 'pt' ? 'pt-BR' : LANG_ID());
  const RDICT = window.LP_REPORT_DICT || {};
  const L = (en, v = {}) => {
    const l = LANG_ID();
    const s = (l === 'pt-PT' && RDICT['pt-PT'] && RDICT['pt-PT'][en]) || (RDICT[l === 'pt-PT' ? 'pt' : l] || {})[en] || en;
    return s.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : v[k]));
  };
  const dn = {};
  const display = (type, code) => { try { return (dn[type + loc()] ||= new Intl.DisplayNames([loc()], { type })).of(code) || code; } catch { return code; } };
  const name = (c) => display('region', c);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  const num = (n) => Number(n || 0).toLocaleString(loc());
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
          $('pick-e').dataset.kind = kind;
          $('pe-msg').textContent = kind === 'artist' ? 'Pick your report\'s artist. This is set once per key.' : 'Pick your report\'s company. This is set once per key.';
          $('pe-l').textContent = kind === 'artist' ? 'Artist' : 'Company or brand';
          $('e1').placeholder = kind === 'artist' ? 'e.g. Anitta' : 'e.g. Nike';
          const pre = store.get(`lp_report_choice_${kind}`);
          if (pre && pre.subject) {
            if (!$('e1').value) $('e1').value = pre.subject;
            if (!body.choice) return open({ ...body, choice: { subject: String(pre.subject).slice(0, 120), peers: [] } });
          }
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
      const dl = params.get('dl');
      if (dl === 'pptx' || dl === 'xlsx') { const b = $('report').querySelector(`[data-ex="${dl}"]`); if (b) b.click(); }
    } catch (err) {
      show('access');
      error(err.message || 'Couldn\'t load the sample.');
    }
  }

  // ---- rendering ----
  const empty = () => `<p class="muted small">${L('Not enough saved data yet.')}</p>`;
  const utc = (d, o) => new Date(`${d}T00:00:00Z`).toLocaleDateString(loc(), { ...o, timeZone: 'UTC' });
  const dshort = (d) => utc(d, { day: 'numeric', month: 'short' });
  const dlong = (d) => utc(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : num(n));
  const nice = (m) => { const p = 10 ** Math.floor(Math.log10(m || 1)); return Math.ceil(m / p / (m / p > 5 ? 2 : 1)) * p * (m / p > 5 ? 2 : 1); };

  // Line chart of one daily series, peak marked. Plain SVG so it prints into the PDF.
  function lineChart(points, what) {
    if (points.length < 2) return empty();
    const W = 600, H = 210, LM = 44, R = 14, T = 16, B = 30;
    const max = nice(Math.max(...points.map((p) => p.value)));
    const x = (i) => LM + (i * (W - LM - R)) / (points.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const peak = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0);
    const grid = [0, max / 2, max].map((v) => `<line x1="${LM}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${LM - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('');
    const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${dshort(points[i].day)}</text>`).join('');
    const px = x(peak), anchor = px > W - 120 ? 'end' : px < LM + 80 ? 'start' : 'middle';
    return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(what)} per day">${grid}${ticks}
      <polygon points="${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}" class="area"/><polyline points="${line}" class="ln"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === peak ? 4.5 : 2.5}" class="${i === peak ? 'pk' : 'dot'}"/>`).join('')}
      <text x="${px}" y="${y(points[peak].value) - 9}" text-anchor="${anchor}" class="pkl">${L('Peak: {n}', { n: num(points[peak].value) })}</text></svg></figure>`;
  }

  function spark(series) {
    if (!series || series.length < 2) return '';
    const max = Math.max(...series) || 1, W = 96, H = 24;
    const pts = series.map((v, i) => `${((i * W) / (series.length - 1)).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }

  // Small visuals for the "At a glance" cards.
  const ring = (p, color = '#b0000e') => {
    const r = 15, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, p || 0));
    return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" class="rb"/><circle cx="20" cy="20" r="${r}" class="rf" style="stroke:${color}" stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`;
  };
  const area = (series) => {
    if (!series || series.length < 2) return '';
    const max = Math.max(...series) || 1, W = 120, H = 30;
    const pts = series.map((v, i) => `${((i * W) / (series.length - 1)).toFixed(1)},${(H - 1 - (v / max) * (H - 4)).toFixed(1)}`).join(' ');
    return `<svg class="karea" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,${H} ${pts} ${W},${H}"/><polyline points="${pts}"/></svg>`;
  };
  const meter = (p) => `<i class="meter" style="--w:${Math.max(2, Math.min(100, p || 0)).toFixed(1)}%" aria-hidden="true"></i>`;
  const cols = (vals, hi) => { const max = Math.max(...vals) || 1; return `<span class="kcols" aria-hidden="true">${vals.map((v, i) => `<i class="${i === hi ? 'hi' : ''}" style="--h:${Math.max(6, (v / max) * 100).toFixed(0)}%"></i>`).join('')}</span>`; };
  const kcard = (n, label, sub, viz) => `<div class="kpi">${viz ? `<div class="kviz">${viz}</div>` : ''}<b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

  // Ranked bars: label and number on top, bar under it, extra line below.
  const rank = (items, val, label, extra) => {
    if (!items || !items.length) return empty();
    const max = Math.max(...items.map(val)) || 1;
    return `<ol class="rank">${items.map((it) => `<li><div class="rl"><span>${label(it)}</span><b>${num(val(it))}</b></div><i style="--w:${Math.max(2, (val(it) / max) * 100).toFixed(1)}%"></i>${extra ? `<div class="rx">${extra(it)}</div>` : ''}</li>`).join('')}</ol>`;
  };
  const wikiLabel = (w) => `<a href="${esc(w.link)}" target="_blank" rel="noopener">${esc(w.title)}</a>`;
  const wikiExtra = (c) => (w) => `${spark(w.series)}<small>${L('{d} of {t} days in the daily top 30 · first seen {day}', { d: w.days, t: c.wikipedia_days.length, day: `<span style="white-space:nowrap">${dshort(w.first_day)}</span>` })}</small>`;

  const sum = (a) => a.reduce((t, n) => t + n, 0);
  function facts(c) {
    const nd = c.news_daily || [];
    const busy = nd.reduce((m, d) => (!m || d.articles > m.articles ? d : m), null);
    const calm = nd.reduce((m, d) => (!m || d.articles < m.articles ? d : m), null);
    const views = sum(c.wikipedia_daily_total || []);
    return { nd, busy, calm, views, top: c.wikipedia[0], partner: c.news_partners[0], f: c.news_focus };
  }

  const oneIn = (p) => (p >= 95 ? L('almost all') : p < 5 ? L('fewer than 1 in 10') : L('{n} in 10', { n: Math.round(p / 10) }));
  const times = (a, b) => (a / (b || 1)).toLocaleString(loc(), { maximumFractionDigits: 1 });
  const TIPS = {
    know: 'A good number always compares: more than what, since when, out of how many? Ask that about every stat you see online.',
    glance: 'One big number means little on its own. Compare it with another country, another week or another brand.',
    line: 'In a line chart, look for spikes, not exact numbers. A spike is a day very different from the rest: check the news for that day.',
    top: 'A page that stays in the top 30 for many days shows lasting interest. A one-day jump is usually a moment, not a trend.',
    rising: 'New entries are early signals. Wait to see if they stay next week before acting on them.',
    topics: 'Percentages show shares, not size. 20% of a big country\'s news can be more articles than 80% of a small one\'s.',
    partners: 'Two countries in the same story doesn\'t mean they get along. It can be trade, sport or a conflict.',
    vs: 'Compare like with like: same days, same source, same measure. Otherwise the comparison lies.',
    langs: 'Where people read is a hint of where fans or customers are, not proof.',
    ctry: 'More days in a country\'s top 30 means steady interest there, not just one viral moment.',
  };
  const tip = (id) => L(TIPS[id]);
  const learn = (id) => `<p class="learn"><b>${L('Learn')}</b> ${esc(tip(id))}</p>`;
  const knowSec = (k) => (k.length ? `<section class="rsec know"><h2>${L('In plain words')}</h2><p class="note">${L('The report in a few easy numbers. The slides after this show the details.')}</p>
    <div class="knows">${k.map((f) => `<div><b>${esc(f.big)}</b><p>${esc(f.line)}</p></div>`).join('')}</div>${learn('know')}</section>` : '');
  function knowCountry(cs) {
    const F = cs.map(facts);
    const ratio = [], peace = [], spike = [], top = [];
    if (cs.length > 1 && F[0].f.articles && F[1].f.articles) {
      const [hi, lo] = F[0].f.articles >= F[1].f.articles ? [0, 1] : [1, 0];
      if (F[hi].f.articles >= 1.2 * F[lo].f.articles) ratio.push({ big: `${times(F[hi].f.articles, F[lo].f.articles)}×`, line: L('{a} was in the news {x}× as much as {b}.', { a: name(cs[hi].country), x: times(F[hi].f.articles, F[lo].f.articles), b: name(cs[lo].country) }) });
    }
    cs.forEach((c, i) => {
      const k = F[i];
      if (k.f.articles && k.f.cooperation_pct != null) peace.push({ big: oneIn(k.f.cooperation_pct), line: L('news stories about {c} were peaceful: talks, deals or aid.', { c: name(c.country) }) });
      if (k.nd.length > 2 && k.busy) {
        const avg = sum(k.nd.map((d) => d.articles)) / k.nd.length;
        if (k.busy.articles >= 1.5 * avg) spike.push({ big: `${times(k.busy.articles, avg)}×`, line: L('On {day}, news about {c} was {x}× a normal day. Something big happened.', { day: dshort(k.busy.day), c: name(c.country), x: times(k.busy.articles, avg) }) });
      }
      if (k.top && k.views) top.push({ big: `${pct(k.top.views, k.views)}%`, line: L('of top-30 views in {c} went to one page: {t}.', { c: name(c.country), t: k.top.title }) });
    });
    return [ratio[0], peace[0], spike[0], top[0], peace[1], spike[1], top[1]].filter(Boolean).slice(0, 3);
  }

  function glance(c) {
    const k = facts(c);
    return `<div class="kpis">${[
      k.views ? kcard(short(k.views), L('Wikipedia views'), L('of the daily top 30 pages, all days added'), area(c.wikipedia_daily_total)) : '',
      k.f.articles ? kcard(short(k.f.articles), L('News articles'), L('about the country, worldwide'), area(k.nd.map((d) => d.articles))) : '',
      k.f.cooperation_pct == null ? '' : kcard(`${k.f.cooperation_pct}%`, L('Peaceful news'), L('talks, deals, aid. The rest is tension or conflict'), ring(k.f.cooperation_pct)),
      k.partner ? kcard(esc(name(k.partner.country)), L('Most in the news with'), L('{n} articles together', { n: num(k.partner.articles) }), meter(pct(k.partner.articles, k.f.articles))) : '',
      k.top ? kcard(esc(k.top.title), L('Most-read page'), L('{n} views', { n: num(k.top.views) }), area(k.top.series)) : '',
      c.wikipedia_rising.length ? kcard(String(c.wikipedia_rising.length), L('New this week'), L('pages that just entered the top 30'), cols(c.wikipedia_rising.map((w) => w.views), 0)) : '',
    ].join('')}</div>`;
  }

  const SECTIONS = [
    ['At a glance', 'The main numbers for the period, explained in the sections below.', glance, 'glance'],
    ['News coverage per day', 'How many news articles worldwide mentioned the country each day. Spikes usually mean a big event.', (c) => {
      const k = facts(c);
      if (!k.nd.length) return empty();
      return `${lineChart(k.nd.map((d) => ({ day: d.day, value: d.articles })), L('News articles'))}<p class="take">${L('Busiest day: {day} with {n} articles', { day: `<b>${dshort(k.busy.day)}</b>`, n: num(k.busy.articles) })}${k.calm.articles ? L(', {x}× the quietest day ({day}, {n})', { x: (k.busy.articles / k.calm.articles).toLocaleString(loc(), { maximumFractionDigits: 1 }), day: dshort(k.calm.day), n: num(k.calm.articles) }) : ''}${L('. Average: {n} a day.', { n: num(Math.round(sum(k.nd.map((d) => d.articles)) / k.nd.length)) })}</p>`;
    }, 'line'],
    ['Wikipedia attention per day', 'Total views of the 30 most-read pages each day. It shows how busy people were looking things up.', (c) => {
      const pts = (c.wikipedia_days || []).map((d, i) => ({ day: d, value: c.wikipedia_daily_total[i] }));
      if (pts.length < 2) return empty();
      const top = c.wikipedia[0];
      return `${lineChart(pts, L('Wikipedia views'))}${top ? `<p class="take">${L('The #1 page, {title}, had {n} views: {p}% of all top-30 views in the period.', { title: `<b>${esc(top.title)}</b>`, n: num(top.views), p: Math.round((top.views / (sum(c.wikipedia_daily_total) || 1)) * 100) })}</p>` : ''}`;
    }, 'line'],
    ['Most-read on Wikipedia', 'Total views over the period. The small line shows that page\'s views day by day.', (c) => (c.wikipedia.length ? rank(c.wikipedia.slice(0, 8), (w) => w.views, wikiLabel, wikiExtra(c)) + `<p class="take">${L('People in {c} cared most about {t}.', { c: esc(name(c.country)), t: `<b>${esc(c.wikipedia[0].title)}</b>` })}</p>` : ''), 'top'],
    ['Rising this week', 'Pages that entered the daily top 30 only in the last 7 days. Often the best early signals.', (c) => (c.wikipedia_rising.length ? rank(c.wikipedia_rising.slice(0, 8), (w) => w.views, wikiLabel, wikiExtra(c)) + `<p class="take">${L('{t} is the newest big interest in {c}.', { c: esc(name(c.country)), t: `<b>${esc(c.wikipedia_rising[0].title)}</b>` })}</p>` : ''), 'rising'],
    ['What the news talks about', 'Share of all news articles about the country, by type of event.', (c) => {
      const f = c.news_focus;
      if (!f.articles) return empty();
      return `<div class="split"><i style="--w:${f.cooperation_pct}%"></i></div><div class="splitl"><span><b>${f.cooperation_pct}%</b> ${L('peaceful')}</span><span><b>${100 - f.cooperation_pct}%</b> ${L('tension or conflict')}</span></div>
        <ul class="bars">${f.topics.map((t) => `<li><span>${esc(L(t.topic))}</span><i style="--w:${Math.max(2, t.pct)}%"></i><b>${t.pct}%</b></li>`).join('')}</ul>
        <p class="take">${L('The most common type was {t}, at {p}% of {n} articles.', { t: `<b>${esc(/^en/.test(LANG_ID()) ? f.topics[0].topic.toLowerCase() : L(f.topics[0].topic))}</b>`, p: f.topics[0].pct, n: num(f.articles) })}</p>`;
    }, 'topics'],
    ['In the news with', 'Countries that appeared in the same news articles most often. A sign of who the country deals with.', (c) => (c.news_partners.length ? rank(c.news_partners, (p) => p.articles, (p) => esc(name(p.country))) + `<p class="take">${L('{p} shows up next to {c} in the news more than any other country.', { c: esc(name(c.country)), p: `<b>${esc(name(c.news_partners[0].country))}</b>` })}</p>` : ''), 'partners'],
    ['Ideas to copy', 'Written each week by AI from the data above. Use them as starting points.', (c) => (c.ideas.length
      ? `<ol class="ideas">${c.ideas.map((i) => `<li><b>${esc(i.title)}</b><p>${esc(i.idea)}</p>${i.based_on ? `<small>${L('Based on: {x}', { x: esc(i.based_on) })}</small>` : ''}</li>`).join('')}</ol>`
      : '')],
  ];

  const terms = () => [
    [L('Views'), L('Times a Wikipedia page was opened from that country. Wikimedia rounds them up a little to protect privacy.')],
    [L('Days in the top 30'), L('On how many recorded days the page was among the country\'s 30 most-read. More days means lasting interest, not a one-day spike.')],
    [L('News articles'), L('Online news articles worldwide that mention the country, counted by The GDELT Project. One article can count for two countries.')],
    [L('Peaceful and tense news'), L('GDELT sorts every news event into 20 types. Talks, deals and aid count as peaceful. Protests and fighting count as tension or conflict.')],
    [L('Period'), `${L('Like Polling has recorded its sources every day since {date}, the day we started.', { date: dlong(STARTED) })} ${L('Each report covers up to the last 30 recorded days.')}`],
  ];
  const glossary = () => `<section class="rsec"><h2>${L('How to read the numbers')}</h2><dl class="gloss">${terms().map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></section>`;

  // ---- artist / company reports: numbers and charts first, one short line each ----
  const langName = (code) => display('language', code);
  const STARTED = '2026-10-24';
  const since = (extra) => `<p class="since"><b>${L('Gathered since day one.')}</b> ${L('Like Polling has recorded its sources every day since {date}, the day we started.', { date: dlong(STARTED) })}${extra ? ` ${L(extra)}` : ''}</p>`;
  const isoDay = (iso) => String(iso).slice(0, 10);
  const dates = (from, to, printed) => `<dl class="dates"><div><dt>${L('Gathered from')}</dt><dd>${dlong(from)}</dd></div><div><dt>${L('Latest data')}</dt><dd>${dlong(to)}</dd></div><div><dt>${L('Printed')}</dt><dd>${dlong(isoDay(printed))}</dd></div></dl>`;
  const getYours = () => `<p class="print-only">${L('Get your own report at {site}. From €18, no sign-up.', { site: '<b>likepolling.com/services</b>' })}</p>`;
  const exportBar = (data, own) => `<div class="actions exports"><span class="exl">${L('Download as')}</span>
    <button class="btn" type="button" data-ex="pdf">PDF</button>
    <button class="btn ghost" type="button" data-ex="pptx">${L('Presentation')}<small>PowerPoint · Keynote · Google Slides</small></button>
    <button class="btn ghost" type="button" data-ex="xlsx">Excel<small>Excel · Google Sheets · Numbers</small></button>
    ${data.sample ? `<a class="btn ghost" href="${own}">${L('Get your own report')}</a>` : ''}</div>`;
  const plainWords = () => $('report').querySelectorAll('.take').forEach((t) => t.insertAdjacentHTML('afterbegin', `<b class="wtm">${L('What this means')}</b>`));
  const ctx = (data, extra) => ({ L, name, langName, num, short, dshort, tip, wtm: L('What this means'), learnL: L('Learn'),
    since: `${L('Gathered since day one.')} ${L('Like Polling has recorded its sources every day since {date}, the day we started.', { date: dlong(STARTED) })}`,
    cta: data.sample ? L('Get your own report at {site}. From €18, no sign-up.', { site: 'likepolling.com/services' }) : '', ...extra });
  const dateList = (from, to, printed) => [[L('Gathered from'), dlong(from)], [L('Latest data'), dlong(to)], [L('Printed'), dlong(isoDay(printed))]];
  let busy = false;
  function wire(data, x) {
    $('report').querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.ex, data, x, b)));
  }
  async function exportAs(kind, data, x, btn) {
    if (kind === 'pdf') return window.print();
    if (busy || !window.LP_EXPORT) return;
    busy = true;
    const was = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = L('Preparing…'); }
    try { await window.LP_EXPORT[kind](data, x); } catch (e) { alert(L('Couldn\'t make the file. Please try again.')); } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = was; }
    }
  }
  const COLORS = ['#b0000e', '#1d1d1f', '#9a9a9a', '#d08a2e'];
  const delta = (p) => (p == null ? '' : `<em class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</em>`);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function multiChart(lines) {
    const days = lines[0].points.map((p) => p.day);
    if (days.length < 2) return empty();
    const W = 600, H = 230, LM = 48, R = 14, T = 16, B = 30;
    const max = nice(Math.max(...lines.flatMap((l) => l.points.map((p) => p.value))));
    const x = (i) => LM + (i * (W - LM - R)) / (days.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const grid = [0, max / 2, max].map((v) => `<line x1="${LM}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${LM - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('');
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
    const artist = data.type === 'artist';
    const plain = (x) => x.replace(/ \([^)]*\)$/, '');
    s.title = plain(s.title);
    const all = [{ ...s, me: true }, ...data.peers.map((p) => ({ ...p, title: plain(p.title) }))].map((p, k) => ({ ...p, color: COLORS[k] }));
    const langTotal = sum(data.languages.map((l) => l.views));
    const abroad = 100 - pct(s.views, langTotal);
    const second = [...all].sort((a, b) => b.views - a.views).find((p) => !p.me);
    const tag = L(`Extended ${kind} Report`);
    document.title = `${s.title} · ${tag} · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? `${L('Free sample')} · ${tag}` : tag}</span>
      <div class="ehead">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}<div><h1>${esc(s.title)}</h1><p class="muted" style="margin:4px 0 0">${esc(s.description)}</p></div></div>
      <p class="muted">${L(artist ? 'Compared with {n} similar artists.' : 'Compared with {n} similar brands.', { n: all.length - 1 })}</p>
      ${dates(data.from, data.to, data.generated_at)}
      ${since('This report also uses Wikimedia\'s public view history.')}
      ${exportBar(data, `/services#${data.type}`)}</header>`;
    const kpis = `<section class="rsec"><h2>${L('At a glance')}</h2><div class="kpis">${[
      kcard(`${short(s.views)}${delta(s.change_pct)}`, L('Wikipedia views'), L('last 30 days, vs the 30 before'), area(s.series.map((d) => d.views))),
      all.length > 1 ? kcard(L('#{r} of {n}', { r: s.rank, n: all.length }), L(artist ? 'Among similar artists' : 'Among similar brands'), L('by views'), cols([...all].sort((a, b) => b.views - a.views).map((p) => p.views), s.rank - 1)) : '',
      kcard(String(s.languages), L('Wikipedia languages'), L('with a page about them'), meter(pct(s.languages, Math.max(...all.map((p) => p.languages))))),
      langTotal ? kcard(`${abroad}%`, L('Read outside English'), L('of {n} views in {k} languages', { n: short(langTotal), k: data.languages.length }), ring(abroad)) : '',
      s.peak ? kcard(dshort(s.peak.day), L('Busiest day'), L('{n} views', { n: num(s.peak.views) }), cols(s.series.map((d) => d.views), s.series.findIndex((d) => d.day === s.peak.day))) : '',
      data.countries.length ? kcard(String(data.countries.length), L('Countries trending'), L('days in a daily top 30')) : '',
    ].join('')}</div>${learn('glance')}</section>`;
    const ratio = (a, b) => (a / (b || 1)).toLocaleString(loc(), { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    const lead = second ? (s.views >= second.views
      ? L('{a} had {x}× the views of {b}.', { a: `<b>${esc(s.title)}</b>`, x: ratio(s.views, second.views), b: esc(second.title) })
      : L('{a} had {x}× the views of {b}.', { a: `<b>${esc(second.title)}</b>`, x: ratio(second.views, s.views), b: esc(s.title) })) : '';
    const trend = `<section class="rsec"><h2>${L('Attention, day by day')}</h2><p class="note">${L('English Wikipedia views per day.')}</p>
      ${multiChart(all.map((p) => ({ label: p.title, points: p.series.map((d) => ({ day: d.day, value: d.views })) })))}${lead ? `<p class="take">${lead}</p>` : ''}${learn('line')}</section>`;
    const growth = [...all].sort((a, b) => (b.change_pct ?? -1e9) - (a.change_pct ?? -1e9));
    const vs = `<section class="rsec"><h2>${L('Side by side')}</h2><p class="note">${L('The same three measures for each.')}</p><div class="vs">
      <div><h3>${L('Views, 30 days')}</h3>${cbars([...all].sort((a, b) => b.views - a.views), (p) => p.views, short)}</div>
      <div><h3>${L('Change vs last month')}</h3>${cbars(growth, (p) => p.change_pct || 0, (v) => `${v >= 0 ? '+' : ''}${v}%`)}</div>
      <div><h3>${L('Languages')}</h3>${cbars([...all].sort((a, b) => b.languages - a.languages), (p) => p.languages, String)}</div>
    </div>${growth[0] && growth[0].change_pct > 0 ? `<p class="take">${L('Fastest growing: {a} ({p}).', { a: `<b>${esc(growth[0].title)}</b>`, p: `${growth[0].change_pct >= 0 ? '+' : ''}${growth[0].change_pct ?? 0}%` })}</p>` : ''}${learn('vs')}</section>`;
    const langs = `<section class="rsec"><h2>${L('Where people read about {s}', { s: esc(s.title) })}</h2><p class="note">${L('Views by Wikipedia language, last 30 days.')}</p>
      ${langTotal ? `<div class="split"><i style="--w:${100 - abroad}%"></i></div><div class="splitl"><span><b>${100 - abroad}%</b> ${esc(langName('en'))}</span><span><b>${abroad}%</b> ${L('other languages')}</span></div>` : ''}
      ${rank(data.languages.slice(0, 10), (l) => l.views, (l) => esc(langName(l.lang)), (l) => `<small>${L('{p}% of all views', { p: pct(l.views, langTotal) })}</small>`)}
      ${data.languages[1] ? `<p class="take">${L('After English, the most readers are in {l}.', { l: `<b>${esc(langName(data.languages[1].lang))}</b>` })}</p>` : ''}${learn('langs')}</section>`;
    const ctry = data.countries.length ? `<section class="rsec"><h2>${L('Trending in countries')}</h2><p class="note">${L('Days the page was in a country\'s daily top 30.')}</p>
      ${rank(data.countries.slice(0, 10), (c) => c.days, (c) => esc(name(c.country)))}<p class="take">${L('{s} is followed most in {c}.', { s: esc(s.title), c: `<b>${esc(name(data.countries[0].country))}</b>` })}</p>${learn('ctry')}</section>` : '';
    const srcText = `${L('Wikipedia page views and pages: Wikimedia Foundation (wikimedia.org), open data.')} ${L(data.peers_chosen ? 'Comparisons chosen by the buyer.' : 'Similar pages picked by Wikipedia\'s "more like this" search.')} ${L('No YouTube or news data.')}`;
    const sources = `<section class="rsec sources"><h2>${L('Sources')}</h2><p class="small">${srcText}</p></section>`;
    const know = [];
    if (s.change_pct) know.push({ big: `${s.change_pct > 0 ? '+' : '−'}${Math.abs(s.change_pct)}%`, line: L(s.change_pct > 0 ? 'more Wikipedia views for {s} than the month before.' : 'fewer Wikipedia views for {s} than the month before.', { s: s.title }) });
    if (langTotal && data.languages.length > 1) know.push({ big: oneIn(abroad), line: L('readers of {s} used a language other than English.', { s: s.title }) });
    if (second && s.views >= second.views && s.views >= 1.2 * second.views) know.push({ big: `${times(s.views, second.views)}×`, line: L('{s} had {x}× the views of {b}, the next most-viewed.', { s: s.title, x: times(s.views, second.views), b: second.title }) });
    else if (second) know.push({ big: L('#{r} of {n}', { r: s.rank, n: all.length }), line: L(artist ? '{s} among similar artists, by views.' : '{s} among similar brands, by views.', { s: s.title }) });
    const avg = s.series.length > 2 ? sum(s.series.map((d) => d.views)) / s.series.length : 0;
    if (s.peak && avg && s.peak.views >= 1.5 * avg) know.push({ big: `${times(s.peak.views, avg)}×`, line: L('On {day}, views of {s} were {x}× a normal day.', { day: dshort(s.peak.day), s: s.title, x: times(s.peak.views, avg) }) });
    $('report').innerHTML = head + knowSec(know.slice(0, 3)) + kpis + trend + vs + langs + ctry + sources + (data.sample ? getYours() : '');
    plainWords();
    wire(data, ctx(data, { know: know.slice(0, 3), tag, title: s.title, subtitle: s.description, dates: dateList(data.from, data.to, data.generated_at), sources: srcText }));
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

  let last = null;
  document.addEventListener('lp:lang', () => { if (last && !$('report').hidden) render(last); });
  function render(data) {
    last = data;
    if (data.type === 'artist' || data.type === 'company') return renderEntity(data);
    const cs = data.countries;
    const title = cs.map((c) => name(c.country)).join(' vs ');
    const allDays = [...new Set(cs.flatMap((c) => (c.wikipedia_days || []).concat((c.news_daily || []).map((d) => d.day))))].sort();
    const tag = L('Extended Country Report');
    document.title = `${title} · ${tag} · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? `${L('Free sample')} · ${tag}` : tag}</span>
      <h1>${esc(title)}</h1>
      <p class="muted">${L(cs.length > 1 ? 'What these countries read and talked about.' : 'What this country read and talked about.')}${data.expires_at ? ` ${L('Your access lasts until {date}.', { date: dlong(isoDay(data.expires_at)) })}` : ''}</p>
      ${allDays.length ? dates(allDays[0], allDays[allDays.length - 1], data.generated_at) : ''}
      ${since('Every number below comes from those records.')}
      ${exportBar(data, '/services#country')}</header>`;
    let shared = '';
    if (data.shared) {
      const [a, b] = cs.map(facts);
      const two = (va, vb) => [{ title: name(cs[0].country), v: va, me: true, color: COLORS[0] }, { title: name(cs[1].country), v: vb, color: COLORS[1] }];
      const pair = (h, va, vb, fmt) => (va == null || vb == null || (!va && !vb) ? '' : `<div><h3>${h}</h3>${cbars(two(va, vb), (it) => it.v, fmt)}</div>`);
      shared = `<section class="rsec"><h2>${L('Side by side')}</h2><p class="note">${L('The same measures for both countries.')}</p>
        <div class="vs">${pair(L('News articles'), a.f.articles, b.f.articles, short)}${pair(L('Wikipedia views (top 30)'), a.views, b.views, short)}${pair(L('Peaceful news'), a.f.cooperation_pct, b.f.cooperation_pct, (v) => `${v}%`)}</div>
        <p class="take">${L('{n} news articles mentioned both countries together.', { n: `<b>${num(data.shared.articles_together)}</b>` })} ${(() => { const n = data.shared.read_in_both.length; return n === 0 ? L('No page was among the most-read in both countries.') : n === 1 ? L('1 page was among the most-read in both:') : L('{n} pages were among the most-read in both:', { n: `<b>${n}</b>` }); })()}</p>
        ${data.shared.read_in_both.length ? `<ol class="plain">${data.shared.read_in_both.slice(0, 6).map((w) => `<li>${wikiLabel(w)}</li>`).join('')}</ol>` : ''}${learn('vs')}</section>`;
    }
    const body = SECTIONS.map(([h, note, fn, t]) => [h, note, cs.map(fn), t]).filter(([, , out]) => out.some((x) => x && x !== empty()))
      .map(([h, note, out, t]) => `<section class="rsec${/^(Most-read|Rising)/.test(h) ? ' long' : ''}"><h2>${esc(L(h))}</h2><p class="note">${esc(L(note))}</p><div class="cols n${cs.length}">${cs.map((c, i) => `<div class="col">${cs.length > 1 ? `<h3>${esc(name(c.country))}</h3>` : ''}${out[i] || empty()}</div>`).join('')}</div>${t ? learn(t) : ''}</section>`)
    if (shared) body.splice(1, 0, shared);
    const srcText = L(cs.some((c) => c.ideas.length) ? 'Built by Like Polling from its own daily records of open data: Wikipedia page views (Wikimedia Foundation) and news topics and countries (The GDELT Project). Ideas are written by AI (Google Gemini) and can contain mistakes. YouTube and news headlines are not part of the report.' : 'Built by Like Polling from its own daily records of open data: Wikipedia page views (Wikimedia Foundation) and news topics and countries (The GDELT Project). YouTube and news headlines are not part of the report.');
    const sources = `<section class="rsec sources"><h2>${L('Sources and limits')}</h2><p class="small">${srcText}</p></section>`;
    const know = knowCountry(cs);
    $('report').innerHTML = head + knowSec(know) + body.join('') + glossary() + sources + (data.sample ? getYours() : '');
    plainWords();
    wire(data, ctx(data, { know, tag, title, subtitle: L(cs.length > 1 ? 'What these countries read and talked about.' : 'What this country read and talked about.'),
      dates: allDays.length ? dateList(allDays[0], allDays[allDays.length - 1], data.generated_at) : [], sources: srcText, glossary: terms() }));
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
    if (choice && !choice.subject) { error($('pick-e').dataset.kind === 'company' ? 'Type the company for your report.' : 'Type the artist for your report.'); return; }
    open({ key, countries: countries || String(localStorage.getItem('lp_report_countries') || ''), choice });
  });

  if (params.has('sample')) return openSample();
  const saved = hash.get('k') ? { key: hash.get('k'), instance: hash.get('i') || '' } : store.get('lp_report');
  if (saved && saved.key) return open({ key: saved.key, instance: saved.instance || '', countries: String(localStorage.getItem('lp_report_countries') || '') });
  show('access');
})();
