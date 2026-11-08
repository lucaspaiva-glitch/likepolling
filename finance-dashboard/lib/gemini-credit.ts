import "server-only";

// Google's paid-tier prices in USD per 1M tokens (ai.google.dev/gemini-api/docs/pricing); output includes thinking.
const PRICES: Record<string, [input: number, output: number]> = {
  "gemini-3.1-flash-lite": [0.25, 1.5],
  "gemini-3.5-flash-lite": [0.3, 2.5],
};
const FALLBACK_PRICE: [number, number] = [0.3, 2.5]; // unknown model: the dearer price, so "left" is never too high

// Credit left counts from the latest Google Cloud top-up in the bank; credit left over from before it is not known.
export interface GeminiCredit {
  configured: boolean;
  error: string | null;
  topUp: number | null;
  topUpDate: string | null;
  spent: number; // Like Polling's Gemini requests since the top-up day, at Google's prices
  requests: number;
  left: number | null;
  outOfCredit: boolean;
  outSince: string | null;
}

export const emptyGeminiCredit = (configured = false, error: string | null = null): GeminiCredit => ({
  configured, error, topUp: null, topUpDate: null, spent: 0, requests: 0, left: null, outOfCredit: false, outSince: null,
});

type UsageRow = { model: string; input_tokens: number; output_tokens: number };

// Reads Like Polling's private gemini_usage table (its own Supabase project) with its server key.
async function lp<T>(query: string): Promise<T> {
  const url = (process.env.LP_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (process.env.LP_SUPABASE_KEY ?? "").trim();
  const res = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Like Polling usage: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function requestCost(r: UsageRow) {
  const [inP, outP] = PRICES[r.model] ?? FALLBACK_PRICE;
  return (r.input_tokens * inP + r.output_tokens * outP) / 1e6;
}

// topUps: Google Cloud charges from the bank (date, positive amount).
export async function loadGeminiCredit(topUps: Array<{ date: string; amount: number }>): Promise<GeminiCredit> {
  if (!process.env.LP_SUPABASE_URL || !process.env.LP_SUPABASE_KEY) return emptyGeminiCredit(false);
  try {
    const topUpDate = topUps.reduce<string | null>((d, t) => (!d || t.date > d ? t.date : d), null);
    const since = topUpDate ? `${topUpDate}T00:00:00Z` : "";
    const [lastOk, lastOut] = await Promise.all(
      ["ok", "no_credit"].map((s) => lp<Array<{ at: string }>>(`gemini_usage?select=at&status=eq.${s}&order=at.desc&limit=1`)),
    );
    const outAt = lastOut[0]?.at ?? null;
    const outOfCredit = !!outAt && new Date(outAt) > new Date(lastOk[0]?.at ?? 0) && new Date(outAt) > new Date(since || 0);
    const base = { ...emptyGeminiCredit(true), outOfCredit, outSince: outOfCredit ? outAt : null };
    if (!topUpDate) return base;

    let spent = 0;
    let requests = 0;
    for (let from = 0; ; from += 1000) {
      const rows = await lp<UsageRow[]>(
        `gemini_usage?select=model,input_tokens,output_tokens&status=eq.ok&at=gte.${encodeURIComponent(since)}&order=id.asc&offset=${from}&limit=1000`,
      );
      for (const r of rows) spent += requestCost(r);
      requests += rows.length;
      if (rows.length < 1000) break;
    }
    const topUp = topUps.filter((t) => t.date === topUpDate).reduce((s, t) => s + t.amount, 0);
    return { ...base, topUp, topUpDate, spent, requests, left: topUp - spent };
  } catch (err) {
    return emptyGeminiCredit(true, err instanceof Error ? err.message : String(err));
  }
}
