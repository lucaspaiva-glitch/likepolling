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
    if (document.documentElement.classList.contains('embed') && parent !== window) return parent.postMessage({ lp: 'file', blob, name: file }, location.origin);
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
      return { nd, partner: c.news_partners[0], focus: c.news_focus,
        busy: nd.reduce((m, d) => (!m || d.articles > m.articles ? d : m), null) };
    };
    const F = cs.map(f);
    const slides = [];
    slides.push({ type: 'kpis', title: L('At a glance'), note: L('The main numbers for the period, explained in the sections below.'),
      groups: cs.map((c, i) => ({ head: cs.length > 1 ? names[i] : '', cards: [
        c.searches && c.searches.top[0] && { n: cut(c.searches.top[0].query, 26), label: L('Searched on Google'), sub: `~${num(c.searches.top[0].traffic)}` },
        F[i].partner && { n: name(F[i].partner.country), label: L('Most in the news with'), sub: L('{n} articles together', { n: num(F[i].partner.articles) }) },
        (() => { const g = (c.gdp || []).filter((d) => d.per_person != null).pop(); return g && { n: num(Math.round(g.per_person)), label: L('GDP per person, US$'), sub: String(g.year) }; })(),
      ].filter(Boolean) })) });
    const perCountry = (title, note, list, label, val, take) => {
      const charts = cs.map((c, i) => { const it = list(c).slice(0, 6); return it.length ? { head: cs.length > 1 ? names[i] : '', kind: 'bar', horizontal: true, labels: it.map(label), series: [{ name: title, values: it.map(val) }] } : null; });
      if (charts.some(Boolean)) slides.push({ type: 'charts', title, note, charts: charts.map((c) => c || { head: '', empty: true }), take });
    };
    const each = (list, line) => cs.map((c) => (list(c)[0] ? line(c, list(c)[0]) : '')).filter(Boolean).join('   ·   ');
    perCountry(L('Searched on Google'), L('Searches that suddenly grew on Google in the country (Google Trends). The numbers are Google\'s rough estimates.'), (c) => (c.searches ? c.searches.top : []), (q) => cut(q.query), (q) => q.traffic,
      each((c) => (c.searches ? c.searches.top : []), (c, q) => L('The biggest search in {c} was {q}, with about {n} searches.', { c: name(c.country), q: q.query, n: num(q.traffic) })));
    perCountry(L('In the news with'), L('Countries that appeared in the same news articles most often. A sign of who the country deals with.'), (c) => c.news_partners, (p) => name(p.country), (p) => p.articles,
      each((c) => c.news_partners, (c, q) => L('{p} shows up next to {c} in the news more than any other country.', { c: name(c.country), p: name(q.country) })));
    if (cs.some((c) => (c.holidays || []).length)) {
      slides.push({ type: 'list', title: L('Holidays coming up'), note: L('National public holidays in the next months. Good dates to plan campaigns around.'),
        groups: cs.map((c, i) => ({ head: cs.length > 1 ? names[i] : '', items: (c.holidays || []).slice(0, 4).map((h) => ({ title: `${dshort(h.day)} · ${h.local_name}`, text: h.name !== h.local_name ? h.name : '' })) })),
        take: each((c) => c.holidays || [], (c, h) => L('Next holiday in {c}: {h} on {d}.', { c: name(c.country), h: h.local_name, d: dshort(h.day) }).replace(/\.\.$/, '.')) });
    }
    if (cs.some((c) => c.ideas.length)) {
      slides.push({ type: 'list', title: L('Ideas to copy'), note: L('Written each week by AI from the data above. Use them as starting points.'),
        groups: cs.map((c, i) => ({ head: cs.length > 1 ? names[i] : '', items: c.ideas.slice(0, 3).map((it) => ({ title: it.title, text: it.idea })) })) });
    }
    const years = [...new Set(cs.flatMap((c) => (c.gdp || []).map((g) => g.year)))].sort();
    if (years.length > 1) {
      const yc = (head, k, fmt, scale = 1) => ({ head, kind: 'bar', labels: years.map(String), fmt,
        series: cs.map((c, i) => { const m = new Map((c.gdp || []).map((g) => [g.year, g[k]])); return { name: names[i], values: years.map((y) => (m.get(y) == null ? 0 : Math.round((m.get(y) / scale) * 10) / 10)) }; }) });
      const at = slides.findIndex((sl) => sl.title === L('Ideas to copy'));
      slides.splice(at >= 0 ? at : slides.length, 0, { type: 'charts', title: L('The economy'), note: L('Yearly figures from the World Bank. The newest year is usually last year.'),
        charts: [yc(L('GDP per person, US$'), 'per_person'), yc(L('Growth after inflation'), 'growth_pct', 'pct1')], take: x.econTake || '' });
    }
    slides.push({ type: 'text', title: L('How to read the numbers'), terms: x.glossary, foot: x.sources });
    return { slides, title: names.join(' vs '), file: `${cs.map((c) => c.country.toLowerCase()).join('-')}-report` };
  }

  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  // Profile, best media moments, Google searches, followers and releases (same data as the web report).
  function extraSlides(slides, data, title, x) {
    const { L, name, num, short, dshort } = x;
    const sp = data.subject.spikes || [];
    if (sp.length) slides.push({ type: 'list', title: L('Biggest search moments'), note: L('Weeks in the last 12 months when {s} was searched at least twice as much as a normal week.', { s: title }),
      groups: [{ head: '', items: sp.map((d) => ({ title: `${L('Week of {d}', { d: `${dshort(d.day)} ${d.day.slice(0, 4)}` })} · ${L('{x}× a normal week', { x: d.times })}`, text: '' })) }] });
    const w = data.world || [];
    if (w.length) slides.push({ type: 'charts', title: L('Where people search for {s}', { s: title }), note: L('Google searches by country, last 12 months. 100 is the country where it is searched most for its size.'),
      charts: [{ kind: 'bar', horizontal: true, labels: w.map((c) => name(c.code)), series: [{ name: L('Search interest (0-100)'), values: w.map((c) => c.value) }] }],
      take: L('{s} is searched most in {c}, for its size.', { s: title, c: name(w[0].code) }) });
    const pr = data.products;
    if (pr && pr.countries.length) slides.push({ type: 'charts', title: L('Products on shelves'), note: L('Food and drink products listed on Open Food Facts, the open food database, and the countries they are sold in.'),
      charts: [{ head: L('Products by country'), kind: 'bar', horizontal: true, labels: pr.countries.map((c) => name(c.code)), series: [{ name: L('Products listed'), values: pr.countries.map((c) => c.products) }] }],
      take: L('{s} has {n} products listed on Open Food Facts, most of them sold in {c}.', { s: title, n: `${num(pr.products)}${pr.more ? '+' : ''}`, c: name(pr.countries[0].code) }) });
    const r = data.releases;
    if (r && r.by_year.length) slides.push({ type: 'charts', title: L('Music releases'), note: L('Singles, albums and EPs listed on MusicBrainz, the open music database.'),
      charts: [{ head: L('Releases per year'), kind: 'bar', labels: r.by_year.map((y) => String(y.year)), series: [{ name: L('Releases'), values: r.by_year.map((y) => y.releases) }] }],
      take: L('Latest: {t} ({d}).', { t: r.latest[0].title, d: r.latest[0].date }) });
  }

  function mentionsSlide(slides, data, title, x) {
    const m = data.mentions;
    if (!m) return;
    const { L, short, num } = x;
    const cards = [m.news && { n: short(m.news.articles), label: L('News articles'), sub: L('last 30 days, worldwide') },
      m.social && { n: `${num(m.social.posts)}${m.social.more ? '+' : ''}`, label: L('Bluesky posts'), sub: L('public posts, last 30 days') },
      m.social && { n: short(m.social.likes), label: L('Likes on those posts'), sub: L('{n} reposts', { n: num(m.social.reposts) }) }].filter(Boolean);
    slides.push({ type: 'kpis', title: L('In the news and online'), groups: [{ head: '', cards }] });
    if (m.news && m.news.countries.length) slides.push({ type: 'charts', title: L('News by country'), note: L('Counts only, last 30 days: online news worldwide (GDELT) and public posts on Bluesky.'),
      charts: [{ kind: 'bar', horizontal: true, labels: m.news.countries.map((c) => cut(c.name, 22)), series: [{ name: L('News articles'), values: m.news.countries.map((c) => c.share) }], fmt: 'pct' }] });
  }

  function entityDeck(data, x) {
    const { L, short, dshort, name } = x;
    const s = { ...data.subject, title: plain(data.subject.title) };
    const all = [{ ...s, me: true }, ...data.peers.map((p) => ({ ...p, title: plain(p.title) }))];
    const sg = (p) => (p == null ? '' : `${p > 0 ? '+' : ''}${p}%`);
    const nw = data.mentions && data.mentions.news, top = (data.world || [])[0];
    const slides = [];
    slides.push({ type: 'kpis', title: L('At a glance'), groups: [{ head: '', cards: [
      s.change_pct != null && { n: sg(s.change_pct), label: L('Google searches'), sub: L('last 4 weeks vs the 4 before') },
      s.yoy_pct != null && { n: sg(s.yoy_pct), label: L('vs a year ago'), sub: L('same 4 weeks last year') },
      s.share_pct != null && { n: `${s.share_pct}%`, label: L('Share of searches'), sub: L('among these {n}', { n: all.length }) },
      s.peak && { n: dshort(s.peak.day), label: L('Busiest week'), sub: s.peak.times ? L('{x}× a normal week', { x: s.peak.times }) : '' },
      top && { n: name(top.code), label: L('Searches most'), sub: L('for its size, last 12 months') },
      nw && { n: short(nw.articles), label: L('News articles'), sub: L('last 30 days, worldwide') },
    ].filter(Boolean) }] });
    const ml = all.filter((p) => (p.months || []).length > 2);
    if (ml.length) slides.push({ type: 'charts', title: L('Searched on Google'), note: L('Google searches worldwide, month by month for 5 years. 100 is the busiest week of any of them (Google Trends).'),
      charts: [{ kind: 'line', labels: ml[0].months.map((m) => m.month), series: ml.map((p) => ({ name: p.title, values: p.months.map((m) => m.value) })) }] });
    if (all.length > 1 && all.some((p) => p.share_pct != null)) slides.push({ type: 'charts', title: L('Growth and share of searches'), note: L('Each one\'s share of the Google searches among them, last 4 weeks.'),
      charts: [{ kind: 'bar', horizontal: true, labels: all.map((p) => cut(p.title, 26)), series: [{ name: L('Share of searches'), values: all.map((p) => p.share_pct || 0) }], fmt: 'pct' }] });
    if (data.business) {
      const yrs = data.business.years, u = x.bizUnit || 1e9;
      const yc = (head, k) => ({ head, kind: 'bar', labels: yrs.map((y) => String(y.year)), series: [{ name: head, values: yrs.map((y) => (y[k] == null ? 0 : Math.round((y[k] / u) * 10) / 10)) }] });
      slides.push({ type: 'charts', title: L('How the business is doing'), note: x.bizNote || '', charts: [yc(x.bizHeads[0], 'revenue'), yc(x.bizHeads[1], 'profit')], take: x.bizTake || '' });
    }
    if ((data.trends || []).length) {
      const top = data.trends.slice(0, 10);
      slides.push({ type: 'charts', title: L('Trending on Google'), note: L('Days {s} was among the trending Google searches in each country (Google Trends).', { s: s.title }),
        charts: [{ kind: 'bar', horizontal: true, labels: top.map((t) => name(t.country)), series: [{ name: L('Days trending'), values: top.map((t) => t.days) }] }],
        take: top.length === 1 ? L('{s} was a trending Google search in {c}.', { s: s.title, c: name(top[0].country) }) : L('{s} was a trending Google search in {n} countries.', { s: s.title, n: data.trends.length }) });
    }
    extraSlides(slides, data, s.title, x);
    mentionsSlide(slides, data, s.title, x);
    slides[slides.length - 1].foot = `${L('Sources')}: ${x.sources}`;
    return { slides, title: s.title, file: `${s.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-report` };
  }

  const deckOf = (data, x) => {
    const d = data.type === 'artist' || data.type === 'company' ? entityDeck(data, x) : countryDeck(data, x);
    if (x.know && x.know.length) d.slides.unshift({ type: 'know', title: x.L('In plain words'), note: x.L('The report in a few easy numbers. The slides after this show the details.'), items: x.know });
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
      if (s.foot && s.type !== 'text') sl.addText(s.foot, { x: 0.6, y: 6.55, w: 12.1, h: 0.6, fontFace: FONT, fontSize: 8, color: GREY, valign: 'top', fit: 'shrink' });
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
    const { L, name } = x;
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
    if (data.type === 'artist' || data.type === 'company') {
      const all = [data.subject, ...data.peers];
      statesSheet();
      if (data.mentions) sheet(L('In the news and online'), [[L('Measure'), L('Value')].map(H), ...(data.mentions.news ? [[L('News articles'), n(data.mentions.news.articles)], ...data.mentions.news.countries.map((c) => [`${L('News by country')}: ${c.name}`, p100(c.share)])] : []), ...(data.mentions.social ? [[L('Bluesky posts'), n(data.mentions.social.posts)], [L('Likes on those posts'), n(data.mentions.social.likes)]] : [])], [40, 16]);
      sheets.push({ sheet: cut(L('Summary'), 31), data: about, columns: [{ width: 22 }, { width: 70 }] });
      if (x.quality) sheet(L('Sources and data quality'), [[L('What'), L('Source'), L('Type'), L('Covers')].map(H), ...x.quality], [30, 44, 26, 40]);
      const P = `${data.from} – ${data.to}`, rows = [];
      const add = (sec, who, when, what, v, src) => { if (v != null) rows.push([sec, who, when, what, n(v), src]); };
      if (data.searches) data.searches.weeks.forEach((d) => d.values.forEach((v, i) => add(L('Searched on Google'), data.searches.names[i], day(d.day), L('Search index (0-100)'), v, 'Google Trends')));
      (data.world || []).forEach((c) => add(L('Where people search'), name(c.code), L('Last 12 months'), L('Search index (0-100)'), c.value, 'Google Trends'));
      (data.subject.spikes || []).forEach((d) => add(L('Biggest search moments'), plain(data.subject.title), day(d.day), L('× a normal week'), d.times, 'Google Trends'));
      (data.trends || []).forEach((t) => add(L('Trending on Google'), name(t.country), P, L('Days trending'), t.days, 'Google Trends'));
      if (data.business) data.business.years.forEach((y) => { add(L('How the business is doing'), plain(data.subject.title), y.year, L('Sales, US$'), y.revenue, 'SEC EDGAR'); add(L('How the business is doing'), plain(data.subject.title), y.year, L('Profit, US$'), y.profit, 'SEC EDGAR'); });
      if (data.releases) data.releases.by_year.forEach((y) => add(L('Music releases'), plain(data.subject.title), y.year, L('Releases'), y.releases, 'MusicBrainz'));
      if (data.products) data.products.countries.forEach((c) => add(L('Products on shelves'), name(c.code), P, L('Products'), c.products, 'Open Food Facts'));
      sheet(L('All data'), [[L('Section'), L('Name'), L('Day or year'), L('Measure'), L('Value'), L('Source')].map(H), ...rows], [26, 30, 22, 26, 16, 16]);
      sheet(L('Side by side'), [[L('Name'), L('Searches now (0-100)'), L('vs 4 weeks before'), L('vs last year'), L('Share of searches')].map(H),
        ...[...all].sort((a, b) => (b.now || 0) - (a.now || 0)).map((p) => [plain(p.title), n(p.now), p100(p.change_pct), p100(p.yoy_pct), p100(p.share_pct)])], [30, 20, 20, 16, 18]);
      if (data.business) sheet(L('How the business is doing'), [[L('Year'), L('Sales, US$'), L('Profit, US$')].map(H), ...data.business.years.map((y) => [y.year, n(y.revenue), n(y.profit)])], [8, 22, 22]);
      if (data.searches) sheet(L('Searched on Google'), [[L('Week'), ...data.searches.names].map(H), ...data.searches.weeks.map((d) => [day(d.day), ...d.values.map(n)])], [14, ...data.searches.names.map(() => 18)]);
      if (data.products) sheet(L('Products on shelves'), [[L('Country'), L('Products')].map(H), ...data.products.countries.map((c) => [name(c.code), n(c.products)])], [24, 14]);
      if (data.releases) sheet(L('Music releases'), [[L('Year'), L('Releases')].map(H), ...data.releases.by_year.map((y) => [y.year, n(y.releases)])], [8, 12]);
      sheet(L('Trending on Google'), [[L('Country'), L('Days trending'), L('Approx. searches')].map(H), ...(data.trends || []).map((t) => [name(t.country), n(t.days), n(t.traffic)])], [24, 16, 18]);
    } else {
      const cs = data.countries;
      const names = cs.map((c) => name(c.country));
      sheets.push({ sheet: cut(L('Summary'), 31), data: about, columns: [{ width: 22 }, { width: 70 }] });
      const facts = cs.map((c) => ({ f: c.news_focus, partner: c.news_partners[0] }));
      sheet(L('At a glance'), [[L('Measure'), ...names].map(H),
        [L('News articles'), ...facts.map((k) => n(k.f.articles))],
        [L('Peaceful news'), ...facts.map((k) => p100(k.f.cooperation_pct))],
        [L('Most in the news with'), ...facts.map((k) => (k.partner ? name(k.partner.country) : null))],
        ...(data.shared ? [[L('Articles about both countries'), n(data.shared.articles_together)]] : [])], [34, ...names.map(() => 24)]);
      const daily = (title, pick) => {
        const ds = [...new Set(cs.flatMap((c) => pick(c).map((q) => q.day)))].sort();
        const maps = cs.map((c) => new Map(pick(c).map((q) => [q.day, q.value])));
        sheet(title, [[L('Day'), ...names].map(H), ...ds.map((d) => [day(d), ...maps.map((m) => n(m.has(d) ? m.get(d) : null))])], [14, ...names.map(() => 18)]);
      };
      daily(L('News coverage per day'), (c) => (c.news_daily || []).map((d) => ({ day: d.day, value: d.articles })));
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
      sheet(L('AI builders'), [[L('Country'), L('Year'), 'GitHub', '★', L('Link')].map(H),
        ...cs.flatMap((c, ci) => (c.ai_builders ? c.ai_builders.by_year : []).filter((y) => y.top).map((y) => [names[ci], y.year, y.top.full_name, n(y.top.stars), y.top.url]))], [18, 8, 36, 10, 50]);
      sheet(L('Ideas to copy'), [[L('Country'), L('Title'), L('Idea'), L('Based on')].map(H),
        ...cs.flatMap((c, ci) => c.ideas.map((i) => [names[ci], i.title, i.idea, i.based_on || '']))], [18, 30, 80, 40]);
    }
    const blob = await write(sheets).toBlob();
    save(blob, `${deckOf(data, x).file}.xlsx`);
  }

  // Graphs as a PDF file: each report section drawn to an image (html2canvas) and laid out on A4 pages (jsPDF).
  const SVG_STYLE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline'];
  const inlineSvg = (svg) => [svg, ...svg.querySelectorAll('*')].forEach((el) => {
    const cs = getComputedStyle(el);
    SVG_STYLE.forEach((k) => el.style.setProperty(k, cs.getPropertyValue(k)));
  });
  async function pdf(data, x) {
    const [h2c, lib] = await Promise.all([load('/assets/vendor/html2canvas-1.4.1.min.js', 'html2canvas'), load('/assets/vendor/jspdf-4.2.1.umd.min.js', 'jspdf')]);
    const root = document.getElementById('report');
    root.querySelectorAll('svg').forEach(inlineSvg);
    const doc = new lib.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 28, W = PW - 2 * M, MAXH = PH - 2 * M;
    const skip = (n) => !!(n.classList && (n.classList.contains('exports') || n.classList.contains('print-only')));
    let y = M;
    for (const el of root.querySelectorAll(':scope > .rhead, :scope > .rsec')) {
      const c = await h2c(el, { scale: 1.6, backgroundColor: '#ffffff', useCORS: true, logging: false, ignoreElements: skip });
      if (!c.width || !c.height) continue;
      const k = W / c.width, step = Math.floor(MAXH / k);
      for (let top = 0; top < c.height; top += step) {
        const part = document.createElement('canvas');
        part.width = c.width; part.height = Math.min(step, c.height - top);
        part.getContext('2d').drawImage(c, 0, top, c.width, part.height, 0, 0, c.width, part.height);
        const h = part.height * k;
        if (y + h > PH - M && y > M) { doc.addPage(); y = M; }
        doc.addImage(part.toDataURL('image/jpeg', 0.88), 'JPEG', M, y, W, h);
        y += h + 14;
      }
    }
    save(doc.output('blob'), `${deckOf(data, x).file} - graphs.pdf`);
  }

  window.LP_EXPORT = { pdf, pptx, xlsx, deck: deckOf };
})();
