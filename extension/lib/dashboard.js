// Creators + dashboard: the Creators / Trending / Music / Education panel, shared by the YouTube
// overlay (content.js, inside a Shadow DOM) and the toolbar popup.
(function (root) {
  'use strict';
  const CP = root.CP;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOGO = '<svg class="cp-logo" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill="#b0000e"/><polyline points="5,21 8,19 10.5,20.2 13.5,16.5 15.5,17.6 18.5,12.5 20.5,13.6 23,6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="6" r="1.9" fill="#fff"/></svg>';
  const ICON = {
    min: '<svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg>',
    full: '<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
    exit: '<svg viewBox="0 0 16 16"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3"/></svg>',
  };
  const SITE = 'https://www.likepolling.com';
  // Ticker keeps its place across re-renders (a re-render used to restart it off-screen).
  const TAPE_T0 = Date.now(), TAPE_S = 80;

  function Dashboard(container, opts) {
    let t = CP.translator(opts.lang);
    let f = CP.formatter(opts.lang);
    const st = {
      tab: opts.tab || 'creators', full: false, active: false, settings: false,
      country: opts.country || 'US', scope: 'country', ref: null, ch: null, sel: null,
      charts: {}, refreshTried: {}, showPill: opts.showPill !== false,
    };
    function setLang(l) { opts.lang = l; t = CP.translator(l); f = CP.formatter(l); render(); }

    // ---------- data ----------
    async function load(key, path, opt = {}) {
      st.charts[key] = { status: 'loading', body: st.charts[key]?.body };
      render();
      const r = await opts.request(path, opt).catch(() => ({ ok: false, status: 0 }));
      st.charts[key] = r.ok ? { status: 'ok', body: r.body } : { status: 'error', code: r.status, body: st.charts[key]?.body };
      render();
      return r;
    }
    const need = (key, path) => { if (!st.charts[key] || (st.charts[key].status === 'error' && !st.charts[key].body)) load(key, path); };

    async function loadChannel(refresh) {
      const ref = st.ref;
      if (!ref) return;
      const key = CP.refKey(ref);
      const prev = st.ch && st.ch.key === key ? st.ch : null;
      st.ch = { key, status: refresh ? 'refreshing' : 'loading', body: prev?.body || null };
      render();
      const r = await opts.request(`channel?${CP.refQuery(ref)}${refresh ? '&refresh=1' : ''}`, { refresh }).catch(() => ({ ok: false, status: 0 }));
      if (CP.refKey(st.ref) !== key) return;
      if (r.ok) st.ch = { key, status: 'ok', body: r.body };
      else if (r.status === 404 && !st.ch.body) st.ch = { key, status: 'nodata', msg: refresh ? r.body?.error : null };
      else st.ch = { key, status: st.ch.body ? 'ok' : 'error', body: st.ch.body, msg: r.body?.error, warn: st.ch.body ? t('offline') : null };
      opts.onChannel && opts.onChannel(st.ch);
      maybeRefresh();
      render();
    }
    // Saved data older than 6 h is refreshed once, only while the panel is open.
    function maybeRefresh() {
      const b = st.ch?.body;
      if (!st.active || !b?.stale || st.refreshTried[st.ch.key]) return;
      st.refreshTried[st.ch.key] = true;
      loadChannel(true);
    }

    const eduCountry = () => st.eduCountry || st.country;
    function ensureTabData() {
      need('worldwide', 'worldwide');
      if (st.tab === 'trending' && st.scope === 'country') need(`trending:${st.country}`, `trending?country=${st.country}`);
      if (st.tab === 'music') need(`music:${st.country}`, `music?country=${st.country}`);
      if (st.tab === 'education') need(`edu:${eduCountry()}`, `education?country=${eduCountry()}`);
    }

    // ---------- views ----------
    const stat = (label, value, sub, title) => `<div class="cp-stat"${title ? ` title="${esc(title)}"` : ''}><span class="cp-k">${esc(label)}</span><b class="cp-n">${value}</b><span class="cp-s">${esc(sub)}</span></div>`;
    const msg = (text, action) => `<div class="cp-msg"><p>${esc(text)}</p>${action || ''}</div>`;
    const skeleton = (n = 4) => `<div class="cp-skel">${'<i></i>'.repeat(n)}</div>`;

    function graph(videos, cls, label, x0, x1) {
      if (!videos.length) return '';
      const W = 320, H = st.full ? 110 : 64, P = 6;
      const max = Math.max(...videos.map((v) => v.views), 1);
      const pts = videos.map((v) => ({ v, x: P + ((Date.parse(v.published_at) - x0) / Math.max(1, x1 - x0)) * (W - 2 * P), y: H - P - (v.views / max) * (H - 2 * P) }));
      const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const area = `${pts[0].x.toFixed(1)},${H - P} ${line} ${pts[pts.length - 1].x.toFixed(1)},${H - P}`;
      const r = videos.length > 40 ? 1.8 : 2.8;
      const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${st.sel === p.v.id ? r + 2 : r}" class="${st.sel === p.v.id ? 'on' : ''}"/>`).join('');
      const selP = pts.find((p) => p.v.id === st.sel);
      const marker = selP ? `<line x1="${selP.x.toFixed(1)}" x2="${selP.x.toFixed(1)}" y1="0" y2="${H}" class="cp-mark"/>` : '';
      return `<div class="cp-graph ${cls}"><div class="cp-gh"><span>${esc(label)}</span><span>${t('views')} max ${f.num(max)}</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-act="graph" data-ids="${esc(pts.map((p) => `${p.x.toFixed(1)}:${p.v.id}`).join(','))}" role="img" aria-label="${esc(label)}">
        ${marker}<polygon points="${area}" class="cp-area"/><polyline points="${line}" class="cp-line"/>${dots}</svg></div>`;
    }

    function creators() {
      if (!st.ref) return msg(t('open_channel'));
      const ch = st.ch;
      if (!ch || ch.status === 'loading') return skeleton(5);
      if (ch.status === 'nodata') return msg(ch.msg || t('nodata'), `<button class="cp-btn" data-act="load-now">${t('load_now')}</button>`);
      if (ch.status === 'refreshing' && !ch.body) return msg(t('refreshing'));
      if (ch.status === 'error' && !ch.body) return msg(ch.msg || t('offline'), `<button class="cp-btn ghost" data-act="retry">${t('retry')}</button>`);
      const b = ch.body, c = b.channel, m = b.metrics || {};
      const vids = b.videos || [];
      const x0 = Math.min(...vids.map((v) => Date.parse(v.published_at)), Date.now() - 30 * 864e5);
      const x1 = Math.max(Date.now(), ...vids.map((v) => Date.parse(v.published_at)));
      const longV = vids.filter((v) => !v.shorts_length), shortV = vids.filter((v) => v.shorts_length);
      const sel = vids.find((v) => v.id === st.sel);
      const top = [...vids].sort((a, z) => z.views - a.views).slice(0, st.full ? 5 : 3);
      const status = ch.status === 'refreshing' ? `<span class="cp-live">${t('refreshing')}</span>`
        : b.updated_at ? `<span class="${b.stale ? 'cp-stale' : ''}">${t('updated', { t: f.ago(b.updated_at) })}${b.stale ? ` · ${t('saved')}` : ''}</span>` : '';
      return `<div class="cp-creator">
        <div class="cp-who">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" referrerpolicy="no-referrer">` : '<i class="cp-av"></i>'}
          <div><b>${esc(c.name)}</b><span>${esc(c.handle || '')}${c.country ? ` · ${esc(f.country(c.country))}` : ''}</span></div></div>
        <div class="cp-head"><span class="cp-k">${t('views30')}</span><b class="cp-big">${f.num(m.views_30d)}</b><span class="cp-s">${status}</span></div>
        <div class="cp-stats">
          ${stat(t('subs'), f.num(c.subscribers), t('subs_sub'))}
          ${stat(t('earn'), m.earnings_usd ? `${f.usd(m.earnings_usd.low)}–${f.usd(m.earnings_usd.high)}` : '—', t('earn_sub'), t('earn_note'))}
          ${stat(t('avg'), f.num(m.avg_views_per_video), t('avg_sub'))}
          ${stat(t('comments'), f.num(m.comments_30d), t('last30'))}
        </div>
        ${vids.length ? `<div class="cp-sec"><h3>${t('graph')}</h3>${graph(longV, 'long', t('long'), x0, x1)}${graph(shortV, 'short', t('shorts'), x0, x1)}
          <div class="cp-pick">${sel ? `<a href="https://www.youtube.com/watch?v=${esc(sel.id)}" target="_blank" rel="noopener"><b>${esc(sel.title)}</b><span>${f.num(sel.views)} ${t('views')} · ${f.date(sel.published_at)}</span></a>` : `<span class="cp-s">${t('tap_dot')}</span>`}</div></div>` : ''}
        ${top.length ? `<div class="cp-sec"><h3>${t('top')}</h3><ol class="cp-top">${top.map((v) => `<li><a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy"><span><b>${esc(v.title)}</b><em>${f.num(v.views)} ${t('views')}${v.shorts_length ? ' · Shorts' : ''}</em></span></a></li>`).join('')}</ol></div>` : ''}
        ${ch.warn ? `<p class="cp-warn">${esc(ch.warn)}</p>` : ''}
      </div>`;
    }

    function rows(items, speedKey, unit, fastestId, worldwide, total) {
      const max = Math.max(...items.map((r) => (worldwide ? r.country_count : r[speedKey]) || 0), 1);
      const list = items.slice(0, st.full ? 25 : 10);
      return `<ol class="cp-rows${st.full ? ' wide' : ''}">${list.map((r) => {
        const val = worldwide ? r.country_count : r[speedKey];
        const right = worldwide ? t('in_countries', { n: r.country_count, t: total }) : `${f.num(val)}${t(unit)}`;
        return `<li><a href="https://www.youtube.com/watch?v=${esc(r.video_id)}" target="_blank" rel="noopener">
          <span class="cp-rank">${String(r.rank).padStart(2, '0')}</span>
          ${st.full ? `<img src="${esc(r.thumbnail_url || '')}" alt="" loading="lazy">` : ''}
          <span class="cp-title"><b>${esc(r.title)}</b><em>${esc(r.channel_title)} · ${f.num(r.views)} ${t('views')}${st.full && r.like_rate != null ? ` · ${t('like_rate')} ${f.pct(r.like_rate)}` : ''}</em></span>
          <span class="cp-speed"><span class="cp-meter"><i style="width:${Math.max(4, (val / max) * 100).toFixed(0)}%"></i></span><span>${esc(right)}</span>${!worldwide && r.video_id === fastestId ? `<span class="cp-badge">${t('fastest')}</span>` : ''}</span>
        </a></li>`;
      }).join('')}</ol>`;
    }

    function chart(kind) {
      const music = kind === 'music';
      const worldwide = !music && st.scope === 'worldwide';
      const key = worldwide ? 'worldwide' : `${kind}:${st.country}`;
      const c = st.charts[key];
      const picker = `<div class="cp-ctl">
        ${music ? '' : `<button class="${worldwide ? '' : 'on'}" data-act="scope" data-v="country">${esc(f.country(st.country))}</button><button class="${worldwide ? 'on' : ''}" data-act="scope" data-v="worldwide">${t('worldwide')}</button>`}
        ${worldwide ? '' : `<label class="cp-sel"><span class="cp-vh">${t('country')}</span><select data-act="country">${CP.COUNTRIES.map((k) => `<option value="${k}"${k === st.country ? ' selected' : ''}>${esc(f.country(k))}</option>`).join('')}</select></label>`}
      </div>`;
      let body;
      if (!c || (c.status === 'loading' && !c.body)) body = skeleton(6);
      else if (!c.body) body = msg(t('offline'), `<button class="cp-btn ghost" data-act="retry">${t('retry')}</button>`);
      else if (!c.body.items.length) body = msg(t('no_rows'));
      else {
        const note = worldwide ? '' : `<p class="cp-note">${t('speed')} = ${t(music ? 'speed_d' : 'speed_h')}</p>`;
        body = rows(c.body.items, music ? 'views_per_day' : 'views_per_hour', music ? 'per_day' : 'per_hour', c.body.fastest_video_id, worldwide, c.body.countries_total) + note
          + (c.body.updated_at ? `<p class="cp-note">${t('updated', { t: f.ago(c.body.updated_at) })}</p>` : '');
      }
      return picker + body;
    }

    const SUBJ_KEYS = ['ai_tech', 'space_physics', 'math', 'health_biology', 'chemistry', 'climate_environment', 'history_geography', 'engineering', 'exams_admissions', 'schools_policy', 'money_careers', 'languages_culture'];
    function education() {
      const cc = eduCountry();
      const c = st.charts[`edu:${cc}`];
      const b = c?.body;
      // The user's country has no tracked channels: switch once to a country that has data.
      if (b && !b.videos.length && b.countries.length && !st.eduCountry) {
        st.eduCountry = b.countries.includes('US') ? 'US' : b.countries[0];
        queueMicrotask(() => { ensureTabData(); render(); });
      }
      const codes = [...new Set([...(b?.countries || []), cc])];
      const picker = `<div class="cp-ctl"><label class="cp-sel"><span class="cp-vh">${t('country')}</span><select data-act="edu-country">${codes.map((k) => `<option value="${k}"${k === cc ? ' selected' : ''}>${esc(f.country(k))}</option>`).join('')}</select></label></div>`;
      if (!c || (c.status === 'loading' && !b)) return picker + skeleton(6);
      if (!b) return picker + msg(t('offline'), `<button class="cp-btn ghost" data-act="retry">${t('retry')}</button>`);
      if (!b.videos.length) return picker + msg(t('no_edu'));
      const max = Math.max(...b.subjects.map((s) => s.score), 1);
      const subjects = b.subjects.length ? `<div class="cp-sec"><h3>${t('edu_subjects')}</h3><ol class="cp-subj">${b.subjects.map((s) => `<li>
          <div class="cp-sj"><span class="cp-rank">${String(s.rank).padStart(2, '0')}</span><b>${esc(SUBJ_KEYS.includes(s.subject) ? t(`s_${s.subject}`) : s.subject)}</b><em>${t(s.video_count === 1 ? 'n_video' : 'n_videos', { n: s.video_count })} · ${t('n_news', { n: s.news_count })}</em></div>
          <div class="cp-sbar"><i class="yt" style="width:${(s.video_count * 3 / max * 100).toFixed(1)}%"></i><i class="nw" style="width:${(s.news_count / max * 100).toFixed(1)}%"></i></div></li>`).join('')}</ol>
          <p class="cp-note">${t('edu_note')}</p></div>` : '';
      return `${picker}<div class="cp-sec cp-edu"><h3>${t('edu_index')}</h3>${rows(b.videos, 'views_per_hour', 'per_hour', b.videos[0].video_id, false)}<p class="cp-note">${t('speed')} = ${t('speed_h')}</p></div>${subjects}`
        + (b.updated_at ? `<p class="cp-note">${t('updated', { t: f.ago(b.updated_at) })}</p>` : '');
    }

    function ticker() {
      const w = st.charts.worldwide?.body;
      if (!w?.items?.length) return '<div class="cp-tape"><div class="cp-tape-in still"><span>Like Polling · YouTube</span></div></div>';
      const items = w.items.slice(0, 10).map((r) => `<span><b>${esc(r.title.length > 42 ? r.title.slice(0, 40) + '…' : r.title)}</b> <em>${r.country_count}/${w.countries_total}</em></span>`).join('');
      return `<div class="cp-tape" title="${esc(t('worldwide'))}"><div class="cp-tape-in" style="animation-delay:-${(((Date.now() - TAPE_T0) / 1000) % TAPE_S).toFixed(2)}s">${items}${items}</div></div>`;
    }

    const LANG_NAMES = { en: 'English', pt: 'Português (Brasil)', 'pt-PT': 'Português (Portugal)', es: 'Español', de: 'Deutsch', ru: 'Русский', uk: 'Українська', ko: '한국어', ja: '日本語' };
    function settingsView() {
      return `<div class="cp-settings"><label>${t('language')}<select data-act="lang">${CP.LANGS.map((k) => `<option value="${k}"${k === opts.lang ? ' selected' : ''}>${LANG_NAMES[k]}</option>`).join('')}</select></label>
        <label>${t('country')}<select data-act="country">${CP.COUNTRIES.map((k) => `<option value="${k}"${k === st.country ? ' selected' : ''}>${esc(f.country(k))}</option>`).join('')}</select></label>
        <label class="cp-check"><input type="checkbox" data-act="pill"${st.showPill ? ' checked' : ''}> ${t('show_pill')}</label></div>`;
    }

    function render() {
      if (!st.active) return;
      const hud = opts.mode === 'hud';
      const tabs = ['creators', 'trending', 'music', 'education'].map((k) => `<button role="tab" aria-selected="${st.tab === k}" data-act="tab" data-v="${k}">${t(k)}</button>`).join('');
      const tools = hud
        ? `<button class="cp-ico" data-act="settings" title="${t('lang_country')}" aria-label="${t('lang_country')}">${ICON.gear}</button>
           <button class="cp-ico" data-act="min" title="${t('minimize')}" aria-label="${t('minimize')}">${ICON.min}</button>
           <button class="cp-ico" data-act="full" title="${t(st.full ? 'exit_full' : 'full')}" aria-label="${t(st.full ? 'exit_full' : 'full')}">${st.full ? ICON.exit : ICON.full}</button>`
        : `${opts.canShowOnPage ? `<button class="cp-btn small" data-act="show-on-page">${t('show_on_page')}</button>` : ''}<button class="cp-ico" data-act="settings" title="${t('lang_country')}" aria-label="${t('lang_country')}">${ICON.gear}</button>`;
      const view = st.settings ? settingsView() : st.tab === 'creators' ? creators() : st.tab === 'education' ? education() : chart(st.tab);
      const report = st.tab === 'creators' && st.ch?.body ? st.ch.body.channel.report_url : SITE;
      const scrollTop = container.querySelector('.cp-body')?.scrollTop || 0;
      container.innerHTML = `<div class="cp ${hud ? 'hud' : 'popup'}${st.full ? ' full' : ''}" lang="${esc(CP.LOCALE[opts.lang] || 'en')}">
        <header class="cp-bar" data-drag>${LOGO}<span class="cp-name">Creators <i>+</i></span><span class="cp-tools">${tools}</span></header>
        ${ticker()}
        ${opts.where ? `<div class="cp-where">${esc(t('w_where'))} <a href="https://www.youtube.com/" target="_blank" rel="noopener">${esc(t('open_yt'))} ↗</a></div>` : ''}
        <nav class="cp-tabs" role="tablist">${tabs}</nav>
        <div class="cp-body">${view}</div>
        <footer class="cp-foot"><span>likepolling.com</span><a href="${esc(report)}" target="_blank" rel="noopener">${t('report')} ↗</a></footer>
      </div>`;
      const body = container.querySelector('.cp-body');
      if (body) body.scrollTop = scrollTop;
    }

    // ---------- events ----------
    container.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !container.contains(el)) return;
      const act = el.dataset.act;
      if (act === 'tab') { st.tab = el.dataset.v; st.settings = false; ensureTabData(); render(); }
      else if (act === 'scope') { st.scope = el.dataset.v; ensureTabData(); render(); }
      else if (act === 'load-now') loadChannel(true);
      else if (act === 'retry') { if (st.tab === 'creators') loadChannel(false); else { st.charts = {}; ensureTabData(); } }
      else if (act === 'graph') {
        const box = el.getBoundingClientRect();
        const x = ((e.clientX - box.left) / box.width) * 320;
        const pts = el.dataset.ids.split(',').map((s) => { const i = s.indexOf(':'); return { x: +s.slice(0, i), id: s.slice(i + 1) }; });
        const near = pts.reduce((a, p) => (Math.abs(p.x - x) < Math.abs(a.x - x) ? p : a));
        st.sel = near.id; render();
      }
      else if (act === 'settings') { st.settings = !st.settings; render(); }
      else if (act === 'full') { st.full = !st.full; opts.onAction && opts.onAction(st.full ? 'full' : 'panel'); render(); }
      else if (['min', 'close', 'show-on-page'].includes(act)) opts.onAction && opts.onAction(act);
    });
    container.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.act === 'country') { st.country = el.value; opts.onAction && opts.onAction('country', el.value); ensureTabData(); render(); }
      if (el.dataset.act === 'edu-country') { st.eduCountry = el.value; ensureTabData(); render(); }
      if (el.dataset.act === 'pill') { st.showPill = el.checked; opts.onAction && opts.onAction('pill', el.checked); }
      if (el.dataset.act === 'lang') { setLang(el.value); opts.onAction && opts.onAction('lang', el.value); }
    });

    return {
      setChannel(ref) {
        if (CP.refKey(ref) === CP.refKey(st.ref)) return;
        st.ref = ref; st.sel = null; st.ch = null;
        if (ref) loadChannel(false); else render();
      },
      setTab(tab) { st.tab = tab; st.settings = false; ensureTabData(); render(); },
      setLang,
      setFull(on) { st.full = !!on; render(); },
      activate(on = true) { st.active = on; if (on) { ensureTabData(); maybeRefresh(); render(); } },
      get state() { return st; },
    };
  }

  CP.Dashboard = Dashboard;
  CP.LOGO = LOGO;
})(typeof globalThis !== 'undefined' ? globalThis : self);
