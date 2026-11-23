'use strict';

const SAMPLES = ['shakira', 'zara', 'brazil', 'benfica', 'chatgpt'];

async function warmSamples({ fetchImpl = fetch, log = console.log, error = console.error } = {}) {
  async function load(slug, label) {
    const url = `https://www.likepolling.com/api/report?page=${slug}`;
    const start = performance.now();
    const res = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.sample !== true || data.page !== slug) throw new Error('Unexpected sample response');
    const cache = res.headers.get('x-vercel-cache');
    const edge = res.headers.get('x-vercel-id')?.split('::')[0];
    log(`${label} ${url}: HTTP ${res.status}, ${cache || 'no cache status'} (${edge || 'unknown edge'}), ${Math.round(performance.now() - start)} ms`);
    return cache;
  }

  let ok = true;
  for (const slug of SAMPLES) {
    try {
      await load(slug, 'Warm');
    } catch (err) {
      error(`Could not warm ${slug}: ${err.message}`);
      ok = false;
    }
  }
  if (!ok) return false;

  try {
    const cache = await load(SAMPLES[0], 'Probe');
    if (cache !== 'HIT' && cache !== 'STALE') throw new Error('Sample was not served from the CDN cache');
    return true;
  } catch (err) {
    error(`Could not verify ${SAMPLES[0]}: ${err.message}`);
    return false;
  }
}

if (require.main === module) warmSamples().then((ok) => { if (!ok) process.exitCode = 1; });

module.exports = { warmSamples };
