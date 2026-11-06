// /report: opens the Country Inspiration Report. ?sample=BR-PT is free; otherwise the buyer pastes the
// license key from their Lemon Squeezy receipt once, and this browser remembers it (localStorage only).
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
  const list = (items, fn, cls = '') => (items && items.length ? `<ol class="${cls}">${items.map(fn).join('')}</ol>` : empty);
  const wiki = (w) => `<li><a href="${esc(w.link)}" target="_blank" rel="noopener">${esc(w.title)}</a> <small>${num(w.views)} views${w.days ? ` · ${w.days} ${w.days === 1 ? 'day' : 'days'} in the top 30` : ''}</small></li>`;

  const SECTIONS = [
    ['Ideas to copy', 'Written each week by AI from the data below. Use them as starting points.', (c) => (c.ideas.length
      ? `<ol class="ideas">${c.ideas.map((i) => `<li><b>${esc(i.title)}</b><p>${esc(i.idea)}</p>${i.based_on ? `<small>Based on: ${esc(i.based_on)}</small>` : ''}</li>`).join('')}</ol>`
      : '<p class="muted small">This week\'s ideas are being written. Check back soon.</p>')],
    ['Most-read on Wikipedia', 'What people looked up most, with total views over the period.', (c) => list(c.wikipedia, wiki, 'plain')],
    ['Rising this week', 'Pages that entered the daily top 30 in the last 7 days.', (c) => list(c.wikipedia_rising, wiki, 'plain')],
    ['What the news talks about', 'Share of news articles about the country, by type of event.', (c) => {
      const f = c.news_focus;
      if (!f.articles) return empty;
      return `<p class="small"><b>${f.cooperation_pct}%</b> of ${num(f.articles)} articles were about cooperation, such as talks, deals and aid. The rest were about tension or conflict.</p><ul class="bars">${f.topics.map((t) => `<li><span>${esc(t.topic)}</span><i style="--w:${Math.max(2, t.pct)}%"></i><b>${t.pct}%</b></li>`).join('')}</ul>`;
    }],
    ['In the news with', 'Countries most often in the same news articles.', (c) => list(c.news_partners, (p) => `<li>${esc(name(p.country))} <small>${num(p.articles)} articles</small></li>`, 'plain')],
  ];

  function render(data) {
    const cs = data.countries;
    const title = cs.map((c) => name(c.country)).join(' vs ');
    document.title = `${title} · Country Inspiration Report · Like Polling`;
    const head = `<header class="rhead"><span class="tag">${data.sample ? 'Free sample' : 'Country Inspiration Report'}</span>
      <h1>${esc(title)}</h1>
      <p class="muted">What ${cs.length > 1 ? 'these countries' : 'this country'} read and talked about in the last ${data.period_days} days. Updated ${new Date(data.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.${data.expires_at ? ` Your access lasts until ${new Date(data.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
      <div class="actions"><button class="btn" type="button" id="print">Save as PDF</button>${data.sample ? '<a class="btn ghost" href="/services#report">Get your own report</a>' : ''}</div></header>`;
    let shared = '';
    if (data.shared) {
      shared = `<section class="rsec"><h2>What they share</h2><p class="small"><b>${num(data.shared.articles_together)}</b> news articles mentioned both countries together in this period.</p>${data.shared.read_in_both.length ? `<p class="small">Most-read in both:</p><ol class="plain">${data.shared.read_in_both.map(wiki).join('')}</ol>` : '<p class="small muted">No page was among the most-read in both countries.</p>'}</section>`;
    }
    const body = SECTIONS.map(([h, note, fn]) => `<section class="rsec"><h2>${esc(h)}</h2><p class="note">${esc(note)}</p><div class="cols n${cs.length}">${cs.map((c) => `<div class="col">${cs.length > 1 ? `<h3>${esc(name(c.country))}</h3>` : ''}${fn(c)}</div>`).join('')}</div></section>`).join('');
    const sources = `<section class="rsec sources"><h2>Sources and limits</h2><p class="small">Built by Like Polling from its own daily records of open data. Wikipedia page views: Wikimedia Foundation (wikimedia.org), per country, rounded up by Wikimedia for privacy. News topics and countries: The GDELT Project (gdeltproject.org), counted from worldwide online news. Ideas are written by AI (Google Gemini) and can contain mistakes. YouTube and news headlines are not part of the report; see them free on <a href="/">likepolling.com</a>.</p></section>`;
    $('report').innerHTML = head + shared + body + sources;
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
