import type { Transaction } from "@/lib/types";

export const LIKE_POLLING_CATEGORY = "Like Polling";
export const LIKE_POLLING_REVENUE_CATEGORY = "Like Polling revenue";

// Payouts from the stores that sell Like Polling reports and ad spots.
const REVENUE: Array<[RegExp, string]> = [
  [/gumroad/i, "Gumroad"],
  [/lemon\s*squeezy/i, "Lemon Squeezy"],
];

export function likePollingRevenueSource(payee: string | null, descriptor: string | null): string | null {
  const text = `${payee ?? ""} ${descriptor ?? ""}`;
  return REVENUE.find(([re]) => re.test(text))?.[1] ?? null;
}

// Vendors that bill for running likepolling.com, matched on the payee or the bank descriptor.
const VENDORS: Array<[RegExp, string]> = [
  [/cognition|devin/i, "Devin (Cognition)"],
  [/google\s*cloud|\bcloud\b.*google\.com|google.*\bcloud\b/i, "Google Cloud (Gemini + YouTube API keys)"],
  [/chrome support|chrome web store/i, "Chrome Web Store"],
  [/poke by interaction|poke\.com/i, "Poke"],
  [/vercel/i, "Vercel"],
  [/supabase/i, "Supabase"],
  [/github/i, "GitHub"],
  [/namecheap|godaddy|porkbun|cloudflare|squarespace domains/i, "Domain"],
];

export function likePollingVendor(payee: string | null, descriptor: string | null): string | null {
  const text = `${payee ?? ""} ${descriptor ?? ""}`;
  return VENDORS.find(([re]) => re.test(text))?.[1] ?? null;
}

export interface LikePollingSummary {
  total: number;
  since: string | null;
  today: string;
  vendors: Array<{ name: string; total: number }>;
  daily: Array<{ date: string; spent: number }>;
  revenue: number;
  months: Array<{ month: string; costs: number; revenue: number }>; // newest first
}

export function likePollingSummary(txs: Transaction[], vendorOf: Map<string, string>, today: string): LikePollingSummary {
  const rows = txs.filter((t) => t.category === LIKE_POLLING_CATEGORY).sort((a, b) => a.date.localeCompare(b.date));
  const vendors = new Map<string, number>();
  const daily = new Map<string, number>();
  for (const t of rows) {
    const spent = -t.amount; // refunds (positive amounts) reduce the total
    const name = vendorOf.get(t.id) ?? t.payee ?? "Other";
    vendors.set(name, (vendors.get(name) ?? 0) + spent);
    daily.set(t.date, (daily.get(t.date) ?? 0) + spent);
  }
  const months = new Map<string, { costs: number; revenue: number }>();
  const monthOf = (k: string) => months.get(k) ?? months.set(k, { costs: 0, revenue: 0 }).get(k)!;
  for (const t of rows) monthOf(t.date.slice(0, 7)).costs += -t.amount;
  let revenue = 0;
  for (const t of txs.filter((t) => t.category === LIKE_POLLING_REVENUE_CATEGORY)) {
    revenue += t.amount;
    monthOf(t.date.slice(0, 7)).revenue += t.amount;
  }
  const list = Array.from(vendors, ([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  return {
    total: list.reduce((s, v) => s + v.total, 0),
    since: rows[0]?.date ?? null,
    today,
    vendors: list,
    daily: Array.from(daily, ([date, spent]) => ({ date, spent: Math.round(spent * 100) / 100 })),
    revenue,
    months: Array.from(months, ([month, m]) => ({ month, ...m })).sort((a, b) => b.month.localeCompare(a.month)),
  };
}
