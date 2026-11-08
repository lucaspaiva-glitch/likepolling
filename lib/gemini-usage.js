// Saves the size of every Gemini request (and "out of credit" answers) in public.gemini_usage, so Vault can
// show how much prepaid Gemini credit is left. Never throws: a failed save must not stop a routine.
'use strict';
const path = require('path');

const scriptName = () => (require.main && require.main.filename ? path.basename(require.main.filename, '.js') : 'api');
// Gemini answers HTTP 402 when the prepaid credit is used up (429 is only a rate limit).
const isNoCredit = (err) => !!err && (err.status === 402 || /\b402\b/.test(String(err.message)));

async function logGemini(row, { env = process.env, fetchImpl = fetch } = {}) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(env.SUPABASE_KEY || '').trim();
  if (!url || !key) return;
  const u = row.usage || {};
  try {
    await fetchImpl(`${url}/rest/v1/gemini_usage`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        source: row.source || scriptName(),
        model: row.model,
        status: row.status || 'ok',
        input_tokens: u.promptTokenCount || 0,
        output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
      }),
    });
  } catch { /* best effort */ }
}

module.exports = { logGemini, isNoCredit };
