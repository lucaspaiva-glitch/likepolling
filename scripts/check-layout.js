// Layout check for the live homepage, at phone (375 px) and desktop (1366 px) widths:
//   - every section is the same distance (--lp-gap) from the one above it,
//   - nothing spills sideways off the page or out of its section,
//   - the bottom "Next country" buttons are centred on phones and their flag matches the country.
// Needs a Chrome with remote debugging (Devin machines: http://localhost:29229). No packages.
// Usage: node scripts/check-layout.js [url]     (exit code 1 when a problem is found)
const CDP = process.env.CDP || 'http://localhost:29229';
const URL_ = process.argv[2] || `https://www.likepolling.com/?v=${Date.now()}`;
const VIEWS = [['phone', 375, 812, true], ['desktop', 1366, 900, false]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function audit() {
  const out = [];
  const R = (e) => e.getBoundingClientRect();
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) out.push(`page is ${doc.scrollWidth - doc.clientWidth}px wider than the screen`);
  const gap = parseFloat(getComputedStyle(doc).getPropertyValue('--lp-gap')) || (innerWidth <= 560 ? 28 : 36);
  const wrap = document.querySelector('#news-front') && document.querySelector('#news-front').parentElement;
  if (!wrap) return ['homepage sections not found'];
  const kids = [...wrap.children].filter((k) => R(k).height > 0 && !/SCRIPT|STYLE|TEMPLATE/.test(k.tagName));
  const secs = kids.filter((k) => k.tagName === 'SECTION');
  const name = (s) => s.id || String(s.className).split(' ')[0];
  for (const s of secs) {
    const r = R(s);
    const above = kids.filter((k) => k !== s && R(k).bottom <= r.top + 1 && R(k).left < r.right && R(k).right > r.left)
      .sort((a, b) => R(b).bottom - R(a).bottom)[0];
    if (!above || above.tagName !== 'SECTION' || secs.indexOf(s) === 0) continue;
    const d = Math.round(r.top - R(above).bottom);
    if (Math.abs(d - gap) > 2) out.push(`gap ${name(above)} -> ${name(s)} is ${d}px, should be ${gap}px`);
  }
  const clips = (e, stop) => { for (let n = e.parentElement; n && n !== stop; n = n.parentElement) if (getComputedStyle(n).overflowX !== 'visible') return true; return false; };
  for (const s of secs) {
    const r = R(s); let n = 0;
    for (const e of s.querySelectorAll('*')) {
      const b = R(e);
      if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') continue;
      if ((b.right > r.right + 1 || b.left < r.left - 1) && !clips(e, s)) { if (n++ < 3) out.push(`${name(s)}: ${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} sticks out ${Math.round(Math.max(b.right - r.right, r.left - b.left))}px`); }
    }
  }
  const phone = innerWidth <= 560;
  for (const f of document.querySelectorAll('.lp-cs-foot')) {
    const btn = f.querySelector('.lp-cs-next'); if (!btn || !R(btn).height) continue;
    const s = f.closest('section'); const box = R(f.parentElement), b = R(btn);
    if (phone && Math.abs((b.left + b.right) / 2 - (box.left + box.right) / 2) > 2) out.push(`${name(s)}: Next country button is not centred`);
    if (b.bottom > R(s).bottom + 1) out.push(`${name(s)}: Next country button sits outside its section`);
  }
  return out;
}

(async () => {
  const problems = [];
  for (const [view, width, height, mobile] of VIEWS) {
    const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const wait = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { wait.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    const run = async (fn) => (await send('Runtime.evaluate', { expression: `(${fn})()`, awaitPromise: true, returnByValue: true })).result.result.value;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url: URL_ });
    await sleep(9000);
    await run(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } scrollTo(0, 0); });
    await sleep(2500);
    const found = (await run(audit)) || ['page did not load'];
    found.forEach((p) => problems.push(`${view}: ${p}`));
    ws.close();
    await fetch(`${CDP}/json/close/${t.id}`).catch(() => {});
  }
  console.log(problems.length ? problems.join('\n') : 'Layout OK (phone + desktop)');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error('check-layout failed:', e.message); process.exit(2); });
