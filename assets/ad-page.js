// /ad: activate a paid ad-spot key (POST /api/ad). With ?admin=TOKEN it lists ads for the owner.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const T = (s) => (window.LP_I18N ? window.LP_I18N.t(s) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = (d) => (d ? new Date(d).toLocaleDateString(window.LP_I18N ? window.LP_I18N.locale() : 'en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const msg = (cls, html) => { const m = $('ad-msg'); m.className = `ad-msg ${cls}`; m.innerHTML = html; m.hidden = false; m.setAttribute('data-no-i18n', ''); };
  const params = new URLSearchParams(location.search);
  const f = $('ad-form');
  for (const k of ['brand', 'kind', 'website']) if (params.get(k)) f.elements[k].value = params.get(k);

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    const body = Object.fromEntries(new FormData(f));
    btn.disabled = true;
    msg('', esc(T('Checking your ad…')));
    try {
      const r = await fetch('/api/ad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ error: 'Something went wrong. Try again in a minute.' }));
      if (!r.ok) throw new Error(j.error || r.status);
      if (j.status === 'live') msg('ok', `<b>${esc(T('Your ad is live!'))}</b> ${esc(T('It runs until'))} ${esc(day(j.ends_at))}. <a href="/">${esc(T('See it on the homepage'))}</a>`);
      else if (j.status === 'queued') msg('ok', `<b>${esc(T('Your ad is in line.'))}</b> ${esc(T('It starts on'))} ${esc(day(j.starts_at))} ${esc(T('and runs for 7 days.'))}`);
      else msg('ok', `<b>${esc(T('Thanks! A person will review your card.'))}</b> ${esc(T('It goes live as soon as it\'s approved, usually within a day.'))}`);
      f.hidden = true;
    } catch (err) {
      msg('err', esc(T(err.message)));
    } finally { btn.disabled = false; }
  });

  const admin = params.get('admin');
  if (!admin) return;
  const box = $('ad-admin');
  box.hidden = false;
  async function load(action) {
    const r = await fetch(action ? '/api/ad' : `/api/ad?admin=${encodeURIComponent(admin)}`, action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin, ...action }) } : {});
    const j = await r.json();
    if (!r.ok) { box.innerHTML = `<p class="ad-msg err">${esc(j.error)}</p>`; return; }
    box.innerHTML = `<h2>Ads (owner)</h2><table><tr><th>Ad</th><th>Status</th><th>Dates</th><th></th></tr>${j.ads.map((a) => `<tr>
      <td><b>${esc(a.brand)}</b> · ${esc(a.kind)}<br><a href="${esc(a.website)}" target="_blank" rel="noopener">${esc(a.website)}</a>${a.instagram ? ` · @${esc(a.instagram)}` : ''}<br><small>${esc(a.tagline || '')}</small></td>
      <td>${esc(a.status)}${a.reason ? `<br><small>${esc(a.reason)}</small>` : ''}</td><td><small>${esc(day(a.starts_at))}<br>${esc(day(a.ends_at))}</small></td>
      <td>${a.status === 'held' ? `<button class="btn" data-id="${a.id}" data-a="approve">Approve</button>` : ''}${['held', 'queued', 'live'].includes(a.status) ? `<button class="btn ghost" data-id="${a.id}" data-a="remove">Take down</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4">No ads yet.</td></tr>'}</table>`;
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (b && (b.dataset.a !== 'remove' || confirm('Take this ad down?'))) load({ id: Number(b.dataset.id), action: b.dataset.a });
  });
  load();
})();
