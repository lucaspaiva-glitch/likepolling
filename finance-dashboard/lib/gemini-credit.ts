import "server-only";

// Google's paid-tier prices in USD per 1M tokens (ai.google.dev/gemini-api/docs/pricing); output includes thinking.
const PRICES: Record<string, [input: number, output: number]> = {
  "gemini-3.1-flash-lite": [0.25, 1.5],
  "gemini-3.5-flash-lite": [0.3, 2.5],
};
const FALLBACK_PRICE: [number, number] = [0.3, 2.5]; // unknown model: the dearer price, so "left" is never too high

// Balance typed from Google AI Studio (EUR), stored as a hidden manual account row; newer than the last bank top-up wins.
export const GEMINI_READING_EXTERNAL_ID = "csv:manual:gemini credit";
export interface GeminiReading {
  eur: number;
  at: string; // when the balance was read in AI Studio
}

// Credit left counts from the latest AI Studio reading, or else the latest Google Cloud top-up in the bank.
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
  usdToEur: number | null; // ECB rate via Frankfurter, since AI Studio shows the credit in euros
  reading: GeminiReading | null; // set when "left" counts from an AI Studio reading
  leftEur: number | null;
}

export const emptyGeminiCredit = (configured = false, error: string | null = null): GeminiCredit => ({
  configured, error, topUp: null, topUpDate: null, spent: 0, requests: 0, left: null, outOfCredit: false, outSince: null, usdToEur: null,
  reading: null, leftEur: null,
});

type UsageRow = { model: string; input_tokens: number; output_tokens: number };

// Reads Like Polling's private gemini_usage table (its own Supabase project) with its server key.
export async function lp<T>(query: string): Promise<T> {
  const url = (process.env.LP_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (process.env.LP_SUPABASE_KEY ?? "").trim();
  const res = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Like Polling usage: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Free ECB rates, no key (github.com/lineofflight/frankfurter). Cached for a day; null if unreachable.
async function usdToEur(): Promise<number | null> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", { next: { revalidate: 86400 } });
    const rate = (await res.json())?.rates?.EUR;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

export function requestCost(r: UsageRow) {
  const [inP, outP] = PRICES[r.model] ?? FALLBACK_PRICE;
  return (r.input_tokens * inP + r.output_tokens * outP) / 1e6;
}

// topUps: Google Cloud charges from the bank (date, positive amount).
export async function loadGeminiCredit(
  topUps: Array<{ date: string; amount: number }>,
  reading: GeminiReading | null = null,
): Promise<GeminiCredit> {
  if (!process.env.LP_SUPABASE_URL || !process.env.LP_SUPABASE_KEY) return emptyGeminiCredit(false);
  try {
    const topUpDate = topUps.reduce<string | null>((d, t) => (!d || t.date > d ? t.date : d), null);
    // A top-up charged on or before the reading's day is already part of the reading.
    const useReading = !!reading && (!topUpDate || reading.at.slice(0, 10) >= topUpDate);
    const since = useReading ? new Date(reading!.at).toISOString() : topUpDate ? `${topUpDate}T00:00:00Z` : "";
    const ratePromise = usdToEur();
    const [lastOk, lastOut] = await Promise.all(
      ["ok", "no_credit"].map((s) => lp<Array<{ at: string }>>(`gemini_usage?select=at&status=eq.${s}&order=at.desc&limit=1`)),
    );
    const outAt = lastOut[0]?.at ?? null;
    const outOfCredit = !!outAt && new Date(outAt) > new Date(lastOk[0]?.at ?? 0) && new Date(outAt) > new Date(since || 0);
    const base = { ...emptyGeminiCredit(true), outOfCredit, outSince: outOfCredit ? outAt : null, usdToEur: await ratePromise };
    if (!useReading && !topUpDate) return base;

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
    const rate = base.usdToEur;
    if (useReading) {
      const leftEur = reading!.eur - (rate ? spent * rate : 0);
      return { ...base, reading, spent, requests, leftEur, left: rate ? leftEur / rate : null };
    }
    const topUp = topUps.filter((t) => t.date === topUpDate).reduce((s, t) => s + t.amount, 0);
    const left = topUp - spent;
    return { ...base, topUp, topUpDate, spent, requests, left, leftEur: rate ? left * rate : null };
  } catch (err) {
    return emptyGeminiCredit(true, err instanceof Error ? err.message : String(err));
  }
}
