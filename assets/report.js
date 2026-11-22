// /report: opens an Extended Country, People (type 'artist') or Company Report (artist/company: renderEntity). ?sample=BR-PT is free; otherwise the buyer pastes the
// Gumroad license key from their receipt once, and this browser remembers it (localStorage only).
(function () {
  'use strict';
  const COUNTRIES = ['BR', 'DE', 'ES', 'FR', 'GB', 'IN', 'JP', 'KR', 'MX', 'PT', 'UA', 'US'];
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
    $('pe-ok').hidden = true;
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
          $('pe-msg').textContent = kind === 'artist' ? 'Pick your report\'s person. This is set once per key.' : 'Pick your report\'s company. This is set once per key.';
          $('pe-l').textContent = kind === 'artist' ? 'Person' : 'Company or brand';
          $('e1').placeholder = kind === 'artist' ? 'e.g. Anitta, John John Florence' : 'e.g. Nike';
          const pre = store.get(`lp_report_choice_${kind}`);
          if (pre && pre.subject) {
            if (!$('e1').value) $('e1').value = pre.subject;
            if (!body.choice) return open({ ...body, choice: { subject: String(pre.subject).slice(0, 120), peers: [] } });
          }
          const opt = (o, me) => `<button type="button" class="pe-opt${me ? ' me' : ''}" data-t="${esc(o.title)}"${o.brand ? ' data-b="1"' : ''}>${o.image ? `<img src="${esc(o.image)}" alt="">` : `<i>${esc(o.title[0])}</i>`}<span><b>${esc(o.title)}</b><small>${esc(o.description || '')}</small></span>${me ? `<em>${esc(L('Yes, this one'))} ›</em>` : ''}</button>`;
          const others = data.options || [];
          if (data.confirm || others.length) {
            $('pe-ok').innerHTML = (data.confirm ? opt(data.confirm, true) : '') + (others.length ? `<p class="small muted">${esc(L(data.confirm ? 'Or one of these:' : 'Did you mean:'))}</p>${others.map((o) => opt(o)).join('')}` : '');
            $('pe-ok').hidden = false;
            $('e1').blur();
            $('pe-ok').onclick = (e) => {
              const b = e.target.closest('.pe-opt');
              if (!b) return;
              $('e1').value = b.dataset.t;
              open({ ...body, choice: { subject: b.dataset.t, peers: (body.choice && body.choice.peers) || [], confirm: true, ...(b.dataset.b ? { brand: true } : {}) } });
            };
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
  // "1 in N news stories" for the latest month with a share (points from lib/news-coverage.js indexed()).
  function newsOneIn(pts, who) {
    const p = (pts || []).filter((d) => d.share > 0).pop();
    return p ? L('In {m}, 1 in {n} news stories worldwide mentioned {s}.', { m: monthName(p.day.slice(0, 7)), n: num(Math.round(100 / p.share)), s: who }) : '';
  }

  function lineChart(points, what, tick = dshort) {
    if (points.length < 2) return empty();
    const W = 600, H = 210, LM = 44, R = 14, T = 16, B = 30;
    const max = nice(Math.max(...points.map((p) => p.value)));
    const x = (i) => LM + (i * (W - LM - R)) / (points.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const peak = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0);
    const grid = [0, max / 2, max].map((v) => `<line x1="${LM}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${LM - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('');
    // Monthly charts: a dashed line and label at each new year, and the last month at the right end.
    const years = tick === monthShort ? points.map((p, i) => i).filter((i) => i > 0 && points[i].day.slice(5, 7) === '01') : [];
    const ticks = years.length
      ? years.map((i) => `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B + 4}" class="g yr"/>${x(points.length - 1) - x(i) >= 75 ? `<text x="${x(i) + 3}" y="${H - 8}" text-anchor="start">${points[i].day.slice(0, 4)}</text>` : ''}`).join('')
        + (x(years[0]) - LM >= 36 ? `<text x="${LM + 3}" y="${H - 8}" text-anchor="start">${points[0].day.slice(0, 4)}</text>` : '')
        + `<text x="${x(points.length - 1)}" y="${H - 8}" text-anchor="end">${tick(points[points.length - 1].day)}</text>`
      : [0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${tick(points[i].day)}</text>`).join('');
    const px = x(peak), anchor = px > W - 120 ? 'end' : px < LM + 80 ? 'start' : 'middle';
    return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(what)}">${grid}${ticks}
      <polygon points="${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}" class="area"/><polyline points="${line}" class="ln"/>
      ${points.map((p, i) => (i === peak || points.length <= 40 ? `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === peak ? 4.5 : 2.5}" class="${i === peak ? 'pk' : 'dot'}"/>` : '')).join('')}
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

  const sum = (a) => a.reduce((t, n) => t + n, 0);
  function facts(c) {
    const nd = c.news_daily || [];
    const busy = nd.reduce((m, d) => (!m || d.articles > m.articles ? d : m), null);
    const calm = nd.reduce((m, d) => (!m || d.articles < m.articles ? d : m), null);
    return { nd, busy, calm, partner: c.news_partners[0], f: c.news_focus };
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
  mentions: 'Many articles or posts mean people are talking, not that they like it. Check a few headlines before you act.',
  states: 'State numbers compare shares, not totals: a small state can score 100 when many of its searches are about this.',
  field: 'Compare with real rivals, not with everyone. A small brand can lead its niche and still look tiny next to the giants.',
  searches: 'A search spike shows curiosity, not love. People also search for things they fear or just heard about.',
  holidays: 'On holidays people shop, travel and go online differently. Plan posts a week or two ahead.',
  gdp: 'GDP is the size of a whole economy, not how rich each person is. For that, look at GDP per person.',
  biz: 'Sales are all the money customers paid. Profit is what is left after every cost and tax. High sales with low profit can still be a weak year.',
  };
  const tip = (id) => L(TIPS[id]);
  const learn = () => '';
  const knowSec = (k, inner = '') => (k.length || inner ? `<section class="rsec know"><h2>${L('At a glance')}</h2><p class="note">${L('The main numbers for the period, explained in the sections below.')}</p>
    ${k.length ? `<div class="knows">${k.map((f) => `<div><b>${esc(f.big)}</b><p>${esc(f.line)}</p></div>`).join('')}</div>` : ''}${inner}</section>` : '');
  // The few numbers a marketer acts on: the newest interest, the next holiday, the top page, buying power.
  function knowCountry(cs) {
    const rise = [], hol = [], top = [];
    cs.forEach((c) => {
      const r = c.searches && c.searches.top[0], h = (c.holidays || [])[0];
      if (r) rise.push({ big: `~${short(r.traffic)}`, line: L('{t} was the biggest Google search in {c}.', { c: name(c.country), t: r.query }) });
      if (h) hol.push({ big: dshort(h.day), line: L('Next holiday in {c}: {h} on {d}.', { c: name(c.country), h: h.local_name, d: dshort(h.day) }).replace(/\.\.$/, '.') });
    });
    const pp = cs.map((c) => (c.gdp || []).filter((d) => d.per_person != null).pop());
    let money = null;
    if (cs.length > 1 && pp[0] && pp[1]) {
      const [hi, lo] = pp[0].per_person >= pp[1].per_person ? [0, 1] : [1, 0];
      money = { big: `${times(pp[hi].per_person, pp[lo].per_person)}×`, line: L('GDP per person in {a} is {x}× that of {b}.', { a: name(cs[hi].country), x: times(pp[hi].per_person, pp[lo].per_person), b: name(cs[lo].country) }) };
    }
    return [rise[0], hol[0], rise[1], hol[1], money, top[0], top[1]].filter(Boolean).slice(0, 4);
  }

  function glance(c) {
    const k = facts(c), q = c.searches && c.searches.top[0];
    const g = (c.gdp || []).filter((d) => d.per_person != null).pop();
    return `<div class="kpis">${[
      q ? kcard(esc(q.query), L('Searched on Google'), `~${num(q.traffic)}`) : '',
      k.partner ? kcard(esc(name(k.partner.country)), L('Most in the news with'), L('{n} articles together', { n: num(k.partner.articles) }), meter(pct(k.partner.articles, k.f.articles))) : '',
      g ? kcard(num(Math.round(g.per_person)), L('GDP per person, US$'), String(g.year)) : '',
    ].join('')}</div>`;
  }

  const monthName = (m) => utc(`${m}-01`, { month: 'long', year: 'numeric' });
  const monthShort = (d) => utc(d, { month: 'short', year: 'numeric' });
  const byMonthChart = (pts, label) => (pts && pts.length > 1 ? `<h3>${label}</h3>${lineChart(pts, label, monthShort)}` : '');
  const SECTIONS = [
    ['Since your last snapshot', 'What changed compared with the previous saved snapshot of this report.', (c) => (c.since_last
      ? (c.since_last.same ? `<p class="take">${L('No change in the top topics since {date}.', { date: dlong(c.since_last.day) })}</p>`
        : `<ul class="hol stack">${[['New searches', c.since_last.new_searches], ['Dropped out', c.since_last.gone_searches]].filter(([, l]) => l.length)
          .map(([h, l]) => `<li><b>${L(h)}</b><span>${l.map(esc).join(' · ')}</span></li>`).join('')}</ul><p class="take">${L('Compared with the snapshot of {date}.', { date: dlong(c.since_last.day) })}</p>`)
      : '')],
    ['In the news with', 'Countries that appeared in the same news articles most often. A sign of who the country deals with.', (c) => (c.news_partners.length ? rank(c.news_partners, (p) => p.articles, (p) => esc(name(p.country))) + `<p class="take">${L('{p} shows up next to {c} in the news more than any other country.', { c: esc(name(c.country)), p: `<b>${esc(name(c.news_partners[0].country))}</b>` })}</p>` : ''), 'partners'],
    ['Searched on Google', 'Searches that suddenly grew on Google in the country (Google Trends). The numbers are Google\'s rough estimates.', (c) => (c.searches && c.searches.top.length
      ? rank(c.searches.top.slice(0, 6), (q) => q.traffic, (q) => esc(q.query), c.searches.days > 1 ? (q) => `<small>${L(q.days === 1 ? 'trending on 1 day' : 'trending on {n} days', { n: q.days })}</small>` : null)
        + `<p class="take">${L('The biggest search in {c} was {q}, with about {n} searches.', { c: esc(name(c.country)), q: `<b>${esc(c.searches.top[0].query)}</b>`, n: num(c.searches.top[0].traffic) })}</p>` : ''), 'searches'],
    ['Holidays coming up', 'National public holidays in the next months. Good dates to plan campaigns around.', (c) => (c.holidays && c.holidays.length
      ? `<ul class="hol">${c.holidays.slice(0, 4).map((h) => `<li><b>${dshort(h.day)}</b><span>${esc(h.local_name)}${h.name && h.name !== h.local_name ? ` <small>${esc(h.name)}</small>` : ''}</span></li>`).join('')}</ul>`
        + `<p class="take">${L('Next holiday in {c}: {h} on {d}.', { c: esc(name(c.country)), h: `<b>${esc(c.holidays[0].local_name)}</b>`, d: dshort(c.holidays[0].day) }).replace(/\.\.$/, '.')}</p>` : ''), 'holidays'],
    ['Through time', 'From the Like Polling archive: the top search and news coverage in each month since we started.', (c) => (c.through_time && c.through_time.length
      ? `${byMonthChart(c.news_by_month, L('News share per month, since 2017 (100 = busiest month)'))}${newsOneIn(c.news_by_month, esc(name(c.country))) ? `<p class="take">${newsOneIn(c.news_by_month, esc(name(c.country)))}</p>` : ''}<ul class="hol stack">${c.through_time.slice(-6).reverse().map((m) => `<li><b>${monthName(m.month)}</b><span>${[m.searches[0] && L('Top search: {x}', { x: esc(m.searches[0].query) }), m.news_articles && L('News articles: {n}', { n: num(m.news_articles) }), m.top_story && L('Top story: {x}', { x: `<a href="${esc(m.top_story.link)}" target="_blank" rel="noopener">${esc((m.top_story.title_tr && m.top_story.title_tr[LANG_ID() === 'en-GB' ? 'en' : LANG_ID()]) || m.top_story.title)}</a>` })].filter(Boolean).map((x) => `<small>${x}</small>`).join('')}</span></li>`).join('')}</ul>`
        + `<p class="take">${L('Like Polling has kept a daily record of {c} since {date}. Every new report adds to it.', { c: esc(name(c.country)), date: dlong(STARTED) })}</p>` : '')],
    ['AI builders', "The most-starred new AI project on GitHub each year from a builder in this country.", (c) => (c.ai_builders
      ? `<ul class="hol aip">${c.ai_builders.by_year.map((y) => { if (!y.top) return `<li class="none"><b>${y.year}</b><span>—</span></li>`; const r = y.top, p = r.plain && (r.plain[LANG_ID() === 'en-GB' ? 'en' : LANG_ID()] || r.plain.en); const d = String((p ? p.d : r.description) || '').replace(/:[a-z0-9_+-]+:/g, '').trim(); return `<li><b>${y.year}</b><span><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(p ? p.t : r.full_name.split('/')[1])}</a> <em>★ ${short(r.stars)}</em>${d ? `<small>${esc(d)}</small>` : ''}</span></li>`; }).join('')}</ul>`
        + `<p class="take">${L("Builders who leave their GitHub location empty can't be placed in a country, so some projects may be missing.")}</p>` : '')],
    ['Ideas to copy', 'Written each week by AI from the data above. Use them as starting points.', (c) => (c.ideas.length
      ? `<ol class="ideas">${c.ideas.slice(0, 3).map((i) => `<li><b>${esc(i.title)}</b><p>${esc(i.idea)}</p>${i.based_on ? `<small>${L('Based on: {x}', { x: esc(i.based_on) })}</small>` : ''}</li>`).join('')}</ol>`
      : '')],
  ];

  const terms = () => [
    [L('Searches'), L('Google\'s rough estimate of how many times a trending search was made in that country (Google Trends).')],
    [L('News articles'), L('Online news articles worldwide that mention the country, counted by The GDELT Project. One article can count for two countries.')],
    [L('Period'), `${L('Like Polling has recorded its sources every day since {date}, the day we started.', { date: dlong(STARTED) })} ${L('Each report covers up to the last 30 recorded days.')}`],
  ];
  const glossary = () => `<h3>${L('How to read the numbers')}</h3><dl class="gloss">${terms().map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>`;

  // ---- artist / company reports: numbers and charts first, one short line each ----
  const langName = (code) => display('language', code);
  const STARTED = '2026-10-24';
  const since = (extra) => `<p class="since"><b>${L('Gathered since day one.')}</b> ${L('Like Polling has recorded its sources every day since {date}, the day we started.', { date: dlong(STARTED) })}${extra ? ` ${L(extra)}` : ''}</p>`;
  const isoDay = (iso) => String(iso).slice(0, 10);
  const snapshot = (printed) => `<p class="since snap"><b>${L('A snapshot in time.')}</b> ${L('This report captures {date}. Like Polling keeps a dated copy in its archive, so this moment can be compared with any later one.', { date: dlong(isoDay(printed)) })}</p>`;
  const dates = (from, to, printed) => `${snapshot(printed)}<dl class="dates"><div><dt>${L('Gathered from')}</dt><dd>${dlong(from)}</dd></div><div><dt>${L('Latest data')}</dt><dd>${dlong(to)}</dd></div><div><dt>${L('Printed')}</dt><dd>${dlong(isoDay(printed))}</dd></div></dl>`;
  const exportBar = (data, own) => `<div class="actions exports"><span class="exl">${L('Download as')}</span>
    <button class="btn" type="button" data-ex="pdf">${L('Graphs')}<small>PDF</small></button>
    <button class="btn ghost" type="button" data-ex="pptx">${L('Presentation')}<small>PowerPoint · Keynote · Google Slides</small></button>
    <button class="btn ghost" type="button" data-ex="xlsx">Excel<small>Excel · Google Sheets · Numbers</small></button>
    </div>`;
  const plainWords = () => $('report').querySelectorAll('.take').forEach((t) => t.insertAdjacentHTML('afterbegin', `<b class="wtm">${L('What this means')}</b>`));
  const ctx = (data, extra) => ({ L, name, langName, num, short, dshort, tip, wtm: L('What this means'), learnL: L('Learn'),
    since: `${L('Gathered since day one.')} ${L('Like Polling has recorded its sources every day since {date}, the day we started.', { date: dlong(STARTED) })}`,
    cta: '', ...extra });
  const dateList = (from, to, printed) => [[L('Gathered from'), dlong(from)], [L('Latest data'), dlong(to)], [L('Printed'), dlong(isoDay(printed))]];
  let busy = false;
  function wire(data, x) {
    $('report').querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.ex, data, x, b)));
  }
  const embedded = () => document.documentElement.classList.contains('embed') && parent !== window;
  async function exportAs(kind, data, x, btn) {
    if (busy || !window.LP_EXPORT) { if (embedded()) parent.postMessage({ lp: 'exported', kind, ok: false }, location.origin); return; }
    busy = true;
    let ok = true;
    const was = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = L('Preparing…'); }
    try { await window.LP_EXPORT[kind](data, x); } catch (e) { ok = false; console.error(e); if (!embedded()) alert(L('Couldn\'t make the file. Please try again.')); } finally {
      busy = false;
      if (btn) { btn.disabled = false; btn.innerHTML = was; }
      if (embedded()) parent.postMessage({ lp: 'exported', kind, ok }, location.origin);
    }
  }
  const COLORS = ['#b0000e', '#1d1d1f', '#9a9a9a', '#d08a2e'];
  const delta = (p) => (p == null ? '' : `<em class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</em>`);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function yearBars(cs, key, fmt) {
    const years = [...new Set(cs.flatMap((c) => (c.gdp || []).filter((g) => g[key] != null).map((g) => g.year)))].sort();
    if (years.length < 2) return '';
    const W = 320, H = 190, LM = 4, R = 4, T = 20, B = 22;
    const vals = cs.flatMap((c) => (c.gdp || []).map((g) => g[key] ?? 0));
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1;
    const y = (v) => T + ((H - T - B) * (max - v)) / span;
    const gw = (W - LM - R) / years.length, bw = Math.min(20, (gw - 4) / cs.length);
    const last = years.length - 1;
    const bars = years.map((yr, i) => cs.map((c, k) => {
      const g = (c.gdp || []).find((d) => d.year === yr);
      if (!g || g[key] == null) return '';
      const x = LM + i * gw + (gw - bw * cs.length) / 2 + k * bw;
      return `<rect x="${x.toFixed(1)}" y="${Math.min(y(g[key]), y(0)).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${Math.max(1, Math.abs(y(g[key]) - y(0))).toFixed(1)}" rx="1.5" fill="${COLORS[k]}"/>`
;
    }).join('') + ((last - i) % 2 === 0 ? `<text x="${(LM + i * gw + gw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${yr}</text>` : '')).join('');
    const yr = years[last];
    const latest = cs.map((c, k) => { const g = (c.gdp || []).find((d) => d.year === yr); return g && g[key] != null ? `<span><i style="background:${COLORS[k]}"></i>${fmt(g[key])}</span>` : ''; }).join('');
    return `<figure class="chart ybars"><svg viewBox="0 0 ${W} ${H}" role="img"><line x1="${LM}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="g"/>${bars}</svg><figcaption>${yr}: ${latest}</figcaption></figure>`;
  }

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
    return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${grid}${ticks}${paths}</svg></figure>
      <ul class="legend">${lines.map((l, k) => `<li><i style="background:${COLORS[k]}"></i>${esc(l.label)}</li>`).join('')}</ul>`;
  }

  function cbars(items, val, fmt) {
    const max = Math.max(...items.map((it) => Math.abs(val(it)))) || 1;
    return `<ul class="cbars">${items.map((it) => `<li class="${it.me ? 'me' : ''}"><div class="rl"><span>${esc(it.title)}</span><b>${fmt(val(it))}</b></div><i style="--w:${Math.max(2, (Math.abs(val(it)) / max) * 100).toFixed(1)}%;--c:${it.color}"></i></li>`).join('')}</ul>`;
  }

  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  // A brand with no Wikipedia page of its own: its website, the people who name it as a sponsor, and its category.
  // Top states in the US and Brazil (Google Trends), one column per country.
  const statesSec = (data, title) => {
    const st = data.states || {};
    const cs = ['US', 'BR'].filter((c) => st[c] && st[c].length);
    if (!cs.length) return '';
    const best = cs.map((c) => L('{s} is searched most in {r}, {c}.', { s: esc(title), r: `<b>${esc(st[c][0].name)}</b>`, c: esc(name(c)) })).join(' ');
    return `<section class="rsec"><h2>${L('Top states')}</h2><p class="note">${L('Google searches by state, last 30 days. 100 is the state where it is searched most for its size.')}</p>
      <div class="cols n${cs.length}">${cs.map((c) => `<div class="col"><h3>${esc(name(c))}</h3>${rank(st[c].slice(0, 8), (r) => r.value, (r) => esc(r.name))}</div>`).join('')}</div>
      <p class="take">${best}</p>${learn('states')}</section>`;
  };

  // GDELT gives English country names; map them to codes so they show in the reader's language.
  let byEn = null;
  const cname = (en) => {
    if (!byEn) {
      byEn = new Map();
      const d = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const c = String.fromCharCode(a, b); try { const n = d.of(c); if (n && n !== c) byEn.set(n.toLowerCase(), c); } catch { /* not a region */ } }
      [['united kingdom', 'GB'], ['south korea', 'KR'], ['russia', 'RU'], ['vietnam', 'VN'], ['czech republic', 'CZ'], ['turkey', 'TR']].forEach(([n, c]) => byEn.set(n, c));
    }
    const c = byEn.get(String(en).toLowerCase());
    return c ? name(c) : en;
  };
  const mentionsSec = (data, title) => {
    const m = data.mentions;
    if (!m) return '';
    const nw = m.news, so = m.social;
    const posts = so ? `${num(so.posts)}${so.more ? '+' : ''}` : '';
    const kp = `<div class="kpis">${[
      nw ? kcard(short(nw.articles), L('News articles'), L('last 30 days, worldwide'), area(nw.days.map((d) => d.articles))) : '',
      nw && nw.countries.length ? kcard(esc(cname(nw.countries[0].name)), L('Most news from'), L('{p}% of the articles', { p: nw.countries[0].share })) : '',
      so ? kcard(posts, L('Bluesky posts'), L('public posts, last 30 days')) : '',
      so ? kcard(short(so.likes), L('Likes on those posts'), L('{n} reposts', { n: num(so.reposts) })) : '',
    ].join('')}</div>`;
    const lists = [nw && nw.countries.length ? `<div class="col"><h3>${L('News by country')}</h3>${rank(nw.countries.slice(0, 6), (c) => c.share, (c) => esc(cname(c.name)), (c) => `<small>${L('{p}% of the articles', { p: c.share })}</small>`)}</div>` : '',
      so && so.langs.length ? `<div class="col"><h3>${L('Posts by language')}</h3>${rank(so.langs, (l) => l.posts, (l) => esc(langName(l.lang)))}</div>` : ''].filter(Boolean);
    const take = [nw ? L('{s} was in {n} news articles in 30 days.', { s: esc(title), n: `<b>${num(nw.articles)}</b>` }) : '', so ? L('{n} public Bluesky posts mentioned {s}.', { s: esc(title), n: `<b>${posts}</b>` }) : ''].filter(Boolean).join(' ');
    return `<section class="rsec"><h2>${L('In the news and online')}</h2><p class="note">${L('Counts only, last 30 days: online news worldwide (GDELT) and public posts on Bluesky.')}</p>
      ${kp}${lists.length ? `<div class="cols n${lists.length}">${lists.join('')}</div>` : ''}<p class="take">${take}</p>${learn('mentions')}</section>`;
  };

  // One row per kind of number in a People or Company report: what it is, where it comes from, how to treat it.
  function quality(data) {
    const m = data.mentions || {};
    return [
      data.searches && [L('Google searches'), 'Google Trends', L('Index (0–100)'), L('Last 5 years, week by week')],
      (data.world || []).length && [L('Where people search'), 'Google Trends', L('Index (0–100)'), L('Last 12 months')],
      data.states && [L('Top states'), 'Google Trends', L('Index (0–100)'), L('Last 30 days')],
      (data.trends || []).length && [L('Trending on Google'), `Google Trends, ${L('saved daily by Like Polling')}`, L('Rough estimate'), L('Last 30 days')],
      (data.youtube_yearly || []).length && [L('Views per video on YouTube'), 'YouTube Data API', L('Measured'), L('Yearly')],
      data.releases && [L('Music releases'), 'MusicBrainz (CC0)', L('Public record'), L('Yearly')],
      data.business && [L('How the business is doing'), 'US SEC (EDGAR)', L('Reported by the company'), L('Yearly')],
      m.news && [L('News articles'), 'The GDELT Project', L('Measured'), L('Last 30 days')],
      m.social && [L('Bluesky posts'), 'Bluesky', L('Measured'), L('Last 30 days')],
      data.products && [L('Products on shelves'), 'Open Food Facts (ODbL)', L('Public record'), L('Latest record')],
    ].filter(Boolean);
  }
  const sgnPct = (p) => (p == null ? '—' : `${p > 0 ? '+' : ''}${p}%`);
  const withSources = (html, head, text, gloss = '') => {
    const i = html.lastIndexOf('</section>');
    const foot = `<div class="srcfoot">${gloss}<h3>${L(head)}</h3><p class="small">${text}</p></div>`;
    return i < 0 ? html + `<section class="rsec sources">${foot}</section>` : html.slice(0, i) + foot + html.slice(i);
  };
function productsSec(data, title) {
    const p = data.products;
    if (!p || !p.countries.length) return '';
    const n = `${num(p.products)}${p.more ? '+' : ''}`;
    return `<section class="rsec"><h2>${L('Products on shelves')}</h2><p class="note">${L('Food and drink products listed on Open Food Facts, the open food database, and the countries they are sold in.')}</p>
      <div class="kpis">${kcard(n, L('Products listed'), L('on Open Food Facts'))}${kcard(esc(name(p.countries[0].code)), L('Top country'), L('{n} products', { n: num(p.countries[0].products) }))}</div>
      <h3 class="sub">${L('Products by country')}</h3>${rank(p.countries, (c) => c.products, (c) => esc(name(c.code)))}
      <p class="take">${L('{s} has {n} products listed on Open Food Facts, most of them sold in {c}.', { s: esc(title), n: `<b>${n}</b>`, c: esc(name(p.countries[0].code)) })}</p></section>`;
  }
function releasesSec(data, title) {
    const r = data.releases;
    if (!r || !r.total) return '';
    const t = r.types || {};
    const cards = [kcard(num(r.total), L('Releases'), L('all time')), t.Single ? kcard(num(t.Single), L('Singles'), '') : '', t.Album ? kcard(num(t.Album), L('Albums'), '') : '', t.EP ? kcard(num(t.EP), L('EPs'), '') : ''].join('');
    return `<section class="rsec"><h2>${L('Music releases')}</h2><p class="note">${L('Singles, albums and EPs listed on MusicBrainz, the open music database.')}</p>
      <div class="kpis">${cards}</div><div class="vs n2"><div><h3>${L('Releases per year')}</h3>${yearBars([{ gdp: r.by_year }], 'releases', num)}</div>
      <div><h3>${L('Latest releases')}</h3><ol class="plain">${(r.latest || []).map((x) => `<li><b>${esc(x.title)}</b> <small class="muted">${esc(L(x.type))} · ${/^\d{4}-\d\d-\d\d$/.test(x.date) ? dlong(x.date) : esc(x.date)}</small></li>`).join('')}</ol></div></div></section>`;
  }
  function renderEntity(data) {
    const s = data.subject;
    const artist = data.type === 'artist';
    const all = [{ ...s, me: true }, ...data.peers].map((p, k) => ({ ...p, color: COLORS[k] || '#9a9a9a' }));
    let tag = L(artist ? 'Extended People Report' : 'Extended Company Report');
    const d = String(s.description || '');
    const sub = /\b(club|team)\b/i.test(d) ? 'clubs' : /\b(AI|chatbot|language model|artificial intelligence)\b/i.test(d) ? 'ai' : /politician|president|minister|chancellor|senator|mayor|governor|party leader/i.test(d) ? 'politicians'
      : artist && /footballer|player|athlete|racing driver|boxer|cyclist|swimmer/i.test(d) ? 'athletes' : artist ? 'people' : 'brands';
    const SIM = { people: 'Compared with {n} similar people.', brands: 'Compared with {n} similar brands.', clubs: 'Compared with {n} similar clubs.', politicians: 'Compared with {n} other politicians.', athletes: 'Compared with {n} similar athletes.', ai: 'Compared with {n} similar AI tools.' }[sub];
    if (sub === 'ai') tag = L('Extended AI Report');
    if (sub === 'clubs') tag = L('Extended Club Report');
    const vsTitle = data.peers_chosen && data.peers.length === 1 ? `${s.title} vs ${data.peers[0].title}` : s.title;
    document.title = `${vsTitle} · ${tag} · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? `${L('Free sample')} · ${tag}` : tag}</span>
      <div class="ehead">${s.image ? `<img src="${esc(s.image)}" alt="">` : ''}<div><h1>${esc(vsTitle)}</h1><p class="muted" style="margin:4px 0 0">${esc(s.description)}</p></div></div>
      ${all.length > 1 && !(data.peers_chosen && data.peers.length === 1) ? `<p class="muted">${L(SIM, { n: all.length - 1 })}</p>` : ''}
      ${dates(data.from, data.to, data.generated_at)}
      ${exportBar(data, `/services#${data.type}`)}</header>`;
    const top = (data.world || [])[0];
    const nw = data.mentions && data.mentions.news;
    const months = (s.months || []).slice(-24);
    const kpis = `<div class="kpis">${[
      s.change_pct != null ? kcard(sgnPct(s.change_pct), L('Google searches'), L('last 4 weeks vs the 4 before'), area(months.map((m) => m.value))) : '',
      s.yoy_pct != null ? kcard(sgnPct(s.yoy_pct), L('vs a year ago'), L('same 4 weeks last year')) : '',
      s.share_pct != null ? kcard(`${s.share_pct}%`, L('Share of searches'), L('among these {n}', { n: all.length }), cols(all.map((p) => p.now || 0), 0)) : '',
      s.peak ? kcard(dshort(s.peak.day), L('Busiest week'), s.peak.times ? L('{x}× a normal week', { x: s.peak.times }) : '') : '',
      top ? kcard(esc(name(top.code)), L('Searches most'), L('for its size, last 12 months')) : '',
      nw ? kcard(short(nw.articles), L('News articles'), L('last 30 days, worldwide')) : '',
    ].join('')}</div>`;
    const know = [];
    if (s.change_pct) know.push({ big: sgnPct(s.change_pct), line: L(s.change_pct > 0 ? 'more Google searches for {s} than the 4 weeks before.' : 'fewer Google searches for {s} than the 4 weeks before.', { s: s.title }) });
    if (s.peak && s.peak.times >= 2) know.push({ big: `${s.peak.times}×`, line: L('In the week of {day}, {s} was searched {x}× as much as a normal week.', { day: dlong(s.peak.day), s: s.title, x: s.peak.times }) });
    if (s.share_pct != null && all.length > 1) know.push({ big: `${s.share_pct}%`, line: L('of the Google searches among these {n} were for {s}.', { n: all.length, s: s.title }) });
    if (top) know.push({ big: name(top.code), line: L('searches for {s} the most, for its size.', { s: s.title }) });
    const lines = all.filter((p) => (p.months || []).length > 2).map((p) => ({ label: p.title, points: p.months.map((m) => ({ day: `${m.month}-01`, value: m.value })) }));
    const searchSec = lines.length ? `<section class="rsec"><h2>${L('Searched on Google')}</h2><p class="note">${L('Google searches worldwide, month by month for 5 years. 100 is the busiest week of any of them (Google Trends).')}</p>
      ${lines.length > 1 ? multiChart(lines) : lineChart(lines[0].points, L('Google searches'), monthShort)}
      ${s.yoy_pct != null ? `<p class="take">${L('Compared with the same weeks last year, searches for {s} changed {p}.', { s: `<b>${esc(s.title)}</b>`, p: sgnPct(s.yoy_pct) })}</p>` : ''}</section>` : '';
    const growSec = all.length > 1 ? `<section class="rsec"><h2>${L('Growth and share of searches')}</h2><p class="note">${L('Google searches in the last 4 weeks, compared with the 4 weeks before and the same weeks last year, and each one\'s share among them.')}</p>
      <div class="tight" style="overflow-x:auto"><table class="cmp"><thead><tr><th>${L('Name')}</th><th>${L('Searches now (0-100)')}</th><th>${L('vs 4 weeks before')}</th><th>${L('vs last year')}</th><th>${L('Share of searches')}</th></tr></thead>
      <tbody>${[...all].sort((a, b) => (b.now || 0) - (a.now || 0)).map((p) => `<tr><th>${p.me ? `<b>${esc(p.title)}</b>` : esc(p.title)}</th><td>${p.now ?? '—'}</td><td>${sgnPct(p.change_pct)}</td><td>${sgnPct(p.yoy_pct)}</td><td>${p.share_pct == null ? '—' : `${p.share_pct}%`}</td></tr>`).join('')}</tbody></table></div>
      ${s.share_pct != null ? `<p class="take">${L('{s} had {p}% of the Google searches among these {n}.', { s: `<b>${esc(s.title)}</b>`, p: s.share_pct, n: all.length })}</p>` : ''}</section>` : '';
    const sp = s.spikes || [];
    const spikeSec = sp.length ? `<section class="rsec"><h2>${L('Biggest search moments')}</h2><p class="note">${L('Weeks in the last 12 months when {s} was searched at least twice as much as a normal week.', { s: esc(s.title) })}</p>
      ${rank(sp, (x) => x.value, (x) => `<b>${L('Week of {d}', { d: dlong(x.day) })}</b> · ${L('{x}× a normal week', { x: x.times.toLocaleString(loc()) })}`)}
      <p class="take">${L('The biggest was the week of {d}. Check the news from those days to see why.', { d: `<b>${dlong(sp[0].day)}</b>` })}</p></section>` : '';
    const w = data.world || [];
    const worldSec = w.length ? `<section class="rsec"><h2>${L('Where people search for {s}', { s: esc(s.title) })}</h2><p class="note">${L('Google searches by country, last 12 months. 100 is the country where it is searched most for its size.')}</p>
      ${rank(w.slice(0, 10), (c) => c.value, (c) => esc(name(c.code)))}<p class="take">${L('{s} is searched most in {c}, for its size.', { s: esc(s.title), c: `<b>${esc(name(w[0].code))}</b>` })}</p></section>` : '';
    const b = data.business;
    const unit = b && Math.max(...b.years.map((y) => Math.abs(y.revenue || 0))) >= 1e9 ? 1e9 : 1e6;
    const money = (v) => (v / unit).toLocaleString(loc(), { maximumFractionDigits: 1 });
    const bizHeads = unit === 1e9 ? [L('Sales, US$ billions'), L('Profit, US$ billions')] : [L('Sales, US$ millions'), L('Profit, US$ millions')];
    const bizNote = b ? `${L('Yearly results {s} reports to the US regulator (SEC). Its business year may end in any month.', { s: s.title })}${b.exchange && b.ticker ? ` ${L('Shares trade on {x} as {t}.', { x: b.exchange, t: b.ticker })}` : ''}` : '';
    let bizTake = '';
    if (b) {
      const y0 = b.years[0], y1 = b.years[b.years.length - 1];
      const g = y0.revenue ? Math.round(((y1.revenue - y0.revenue) / Math.abs(y0.revenue)) * 100) : null;
      const t = [];
      if (g != null) t.push(L(g >= 0 ? 'Sales grew {p}% from {a} to {b}.' : 'Sales fell {p}% from {a} to {b}.', { p: Math.abs(g).toLocaleString(loc()), a: y0.year, b: y1.year }));
      if (y1.profit != null && y1.revenue) t.push(y1.profit >= 0 ? L('In {y}, {n} of every 100 dollars of sales was profit.', { y: y1.year, n: Math.round((y1.profit / y1.revenue) * 100) }) : L('In {y}, it lost money.', { y: y1.year }));
      bizTake = t.join(' ');
    }
    const bizSec = b ? `<section class="rsec"><h2>${L('How the business is doing')}</h2><p class="note">${esc(bizNote)}</p>
      <div class="vs n2">${[['revenue', bizHeads[0]], ['profit', bizHeads[1]]].map(([k, h]) => { const c = yearBars([{ gdp: b.years }], k, money); return c ? `<div><h3>${h}</h3>${c}</div>` : ''; }).join('')}</div>
      ${bizTake ? `<p class="take">${esc(bizTake)}</p>` : ''}</section>` : '';
    const tt = data.through_time || [];
    const ttPeak = tt.reduce((m, x) => (!m || x.value > m.value ? x : m), null);
    const timeSec = tt.length > 1 ? `<section class="rsec"><h2>${L('Through time')}</h2><p class="note">${L('How much of the world\'s news mentioned {s} each month, since 2017 (100 = its busiest month).', { s: esc(s.title) })}</p>
      ${lineChart(tt, L('News share'), monthShort)}<p class="take">${newsOneIn(tt, esc(s.title)) || L('It was most in the news in {m}.', { m: monthName(ttPeak.day.slice(0, 7)) })}</p></section>` : '';
    const yt = data.youtube_yearly || [];
    const ytLast = yt.filter((y) => y.year < new Date().getUTCFullYear()).pop();
    const ytSec = yt.length ? `<section class="rsec"><h2>${L('Views per video on YouTube')}</h2><p class="note">${L('Average views per video on the official YouTube channel, by the year each video was posted. Views are counted as of today, so recent years can look lower.')}</p>
      ${rank([...yt].reverse(), (y) => y.avg_views, (y) => String(y.year)).replace('<ol class="rank">', '<ol class="rank years">')}${ytLast ? `<p class="take">${L('In {y}, its videos averaged {n} views each.', { y: ytLast.year, n: `<b>${num(ytLast.avg_views)}</b>` })}</p>` : ''}</section>` : '';
    const gt = data.trends || [];
    const gtr = gt.length ? `<section class="rsec"><h2>${L('Trending on Google')}</h2><p class="note">${L('Days {s} was among the trending Google searches in each country (Google Trends).', { s: esc(s.title) })}</p>
      ${rank(gt.slice(0, 10), (t) => t.days, (t) => esc(name(t.country)))}</section>` : '';
    const qual = quality(data);
    const qualSec = `<section class="rsec"><h2>${L('Sources and data quality')}</h2><p class="note">${L('Where each number comes from, and what kind of number it is. No number in this report was made by AI.')}</p>
      <div class="tight" style="overflow-x:auto"><table class="cmp"><thead><tr><th>${L('What')}</th><th>${L('Source')}</th><th>${L('Type')}</th><th>${L('Covers')}</th></tr></thead><tbody>${qual.map((r) => `<tr><th>${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    const srcText = [L('Google searches: Google Trends.'), data.peers_chosen ? L('Comparisons chosen by the buyer.') : data.peers.length ? L('Similar names: Deezer related artists or Yahoo Finance similar stocks.') : '',
      data.mentions ? L('News: The GDELT Project.') : '', b ? L('Sales and profit: US SEC (EDGAR).') : '', data.releases ? L('Releases: MusicBrainz (CC0).') : '', data.products ? L('Products: Open Food Facts (ODbL).') : '', yt.length ? 'YouTube Data API.' : ''].filter(Boolean).join(' ');
    $('report').innerHTML = head + withSources(knowSec(know.slice(0, 3), kpis) + searchSec + growSec + spikeSec + worldSec + statesSec(data, s.title) + timeSec + bizSec + ytSec + productsSec(data, s.title) + releasesSec(data, s.title) + mentionsSec(data, s.title) + gtr + qualSec, 'Sources', esc(srcText));
    plainWords();
    wire(data, ctx(data, { know: know.slice(0, 3), tag, title: s.title, subtitle: s.description, dates: dateList(data.from, data.to, data.generated_at), sources: srcText, quality: qual, bizNote, bizHeads, bizTake, bizUnit: unit }));
    show('report');
    window.scrollTo(0, 0);
  }

  // Google-style name suggestions for the artist/company fields (from Google Trends).
  ['e1', 'e2', 'e3', 'e4'].forEach((id) => window.LPSuggest($(id), { type: () => $('pick-e').dataset.kind }));

  let last = null;
  document.addEventListener('lp:lang', () => { if (last && !$('report').hidden) render(last); });
  const bn = (v) => num(Math.round(v / 1e9));
  const partnersOf = (cs) => (cs.some((c) => c.news_partners[0]) ? `<p class="take">${cs.filter((c) => c.news_partners[0]).map((c) => L('{p} shows up next to {c} in the news more than any other country.', { c: esc(name(c.country)), p: `<b>${esc(name(c.news_partners[0].country))}</b>` })).join(' ')}</p>` : '');
  function econSec(cs) {
    if (!cs.some((c) => c.gdp && c.gdp.length > 1)) return {};
    const latest = (c, k) => (c.gdp || []).filter((d) => d[k] != null).pop();
    const take = cs.map((c) => { const g = latest(c, 'growth_pct'); return g ? L(g.growth_pct >= 0 ? '{c}\'s economy grew {p}% in {y}.' : '{c}\'s economy shrank {p}% in {y}.', { c: name(c.country), p: Math.abs(g.growth_pct).toLocaleString(loc()), y: g.year }) : ''; }).filter(Boolean);
    const pp = cs.map((c) => latest(c, 'per_person'));
    if (cs.length > 1 && pp[0] && pp[1]) {
      const [hi, lo] = pp[0].per_person >= pp[1].per_person ? [0, 1] : [1, 0];
      take.push(L('GDP per person in {a} is {x}× that of {b}.', { a: name(cs[hi].country), x: times(pp[hi].per_person, pp[lo].per_person), b: name(cs[lo].country) }));
    }
    const charts = [[L('GDP per person, US$'), 'per_person', (v) => num(v)], [L('Growth after inflation'), 'growth_pct', (v) => `${v.toLocaleString(loc())}%`]]
      .map(([h, k, f]) => { const c = yearBars(cs, k, f); return c ? `<div><h3>${h}</h3>${c}</div>` : ''; }).join('');
    const legend = cs.length > 1 ? `<ul class="legend">${cs.map((c, k) => `<li><i style="background:${COLORS[k]}"></i>${esc(name(c.country))}</li>`).join('')}</ul>` : '';
    return { take: take.join(' '), html: `<section class="rsec"><h2>${L('The economy')}</h2><p class="note">${L('Yearly figures from the World Bank. The newest year is usually last year.')}</p>
      <div class="vs n2">${charts}</div>${legend}<p class="take">${esc(take.join(' '))}</p>${partnersOf(cs)}</section>` };
  }

  function render(data) {
    last = data;
    if (data.type === 'artist' || data.type === 'company') return renderEntity(data);
    const cs = data.countries;
    const title = cs.map((c) => name(c.country)).join(' vs ');
    const allDays = [...new Set(cs.flatMap((c) => (c.news_daily || []).map((d) => d.day)))].sort();
    const tag = L('Extended Country Report');
    document.title = `${title} · ${tag} · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? `${L('Free sample')} · ${tag}` : tag}</span>
      <h1>${esc(title)}</h1>
      <p class="muted">${L(cs.length > 1 ? 'What these countries read and talked about.' : 'What this country read and talked about.')}${data.expires_at ? ` ${L('Your access lasts until {date}.', { date: dlong(isoDay(data.expires_at)) })}` : ''}</p>
      ${allDays.length ? dates(allDays[0], allDays[allDays.length - 1], data.generated_at) : ''}
      ${since('Every number below comes from those records.')}
      ${exportBar(data, '/services#country')}</header>`;
    const econ = econSec(cs);
    const body = SECTIONS.filter(([h]) => !(econ.html && h === 'In the news with')).map(([h, note, fn, t]) => [h, note, cs.map(fn), t]).filter(([, , out]) => out.some((x) => x && x !== empty()))
      .map(([h, note, out, t]) => `<section class="rsec${''}"><h2>${esc(L(h))}</h2><p class="note">${esc(L(note))}</p><div class="cols n${cs.length}">${cs.map((c, i) => `<div class="col">${cs.length > 1 ? `<h3>${esc(name(c.country))}</h3>` : ''}${out[i] || empty()}</div>`).join('')}</div>${t ? learn(t) : ''}</section>`)
    if (econ.html) body.splice(body.length - (cs.some((c) => c.ideas.length) ? 1 : 0), 0, econ.html);
    const srcText = L(cs.some((c) => c.ideas.length) ? 'Built by Like Polling from its own daily records of open data: news topics and countries (The GDELT Project). Ideas are written by AI (Google Gemini) and can contain mistakes. YouTube and news headlines are not part of the report.' : 'Built by Like Polling from its own daily records of open data: news topics and countries (The GDELT Project). YouTube and news headlines are not part of the report.') + (econ.html ? ` ${L('GDP figures come from the World Bank\'s open data.')}` : '')
      + (cs.some((c) => c.searches && c.searches.top.length) ? ` ${L('Trending searches: Google Trends.')}` : '') + (cs.some((c) => c.holidays && c.holidays.length) ? ` ${L('Holidays: Nager.Date, open data.')}` : '') + (cs.some((c) => c.ai_builders) ? ` ${L('AI projects: GitHub API.')}` : '');

    const know = knowCountry(cs);
    const glanceCols = `<div class="cols n${cs.length}">${cs.map((c) => `<div class="col">${cs.length > 1 ? `<h3>${esc(name(c.country))}</h3>` : ''}${glance(c)}</div>`).join('')}</div>`;
    $('report').innerHTML = head + withSources(knowSec(know, glanceCols) + body.join(''), 'Sources and limits', srcText, glossary()) ;
    plainWords();
    wire(data, ctx(data, { know, tag, title, subtitle: L(cs.length > 1 ? 'What these countries read and talked about.' : 'What this country read and talked about.'),
      dates: allDays.length ? dateList(allDays[0], allDays[allDays.length - 1], data.generated_at) : [], sources: srcText, glossary: terms(), econTake: econ.take || '' }));
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
    if (choice && choice.subject && $('e1').dataset.picked === choice.subject) choice.confirm = true;
    if (choice && !choice.subject) { error($('pick-e').dataset.kind === 'company' ? 'Type the company for your report.' : 'Type the person for your report.'); return; }
    open({ key, countries: countries || String(localStorage.getItem('lp_report_countries') || ''), choice });
  });

  // Embedded in a search page (/s/…): the page sends the data and asks for downloads; this reports its height.
  if (params.has('embed') && parent !== window) {
    document.documentElement.classList.add('embed');
    const tell = (m) => parent.postMessage(m, location.origin);
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.lp === 'data') render(e.data.data);
      if (e.data.lp === 'export') { const b = $('report').querySelector(`[data-ex="${e.data.kind}"]`); if (b) b.click(); }
    });
    new ResizeObserver(() => tell({ lp: 'height', h: document.body.scrollHeight })).observe(document.body);
    show('loading');
    return tell({ lp: 'ready' });
  }
  if (params.has('sample')) return openSample();
  const saved = hash.get('k') ? { key: hash.get('k'), instance: hash.get('i') || '' } : store.get('lp_report');
  if (saved && saved.key) return open({ key: saved.key, instance: saved.instance || '', countries: String(localStorage.getItem('lp_report_countries') || '') });
  show('access');
})();
