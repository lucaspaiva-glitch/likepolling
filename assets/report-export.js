// PowerPoint (also opens in Keynote and Google Slides) and Excel versions of a report, built in the buyer's browser.
// Nothing about the buyer is sent anywhere. The two libraries load only when a button is pressed.
(function () {
  const RED = 'B0000E', INK = '1D1D1F', GREY = '6B6B6B', PALE = 'FBEAEC', CARD = 'F5F5F7', PINK = 'E2A3A8';
  const COLORS = ['B0000E', '1D1D1F', '9A9A9A', 'D08A2E'];
  const FONT = 'Arial';
  const sum = (a) => a.reduce((t, n) => t + n, 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cut = (s, n = 38) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  const plain = (x) => String(x).replace(/ \([^)]*\)$/, '');

  const loaded = {};
  const load = (src, global) => (loaded[src] ||= new Promise((ok, no) => {
    if (window[global]) return ok(window[global]);
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => (window[global] ? ok(window[global]) : no(new Error('load')));
    s.onerror = () => { delete loaded[src]; no(new Error('load')); };
    document.head.appendChild(s);
  }));
  const save = (blob, file) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };

  // ---------- the deck: one idea per slide, shared by every report type ----------
  function countryDeck(data, x) {
    const { L, name, num, short, dshort } = x;
    const cs = data.countries;
    const names = cs.map((c) => name(c.country));
    const f = (c) => {
      const nd = c.news_daily || [];
      return { nd, views: sum(c.wikipedia_daily_total || []), top: c.wikipedia[0], partner: c.news_partners[0], focus: c.news_focus,
        busy: nd.reduce((m, d) => (!m || d.articles > m.articles ? d : m), null) };
    };
    const F = cs.map(f);
    const slides = [];
    slides.push({ type: 'kpis', title: L('At a glance'), note: L('The main numbers for the period, explained in the sections below.'),
      groups: cs.map((c, i) => ({ head: cs.length > 1 ? names[i] : '', cards: [
        F[i].views && { n: short(F[i].views), label: L('Wikipedia views'), sub: L('of the daily top 30 pages, all days added') },
        F[i].focus.articles && { n: short(F[i].focus.articles), label: L('News articles'), sub: L('about the country, worldwide') },
        F[i].focus.cooperation_pct != null && { n: `${F[i].focus.cooperation_pct}%`, label: L('Peaceful news'), sub: L('talks, deals, aid. The rest is tension or conflict') },
        F[i].partner && { n: name(F[i].partner.country), label: L('Most in the news with'), sub: L('{n} articles together', { n: num(F[i].partner.articles) }) },
        F[i].top && { n: cut(F[i].top.title, 26), label: L('Most-read page'), sub: L('{n} views', { n: num(F[i].top.views) }) },
        c.wikipedia_rising.length && { n: String(c.wikipedia_rising.length), label: L('New this week'), sub: L('pages that just entered the top 30') },
      ].filter(Boolean) })) });
    if (data.shared && cs.length > 1) {
      const pair = (head, a, b, fmt) => (a == null || b == null || (!a && !b) ? null : { head, kind: 'bar', labels: names, series: [{ name: head, values: [a, b] }], fmt, vary: true });
      const both = data.shared.read_in_both;
      slides.push({ type: 'charts', title: L('Side by side'), note: L('The same measures for both countries.'),
        charts: [pair(L('News articles'), F[0].focus.articles, F[1].focus.articles), pair(L('Wikipedia views (top 30)'), F[0].views, F[1].views), pair(L('Peaceful news'), F[0].focus.cooperation_pct, F[1].focus.cooperation_pct, 'pct')].filter(Boolean),
        take: `${L('{n} news articles mentioned both countries together.', { n: num(data.shared.articles_together) })} ${both.length === 0 ? L('No page was among the most-read in both countries.') : `${both.length === 1 ? L('1 page was among the most-read in both:') : L('{n} pages were among the most-read in both:', { n: both.length })} ${both.slice(0, 2).map((w) => cut(w.title, 30)).join(', ')}${both.length > 2 ? '…' : ''}`}` });
    }
    const days = (pick) => [...new Set(cs.flatMap((c) => pick(c).map((p) => p.day)))].sort();
    const lineSlide = (title, note, pick, take) => {
      const ds = days(pick);
      if (ds.length < 2) return;
      slides.push({ type: 'charts', title, note, charts: [{ kind: 'line', labels: ds.map(dshort), series: cs.map((c, i) => { const m = new Map(pick(c).map((p) => [p.day, p.value])); return { name: names[i], values: ds.map((d) => m.get(d) || 0) }; }) }], take });
    };
    lineSlide(L('News coverage per day'), L('How many news articles worldwide mentioned the country each day. Spikes usually mean a big event.'),
      (c) => (c.news_daily || []).map((d) => ({ day: d.day, value: d.articles })),
      F.map((k, i) => (k.busy ? `${cs.length > 1 ? `${names[i]}: ` : ''}${L('Busiest day: {day} with {n} articles', { day: dshort(k.busy.day), n: num(k.busy.articles) })}` : '')).filter(Boolean).join('   ·   '));
    lineSlide(L('Wikipedia attention per day'), L('Total views of the 30 most-read pages each day. It shows how busy people were looking things up.'),
      (c) => (c.wikipedia_days || []).map((d, i) => ({ day: d, value: c.wikipedia_daily_total[i] })));
    const perCountry = (title, note, list, label, val, take) => {
      const charts = cs.map((c, i) => { const it = list(c).slice(0, 8); return it.length ? { head: cs.length > 1 ? names[i] : '', kind: 'bar', horizontal: true, labels: it.map(label), series: [{ name: title, values: it.map(val) }] } : null; });
      if (charts.some(Boolean)) slides.push({ type: 'charts', title, note, charts: charts.map((c) => c || { head: '', empty: true }), take });
    };
    const each = (list, line) => cs.map((c) => (list(c)[0] ? line(c, list(c)[0]) : '')).filter(Boolean).join('   ·   ');
    perCountry(L('Most-read on Wikipedia'), L('Total views over the period.'), (c) => c.wikipedia, (w) => cut(w.title), (w) => w.views,
      each((c) => c.wikipedia, (c, w) => L('People in {c} cared most about {t}.', { c: name(c.country), t: w.title })));
    perCountry(L('Rising this week'), L('Pages that entered the daily top 30 only in the last 7 days. Often the best early signals.'), (c) => c.wikipedia_rising, (w) => cut(w.title), (w) => w.views,
      each((c) => c.wikipedia_rising, (c, w) => L('{t} is the newest big interest in {c}.', { c: name(c.country), t: w.title })));
    perCountry(L('Searched on Google'), L('Searches that suddenly grew on Google in the country (Google Trends). The numbers are Google\'s rough estimates.'), (c) => (c.searches ? c.searches.top : []), (q) => cut(q.query), (q) => q.traffic,
      each((c) => (c.searches ? c.searches.top : []), (c, q) => L('The biggest search in {c} was {q}, with about {n} searches.', { c: name(c.country), q: q.query, n: num(q.traffic) })));
    if (cs.some((c) => c.news_focus.articles)) {
      slides.push({ type: 'charts', title: L('Peaceful and tense news'), note: L('GDELT sorts every news event into 20 types. Talks, deals and aid count as peaceful. Protests and fighting count as tension or conflict.'),
        charts: cs.map((c, i) => (c.news_focus.articles ? { head: cs.length > 1 ? names[i] : '', kind: 'doughnut', labels: [L('peaceful'), L('tension or conflict')], series: [{ name: names[i], values: [c.news_focus.cooperation_pct, 100 - c.news_focus.cooperation_pct] }] } : { head: '', empty: true })) });
      perCountry(L('What the news talks about'), L('Share of all news articles about the country, by type of event.'), (c) => (c.news_focus.articles ? c.news_focus.topics : []), (t) => L(t.topic), (t) => t.pct, null);
      slides[slides.length - 1].charts.forEach((ch) => { ch.fmt = 'pct'; });
    }
    perCountry(L('In the news with'), L('Countries that appeared in the same news articles most often. A sign of who the country deals with.'), (c) => c.news_partners, (p) => name(p.country), (p) => p.articles,
      each((c) => c.news_partners, (c, q) => L('{p} shows up next to {c} in the news more than any other country.', { c: name(c.country), p: name(q.country) })));
    if (cs.some((c) => (c.holidays || []).length)) {
      slides.push({ type: 'list', title: L('Holidays coming up'), note: L('National public holidays in the next months. Good dates to plan campaigns around.'),
        groups: cs.map((c, i) => ({ head: cs.length > 1 ? names[i] : '', items: (c.holidays || []).map((h) => ({ title: `${dshort(h.day)} · ${h.local_name}`, text: h.name !== h.local_name ? h.name : '' })) })),
        take: each((c) => c.holidays || [], (c, h) => L('Next holiday in {c}: {h} on {d}.', { c: name(c.country), h: h.local_name, d: dshort(h.day) }).replace(/\.\.$/, '.')) });
    }
    if (cs.some((c) => c.ideas.length)) {
      slides.push({ type: 'list', title: L('Ideas to copy'), note: L('Written each week by AI from the data above. Use them as starting points.'),
        groups: cs.map((c, i) => ({ head: cs.length > 1 ? names[i] : '', items: c.ideas.slice(0, 5).map((it) => ({ title: it.title, text: it.idea })) })) });
    }
    const years = [...new Set(cs.flatMap((c) => (c.gdp || []).map((g) => g.year)))].sort();
    if (years.length > 1) {
      const yc = (head, k, fmt, scale = 1) => ({ head, kind: 'bar', labels: years.map(String), fmt,
        series: cs.map((c, i) => { const m = new Map((c.gdp || []).map((g) => [g.year, g[k]])); return { name: names[i], values: years.map((y) => (m.get(y) == null ? 0 : Math.round((m.get(y) / scale) * 10) / 10)) }; }) });
      const at = slides.findIndex((sl) => sl.title === L('Side by side'));
      slides.splice((at >= 0 ? at : 0) + 1, 0, { type: 'charts', title: L('The economy'), note: L('Yearly figures from the World Bank. The newest year is usually last year.'),
        charts: [yc(L('GDP, US$ billions'), 'usd', null, 1e9), yc(L('GDP per person, US$'), 'per_person'), yc(L('Growth after inflation'), 'growth_pct', 'pct1')], take: x.econTake || '' });
    }
    slides.push({ type: 'text', title: L('How to read the numbers'), terms: x.glossary, foot: x.sources });
    return { slides, title: names.join(' vs '), file: `like-polling-${cs.map((c) => c.country.toLowerCase()).join('-')}-report` };
  }

  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  function sponsoredSlide(slides, people, title, L) {
    const rows = people.slice(0, 10);
    slides.push({ type: 'charts', title: L('People it sponsors'), note: L('Athletes and stars who name {s} as a sponsor on Wikipedia, ranked by English Wikipedia views, last 30 days.', { s: title }),
      charts: [{ kind: 'bar', horizontal: true, labels: rows.map((p) => cut(plain(p.title), 26)), series: [{ name: L('Views, 30 days'), values: rows.map((p) => p.views) }] }],
      take: L('{a} is the most-read of them, with {n} views.', { a: plain(rows[0].title), n: rows[0].views.toLocaleString() }) });
  }

  function statesSlide(slides, data, title, x) {
    const st = data.states || {};
    const cs = ['US', 'BR'].filter((c) => st[c] && st[c].length);
    if (!cs.length) return;
    slides.push({ type: 'charts', title: x.L('Top states'), note: x.L('Google searches by state, last 30 days. 100 is the state where it is searched most for its size.'),
      charts: cs.map((c) => ({ head: x.name(c), kind: 'bar', horizontal: true, labels: st[c].slice(0, 8).map((r) => cut(r.name, 22)), series: [{ name: x.name(c), values: st[c].slice(0, 8).map((r) => r.value) }] })),
      take: cs.map((c) => x.L('{s} is searched most in {r}, {c}.', { s: title, r: st[c][0].name, c: x.name(c) })).join(' ') });
  }

  // Brand without a Wikipedia page: kpis, the people it sponsors, their attention, its category.
  function brandDeck(data, x) {
    const { L, short, dshort } = x;
    const s = data.subject, ppl = data.people || [], f = data.field;
    const slides = [];
    const total = sum(ppl.map((p) => p.views));
    slides.push({ type: 'kpis', title: L('At a glance'), groups: [{ head: '', cards: [
      s.website && { n: host(s.website), label: L('Website'), sub: '' },
      ppl.length && { n: String(ppl.length), label: L('Sponsored people'), sub: L('named on Wikipedia') },
      total && { n: short(total), label: L('Their Wikipedia views'), sub: L('last 30 days, all added') },
      f && { n: plain(f.ranked[0].title), label: L('Category leader'), sub: x.fieldName },
    ].filter(Boolean) }] });
    if (ppl.length) sponsoredSlide(slides, ppl, s.title, L);
    const ds = ppl.length ? ppl[0].series.map((d) => d.day) : [];
    if (ds.length > 1) slides.push({ type: 'charts', title: L('Attention, day by day'), note: L('English Wikipedia views per day.'),
      charts: [{ kind: 'line', labels: ds.map(dshort), series: ppl.slice(0, 4).map((p) => { const m = new Map(p.series.map((d) => [d.day, d.views])); return { name: plain(p.title), values: ds.map((d) => m.get(d) || 0) }; }) }] });
    if (f) slides.push({ type: 'charts', title: L('Top in its field'), note: L('{f}: the {n} biggest pages in this Wikipedia category, ranked by English Wikipedia views, last 30 days.', { f: x.fieldName, n: f.compared }),
      charts: [{ kind: 'bar', horizontal: true, labels: f.ranked.map((p) => cut(plain(p.title), 26)), series: [{ name: L('Views, 30 days'), values: f.ranked.map((p) => p.views) }] }],
      take: L('{a} leads {f} with {p}% of the attention.', { a: plain(f.ranked[0].title), f: x.fieldName, p: f.share_pct }) });
    statesSlide(slides, data, s.title, x);
    slides.push({ type: 'text', title: L('Sources'), foot: x.sources });
    return { slides, title: s.title, file: `like-polling-brand-${s.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-report` };
  }

  function entityDeck(data, x) {
    if (data.brand) return brandDeck(data, x);
    const { L, num, short, dshort, langName, name } = x;
    const artist = data.type === 'artist';
    const s = { ...data.subject, title: plain(data.subject.title) };
    const all = [{ ...s, me: true }, ...data.peers.map((p) => ({ ...p, title: plain(p.title) }))];
    const langTotal = sum(data.languages.map((l) => l.views));
    const abroad = 100 - pct(s.views, langTotal);
    const slides = [];
    slides.push({ type: 'kpis', title: L('At a glance'), groups: [{ head: '', cards: [
      { n: `${short(s.views)}${s.change_pct == null ? '' : ` ${s.change_pct >= 0 ? '▲' : '▼'} ${Math.abs(s.change_pct)}%`}`, label: L('Wikipedia views'), sub: L('last 30 days, vs the 30 before') },
      data.field ? { n: L('#{r} of {n}', { r: data.field.rank, n: data.field.compared }), label: L('In its field'), sub: x.fieldName }
        : all.length > 1 && { n: L('#{r} of {n}', { r: s.rank, n: all.length }), label: L(artist ? 'Among similar people' : 'Among similar brands'), sub: L('by views') },
      { n: String(s.languages), label: L('Wikipedia languages'), sub: L('with a page about them') },
      langTotal && { n: `${abroad}%`, label: L('Read outside English'), sub: L('of {n} views in {k} languages', { n: short(langTotal), k: data.languages.length }) },
      s.peak && { n: dshort(s.peak.day), label: L('Busiest day'), sub: L('{n} views', { n: num(s.peak.views) }) },
      data.countries.length && { n: String(data.countries.length), label: L('Countries trending'), sub: L('days in a daily top 100') },
    ].filter(Boolean) }] });
    if (data.field) {
      const fl = data.field;
      const rows = [...fl.ranked, ...(fl.ranked.some((p) => p.me) ? [] : [{ title: data.subject.title, views: s.views, me: true }])];
      slides.push({ type: 'charts', title: L('Top in its field'), note: L('{f}: the {n} biggest pages in this Wikipedia category, ranked by English Wikipedia views, last 30 days.', { f: x.fieldName, n: fl.compared }),
        charts: [{ kind: 'bar', horizontal: true, labels: rows.map((p) => cut(plain(p.title), 26)), series: [{ name: L('Views, 30 days'), values: rows.map((p) => p.views) }] }], take: x.fieldTake || '' });
    }
    const sp = data.sponsors || [];
    if (sp.length) slides.push({ type: 'list', title: L('Sponsors'), note: L('Brands named as {s}\'s sponsors on Wikipedia.', { s: s.title }),
      groups: [{ head: '', items: sp.map((x) => ({ title: x.name, text: x.website ? host(x.website) : '' })) }], take: L(sp.length === 1 ? '{s} has 1 sponsor named on Wikipedia.' : '{s} has {n} sponsors named on Wikipedia.', { s: s.title, n: sp.length }) });
    if ((data.sponsored || []).length) sponsoredSlide(slides, data.sponsored, s.title, L);
    if (data.business) {
      const yrs = data.business.years, u = x.bizUnit || 1e9;
      const yc = (head, k) => ({ head, kind: 'bar', labels: yrs.map((y) => String(y.year)), series: [{ name: head, values: yrs.map((y) => (y[k] == null ? 0 : Math.round((y[k] / u) * 10) / 10)) }] });
      slides.push({ type: 'charts', title: L('How the business is doing'), note: x.bizNote || '', charts: [yc(x.bizHeads[0], 'revenue'), yc(x.bizHeads[1], 'profit')], take: x.bizTake || '' });
    }
    const ds = s.series.map((d) => d.day);
    if (ds.length > 1) {
      slides.push({ type: 'charts', title: L('Attention, day by day'), note: L('English Wikipedia views per day.'),
        charts: [{ kind: 'line', labels: ds.map(dshort), series: all.map((p) => { const m = new Map(p.series.map((d) => [d.day, d.views])); return { name: p.title, values: ds.map((d) => m.get(d) || 0) }; }) }] });
    }
    if (all.length > 1) {
      const by = (k) => [...all].sort((a, b) => (b[k] ?? -1e9) - (a[k] ?? -1e9));
      const bar = (head, k, fmt) => { const it = by(k); return { head, kind: 'bar', horizontal: true, labels: it.map((p) => cut(p.title, 24)), series: [{ name: head, values: it.map((p) => p[k] || 0) }], fmt }; };
      const g = by('change_pct')[0];
      slides.push({ type: 'charts', title: L('Side by side'), note: L('The same three measures for each.'),
        charts: [bar(L('Views, 30 days'), 'views'), bar(L('Change vs last month'), 'change_pct', 'pct'), bar(L('Languages'), 'languages')],
        take: g.change_pct > 0 ? L('Fastest growing: {a} ({p}).', { a: g.title, p: `+${g.change_pct}%` }) : '' });
    }
    if (langTotal) {
      const top = data.languages.slice(0, 8);
      slides.push({ type: 'charts', title: L('Where people read about {s}', { s: s.title }), note: L('Views by Wikipedia language, last 30 days.'),
        charts: [{ head: '', kind: 'doughnut', labels: [langName('en'), L('other languages')], series: [{ name: s.title, values: [100 - abroad, abroad] }] },
          { head: '', kind: 'bar', horizontal: true, labels: top.map((l) => langName(l.lang)), series: [{ name: L('Wikipedia views'), values: top.map((l) => l.views) }], wide: 2 }],
        take: data.languages[1] ? L('After English, the most readers are in {l}.', { l: langName(data.languages[1].lang) }) : '', learn: x.tip ? x.tip('langs') : '' });
    }
    if (data.countries.length) {
      const top = data.countries.slice(0, 10);
      slides.push({ type: 'charts', title: L('Trending in countries'), note: L('Days the page was in a country\'s daily top 100.'),
        charts: [{ kind: 'bar', horizontal: true, labels: top.map((c) => name(c.country)), series: [{ name: L('Countries trending'), values: top.map((c) => c.days) }] }],
        take: L('{s} is followed most in {c}.', { s: s.title, c: name(top[0].country) }) });
    }
    if ((data.trends || []).length) {
      const top = data.trends.slice(0, 10);
      slides.push({ type: 'charts', title: L('Trending on Google'), note: L('Days {s} was among the trending Google searches in each country (Google Trends).', { s: s.title }),
        charts: [{ kind: 'bar', horizontal: true, labels: top.map((t) => name(t.country)), series: [{ name: L('Days trending'), values: top.map((t) => t.days) }] }],
        take: top.length === 1 ? L('{s} was a trending Google search in {c}.', { s: s.title, c: name(top[0].country) }) : L('{s} was a trending Google search in {n} countries.', { s: s.title, n: data.trends.length }) });
    }
    statesSlide(slides, data, s.title, x);
    slides.push({ type: 'text', title: L('Sources'), foot: x.sources });
    return { slides, title: s.title, file: `like-polling-${data.type}-${s.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-report` };
  }

  const TIP_OF = ['Searched on Google:searches', 'Holidays coming up:holidays', 'Trending on Google:searches', 'Top in its field:field', 'The economy:gdp', 'How the business is doing:biz', 'At a glance:glance', 'News coverage per day:line', 'Wikipedia attention per day:line', 'Attention, day by day:line', 'Most-read on Wikipedia:top', 'Rising this week:rising',
    'Peaceful and tense news:topics', 'What the news talks about:topics', 'In the news with:partners', 'Side by side:vs', 'Languages:langs', 'Trending in countries:ctry'];
  const deckOf = (data, x) => {
    const d = data.type === 'artist' || data.type === 'company' ? entityDeck(data, x) : countryDeck(data, x);
    if (!x.tip) return d;
    const tips = new Map(TIP_OF.map((t) => { const [k, v] = t.split(':'); return [x.L(k), v]; }));
    d.slides.forEach((sl) => { if (tips.has(sl.title)) sl.learn = x.tip(tips.get(sl.title)); });
    if (x.know && x.know.length) d.slides.unshift({ type: 'know', title: x.L('In plain words'), note: x.L('The report in a few easy numbers. The slides after this show the details.'), items: x.know, learn: x.tip('know') });
    return d;
  };

  // ---------- PowerPoint ----------
  async function pptx(data, x) {
    const PptxGenJS = await load('/assets/vendor/pptxgenjs-4.0.1.bundle.js', 'PptxGenJS');
    const d = deckOf(data, x);
    const p = new PptxGenJS();
    p.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in, 16:9
    p.title = `${d.title} · ${x.tag}`;
    p.company = 'Like Polling';
    p.author = 'Like Polling';
    p.theme = { headFontFace: FONT, bodyFontFace: FONT };
    p.defineSlideMaster({ title: 'LP', background: { color: 'FFFFFF' },
      objects: [{ rect: { x: 0.6, y: 0.5, w: 0.55, h: 0.07, fill: { color: RED } } },
        { text: { text: `Like Polling · ${d.title}`, options: { x: 0.6, y: 6.95, w: 9, h: 0.3, fontFace: FONT, fontSize: 10, color: GREY } } }],
      slideNumber: { x: 12.15, y: 6.95, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: GREY, align: 'right' } });

    // Cover
    const c = p.addSlide();
    c.background = { color: RED };
    c.addText(x.tag.toUpperCase(), { x: 0.8, y: 0.8, w: 11.7, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: 'FFFFFF', charSpacing: 2 });
    c.addText(d.title, { x: 0.8, y: 1.5, w: 11.7, h: 1.5, fontFace: FONT, fontSize: 48, bold: true, color: 'FFFFFF', valign: 'top', fit: 'shrink' });
    if (x.subtitle) c.addText(x.subtitle, { x: 0.8, y: 3.05, w: 11.7, h: 0.6, fontFace: FONT, fontSize: 18, color: 'FFFFFF' });
    x.dates.forEach(([k, v], i) => {
      c.addShape(p.ShapeType.roundRect, { x: 0.8 + i * 3.95, y: 4.1, w: 3.75, h: 1.0, fill: { color: 'FFFFFF', transparency: 88 }, line: { color: 'FFFFFF', transparency: 60 }, rectRadius: 0.12 });
      c.addText([{ text: k.toUpperCase(), options: { fontSize: 11, bold: true, charSpacing: 1, breakLine: true } }, { text: v, options: { fontSize: 20, bold: true } }],
        { x: 0.95 + i * 3.95, y: 4.15, w: 3.5, h: 0.9, fontFace: FONT, color: 'FFFFFF', valign: 'middle' });
    });
    c.addText(x.since, { x: 0.8, y: 5.45, w: 11.7, h: 0.8, fontFace: FONT, fontSize: 14, color: 'FFFFFF' });
    c.addText('likepolling.com', { x: 0.8, y: 6.75, w: 6, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: 'FFFFFF' });

    const head = (sl, s) => {
      sl.addText(s.title, { x: 0.6, y: 0.65, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 30, bold: true, color: INK, fit: 'shrink' });
      if (s.note) sl.addText(s.note, { x: 0.6, y: 1.32, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 13, color: GREY, valign: 'top' });
      let yb = 6.8;
      if (s.learn) {
        yb -= 0.5;
        sl.addText([{ text: `${x.learnL.toUpperCase()}   `, options: { bold: true, color: RED, fontSize: 10, charSpacing: 1 } }, { text: s.learn, options: { color: GREY, fontSize: 11 } }],
          { x: 0.6, y: yb, w: 12.1, h: 0.42, fontFace: FONT, valign: 'middle', fit: 'shrink' });
      }
      if (s.take) {
        yb -= 0.58;
        sl.addShape(p.ShapeType.rect, { x: 0.6, y: yb, w: 0.06, h: 0.5, fill: { color: RED }, line: { color: RED } });
        sl.addText([{ text: `${x.wtm.toUpperCase()}   `, options: { bold: true, color: RED, fontSize: 10, charSpacing: 1 } }, { text: s.take, options: { color: INK, fontSize: 12 } }],
          { x: 0.66, y: yb, w: 12.04, h: 0.5, fontFace: FONT, fill: { color: 'FBF6F6' }, margin: [0, 10, 0, 10], valign: 'middle', fit: 'shrink' });
      }
      return yb - 0.12;
    };
    const fmtCode = (f) => (f === 'pct' ? '0"%"' : f === 'pct1' ? '0.0"%"' : '#,##0');
    const chart = (sl, ch, X, Y, W, H) => {
      if (ch.head) { sl.addText(ch.head.toUpperCase(), { x: X, y: Y, w: W, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: RED, charSpacing: 1 }); Y += 0.4; H -= 0.4; }
      if (ch.empty) return;
      const base = { x: X, y: Y, w: W, h: H, fontFace: FONT, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelColor: GREY, valAxisLabelColor: GREY,
        catAxisLineShow: false, valAxisLineShow: false, legendFontFace: FONT, legendFontSize: 11, legendColor: INK };
      const rows = ch.series.map((s) => ({ name: s.name, labels: ch.labels, values: s.values }));
      if (ch.kind === 'line') {
        sl.addChart(p.ChartType.line, rows, { ...base, chartColors: COLORS, lineSize: 2.25, lineDataSymbol: 'none', valAxisLabelFormatCode: '#,##0', valGridLine: { color: 'ECECEC', size: 0.75 }, catGridLine: { style: 'none' },
          catAxisLabelFrequency: Math.max(1, Math.ceil(ch.labels.length / 8)), showLegend: rows.length > 1, legendPos: 'b' });
      } else if (ch.kind === 'doughnut') {
        sl.addChart(p.ChartType.doughnut, rows, { ...base, chartColors: [RED, PINK], holeSize: 62, showPercent: true, showValue: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 13, dataLabelFontBold: true, showLegend: true, legendPos: 'b' });
      } else {
        const many = ch.labels.length;
        sl.addChart(p.ChartType.bar, rows, { ...base, barDir: ch.horizontal ? 'bar' : 'col', chartColors: ch.vary || rows.length > 1 ? COLORS : [RED], barGapWidthPct: many > 4 ? 45 : 80,
          catAxisOrientation: ch.horizontal ? 'maxMin' : 'minMax', valAxisHidden: true, valGridLine: { style: 'none' }, showValue: many * rows.length <= 12, dataLabelFormatCode: fmtCode(ch.fmt), dataLabelFontSize: 10, dataLabelColor: INK,
          dataLabelPosition: 'outEnd', catAxisLabelFontSize: many > 8 ? 9 : 10, showLegend: rows.length > 1, legendPos: 'b' });
      }
    };
    d.slides.forEach((s) => {
      const sl = p.addSlide({ masterName: 'LP' });
      const top = 1.95, bottom = head(sl, s);
      if (s.type === 'know') {
        const n = s.items.length, gap = 0.35, cw = (12.1 - gap * (n - 1)) / n, ch = Math.min(3.6, bottom - top);
        s.items.forEach((k, i) => {
          const cx = 0.6 + i * (cw + gap);
          sl.addShape(p.ShapeType.roundRect, { x: cx, y: top, w: cw, h: ch, fill: { color: PALE }, line: { color: PALE }, rectRadius: 0.12 });
          sl.addText([{ text: k.big, options: { fontSize: 40, bold: true, color: RED, breakLine: true } }, { text: k.line, options: { fontSize: 17, color: INK } }],
            { x: cx + 0.25, y: top + 0.25, w: cw - 0.5, h: ch - 0.5, fontFace: FONT, valign: 'top', fit: 'shrink', paraSpaceAfter: 8 });
        });
      } else if (s.type === 'charts') {
        const units = s.charts.reduce((t, ch) => t + (ch.wide || 1), 0);
        const gap = 0.35, W = (12.1 - gap * (s.charts.length - 1)) / units;
        let X = 0.6;
        s.charts.forEach((ch) => { const w = W * (ch.wide || 1); chart(sl, ch, X, top, w, bottom - top); X += w + gap; });
      } else if (s.type === 'kpis') {
        const n = s.groups.length, gap = 0.35, GW = (12.1 - gap * (n - 1)) / n;
        s.groups.forEach((g, gi) => {
          const X0 = 0.6 + gi * (GW + gap);
          let Y0 = top;
          if (g.head) { sl.addText(g.head.toUpperCase(), { x: X0, y: Y0, w: GW, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: RED, charSpacing: 1 }); Y0 += 0.42; }
          const colsN = n > 1 ? 2 : 3, rowsN = Math.ceil(g.cards.length / colsN) || 1, cg = 0.2;
          const cw = (GW - cg * (colsN - 1)) / colsN, chh = Math.min(1.9, (bottom - Y0 - cg * (rowsN - 1)) / rowsN);
          g.cards.forEach((k, i) => {
            const cx = X0 + (i % colsN) * (cw + cg), cy = Y0 + Math.floor(i / colsN) * (chh + cg);
            sl.addShape(p.ShapeType.roundRect, { x: cx, y: cy, w: cw, h: chh, fill: { color: CARD }, line: { color: CARD }, rectRadius: 0.1 });
            sl.addShape(p.ShapeType.rect, { x: cx + 0.2, y: cy + 0.2, w: 0.35, h: 0.05, fill: { color: RED }, line: { color: RED } });
            sl.addText([{ text: k.n, options: { fontSize: n > 1 ? 22 : 28, bold: true, color: INK, breakLine: true } }, { text: k.label, options: { fontSize: 12, bold: true, color: INK, breakLine: true } }, { text: k.sub || '', options: { fontSize: 10, color: GREY } }],
              { x: cx + 0.12, y: cy + 0.3, w: cw - 0.24, h: chh - 0.38, fontFace: FONT, valign: 'top', fit: 'shrink' });
          });
        });
      } else if (s.type === 'list') {
        const n = s.groups.length, gap = 0.35, GW = (12.1 - gap * (n - 1)) / n;
        s.groups.forEach((g, gi) => {
          const runs = [];
          if (g.head) runs.push({ text: g.head.toUpperCase(), options: { fontSize: 12, bold: true, color: RED, breakLine: true, paraSpaceAfter: 6 } });
          g.items.forEach((it, i) => { runs.push({ text: `${i + 1}. ${it.title}`, options: { fontSize: 13, bold: true, color: INK, breakLine: true } }); runs.push({ text: it.text, options: { fontSize: 11, color: GREY, breakLine: true, paraSpaceAfter: 8 } }); });
          sl.addText(runs, { x: 0.6 + gi * (GW + gap), y: top, w: GW, h: bottom - top, fontFace: FONT, valign: 'top', fit: 'shrink' });
        });
      } else {
        const runs = (s.terms || []).flatMap(([t, dd]) => [{ text: t, options: { fontSize: 14, bold: true, color: INK, breakLine: true } }, { text: dd, options: { fontSize: 12, color: GREY, breakLine: true, paraSpaceAfter: 10 } }]);
        if (runs.length) sl.addText(runs, { x: 0.6, y: top, w: 12.1, h: 3.4, fontFace: FONT, valign: 'top', fit: 'shrink' });
        sl.addText(s.foot, { x: 0.6, y: runs.length ? 5.5 : top, w: 12.1, h: 1.2, fontFace: FONT, fontSize: 11, color: GREY, valign: 'top' });
      }
    });
    if (x.cta) {
      const e = p.addSlide();
      e.background = { color: RED };
      e.addText(x.cta, { x: 0.8, y: 2.6, w: 11.7, h: 1.6, fontFace: FONT, fontSize: 30, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
    }
    const blob = await p.write({ outputType: 'blob' });
    save(blob, `${d.file}.pptx`);
  }

  // ---------- Excel ----------
  async function xlsx(data, x) {
    const write = await load('/assets/vendor/write-excel-file-4.1.1.min.js', 'writeXlsxFile');
    const { L, name, langName } = x;
    const H = (v) => ({ value: v, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#B0000E' });
    const day = (iso) => ({ value: new Date(`${iso}T00:00:00Z`), format: 'yyyy-mm-dd' });
    const n = (v) => (v == null ? null : { value: Number(v), format: '#,##0' });
    const p100 = (v) => (v == null ? null : { value: Number(v) / 100, format: '0%' });
    const link = (v) => (v ? { value: v } : null);
    const sheets = [];
    const sheet = (title, rows, widths) => { if (rows.length > 1) sheets.push({ sheet: cut(String(title).replace(/[[\]:*?/\\]/g, ' '), 31).replace(/…$/, ''), data: rows, columns: widths.map((w) => ({ width: w })), stickyRowsCount: 1 }); };
    const about = [[H(L('Report')), H(x.tag)], [L('Name'), x.title], ...x.dates.map(([k, v]) => [k, v]), [L('Sources'), x.sources], ['', ''], [x.since, ''],
      ...(x.know && x.know.length ? [['', ''], [H(L('In plain words')), H('')], ...x.know.map((k) => [k.big, k.line])] : [])];
    const statesSheet = () => sheet(L('Top states'), [[L('Country'), L('State'), L('Interest (0-100)')].map(H),
      ...Object.entries(data.states || {}).flatMap(([c, list]) => list.map((r) => [name(c), r.name, n(r.value)]))], [18, 28, 16]);
    const sponsoredSheet = (people) => sheet(L('People it sponsors'), [[L('Rank'), L('Name'), L('Views, 30 days'), L('Change vs last month'), L('Link')].map(H),
      ...(people || []).map((p, i) => [i + 1, plain(p.title), n(p.views), p100(p.change_pct), link(p.link)])], [8, 30, 16, 22, 50]);
    if (data.brand) {
      sheets.push({ sheet: cut(L('Summary'), 31), data: [...about, ...(data.subject.website ? [[L('Website'), data.subject.website]] : [])], columns: [{ width: 22 }, { width: 70 }] });
      sponsoredSheet(data.people);
      statesSheet();
      if (data.field) sheet(L('Top in its field'), [[L('Rank'), L('Name'), L('Views, 30 days'), L('Change vs last month')].map(H),
        ...data.field.ranked.map((p, i) => [i + 1, plain(p.title), n(p.views), p100(p.change_pct)])], [8, 34, 16, 22]);
      sheet(L('Trending on Google'), [[L('Country'), L('Days trending')].map(H), ...(data.trends || []).map((t) => [name(t.country), n(t.days)])], [24, 16]);
    } else if (data.type === 'artist' || data.type === 'company') {
      const all = [data.subject, ...data.peers];
      sheet(L('Sponsors'), [[L('Name'), L('Website'), L('Link')].map(H), ...(data.sponsors || []).map((x) => [x.name, link(x.website), link(x.link)])], [30, 40, 50]);
      sponsoredSheet(data.sponsored);
      statesSheet();
      sheets.push({ sheet: cut(L('Summary'), 31), data: about, columns: [{ width: 22 }, { width: 70 }] });
      sheet(L('Side by side'), [[L('Rank'), L('Name'), L('Views, 30 days'), L('Previous 30 days'), L('Change vs last month'), L('Wikipedia languages'), L('Link')].map(H),
        ...[...all].sort((a, b) => b.views - a.views).map((p, i) => [i + 1, plain(p.title), n(p.views), n(p.previous), p100(p.change_pct), n(p.languages), link(p.link)])], [8, 30, 16, 18, 22, 20, 50]);
      const ds = data.subject.series.map((s) => s.day);
      const maps = all.map((p) => new Map(p.series.map((s) => [s.day, s.views])));
      if (data.field) sheet(L('Top in its field'), [[L('Rank'), L('Name'), L('Views, 30 days'), L('Change vs last month')].map(H),
        ...data.field.ranked.map((p, i) => [i + 1, plain(p.title), n(p.views), p100(p.change_pct)])], [8, 34, 16, 22]);
      if (data.business) sheet(L('How the business is doing'), [[L('Year'), L('Sales, US$'), L('Profit, US$')].map(H), ...data.business.years.map((y) => [y.year, n(y.revenue), n(y.profit)])], [8, 22, 22]);
      sheet(L('Attention, day by day'), [[L('Day'), ...all.map((p) => plain(p.title))].map(H), ...ds.map((d) => [day(d), ...maps.map((m) => n(m.get(d) || 0))])], [14, ...all.map(() => 20)]);
      const total = sum(data.languages.map((l) => l.views));
      sheet(L('Languages'), [[L('Language'), L('Code'), L('Page title'), L('Views'), L('Share')].map(H), ...data.languages.map((l) => [langName(l.lang), l.lang, l.title, n(l.views), p100(pct(l.views, total))])], [22, 8, 34, 14, 10]);
      sheet(L('Trending on Google'), [[L('Country'), L('Days trending'), L('Approx. searches')].map(H), ...(data.trends || []).map((t) => [name(t.country), n(t.days), n(t.traffic)])], [24, 16, 18]);
      sheet(L('Trending in countries'), [[L('Country'), L('Days in the daily top 100')].map(H), ...data.countries.map((c) => [name(c.country), n(c.days)])], [24, 22]);
    } else {
      const cs = data.countries;
      const names = cs.map((c) => name(c.country));
      sheets.push({ sheet: cut(L('Summary'), 31), data: about, columns: [{ width: 22 }, { width: 70 }] });
      const facts = cs.map((c) => ({ views: sum(c.wikipedia_daily_total || []), f: c.news_focus, partner: c.news_partners[0], top: c.wikipedia[0] }));
      sheet(L('At a glance'), [[L('Measure'), ...names].map(H),
        [L('Wikipedia views (top 30)'), ...facts.map((k) => n(k.views))],
        [L('News articles'), ...facts.map((k) => n(k.f.articles))],
        [L('Peaceful news'), ...facts.map((k) => p100(k.f.cooperation_pct))],
        [L('Most in the news with'), ...facts.map((k) => (k.partner ? name(k.partner.country) : null))],
        [L('Most-read page'), ...facts.map((k) => (k.top ? k.top.title : null))],
        [L('New this week'), ...cs.map((c) => n(c.wikipedia_rising.length))],
        ...(data.shared ? [[L('Articles about both countries'), n(data.shared.articles_together)]] : [])], [34, ...names.map(() => 24)]);
      const daily = (title, pick) => {
        const ds = [...new Set(cs.flatMap((c) => pick(c).map((q) => q.day)))].sort();
        const maps = cs.map((c) => new Map(pick(c).map((q) => [q.day, q.value])));
        sheet(title, [[L('Day'), ...names].map(H), ...ds.map((d) => [day(d), ...maps.map((m) => n(m.has(d) ? m.get(d) : null))])], [14, ...names.map(() => 18)]);
      };
      daily(L('News coverage per day'), (c) => (c.news_daily || []).map((d) => ({ day: d.day, value: d.articles })));
      daily(L('Wikipedia attention per day'), (c) => (c.wikipedia_days || []).map((d, i) => ({ day: d, value: c.wikipedia_daily_total[i] })));
      const pages = (title, pick) => sheet(title, [[L('Country'), L('Rank'), L('Page'), L('Views'), L('Days in the daily top 30'), L('First seen'), L('Link')].map(H),
        ...cs.flatMap((c, ci) => pick(c).map((w, i) => [names[ci], i + 1, w.title, n(w.views), n(w.days), w.first_day ? day(w.first_day) : null, link(w.link)]))], [18, 7, 40, 14, 22, 13, 60]);
      pages(L('Most-read on Wikipedia'), (c) => c.wikipedia);
      pages(L('Rising this week'), (c) => c.wikipedia_rising);
      sheet(L('What the news talks about'), [[L('Country'), L('Topic'), L('Share')].map(H),
        ...cs.flatMap((c, ci) => (c.news_focus.articles ? [[names[ci], L('Peaceful news'), p100(c.news_focus.cooperation_pct)], ...c.news_focus.topics.map((t) => [names[ci], L(t.topic), p100(t.pct)])] : []))], [18, 30, 10]);
      sheet(L('The economy'), [[L('Country'), L('Year'), L('GDP, US$'), L('GDP per person, US$'), L('Growth after inflation')].map(H),
        ...cs.flatMap((c, ci) => (c.gdp || []).map((g) => [names[ci], g.year, n(g.usd), n(g.per_person), g.growth_pct == null ? null : { value: g.growth_pct / 100, format: '0.0%' }]))], [18, 8, 22, 22, 22]);
      sheet(L('In the news with'), [[L('Country'), L('Partner country'), L('Articles together')].map(H),
        ...cs.flatMap((c, ci) => c.news_partners.map((q) => [names[ci], name(q.country), n(q.articles)]))], [18, 22, 18]);
      sheet(L('Searched on Google'), [[L('Country'), L('Search'), L('Approx. searches'), L('Days trending')].map(H),
        ...cs.flatMap((c, ci) => (c.searches ? c.searches.top : []).map((q) => [names[ci], q.query, n(q.traffic), n(q.days)]))], [18, 40, 18, 16]);
      sheet(L('Holidays coming up'), [[L('Country'), L('Date'), L('Holiday'), L('Name in English')].map(H),
        ...cs.flatMap((c, ci) => (c.holidays || []).map((h) => [names[ci], day(h.day), h.local_name, h.name]))], [18, 14, 34, 34]);
      sheet(L('Ideas to copy'), [[L('Country'), L('Title'), L('Idea'), L('Based on')].map(H),
        ...cs.flatMap((c, ci) => c.ideas.map((i) => [names[ci], i.title, i.idea, i.based_on || '']))], [18, 30, 80, 40]);
    }
    const blob = await write(sheets).toBlob();
    save(blob, `${deckOf(data, x).file}.xlsx`);
  }

  window.LP_EXPORT = { pptx, xlsx, deck: deckOf };
})();
