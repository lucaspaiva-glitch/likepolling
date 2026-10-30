import type { Transaction } from "@/lib/types";

export const LIKE_POLLING_CATEGORY = "Like Polling";

// Vendors that bill for running likepolling.com, matched on the payee or the bank descriptor.
const VENDORS: Array<[RegExp, string]> = [
  [/cognition|devin/i, "Devin (Cognition)"],
  [/google\s*cloud|\bcloud\b.*google\.com|google.*\bcloud\b/i, "Google Cloud"],
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
  last30: number;
  vendors: Array<{ name: string; total: number; last30: number }>;
  monthly: Array<{ month: string; Spent: number }>;
}

export function likePollingSummary(txs: Transaction[], vendorOf: Map<string, string>, since30: string): LikePollingSummary {
  const rows = txs.filter((t) => t.category === LIKE_POLLING_CATEGORY).sort((a, b) => a.date.localeCompare(b.date));
  const vendors = new Map<string, { name: string; total: number; last30: number }>();
  const monthly = new Map<string, number>();
  for (const t of rows) {
    const spent = -t.amount; // refunds (positive amounts) reduce the total
    const name = vendorOf.get(t.id) ?? t.payee ?? "Other";
    const v = vendors.get(name) ?? { name, total: 0, last30: 0 };
    v.total += spent;
    if (t.date >= since30) v.last30 += spent;
    vendors.set(name, v);
    monthly.set(t.date.slice(0, 7), (monthly.get(t.date.slice(0, 7)) ?? 0) + spent);
  }
  const list = Array.from(vendors.values()).sort((a, b) => b.total - a.total);
  return {
    total: list.reduce((s, v) => s + v.total, 0),
    since: rows[0]?.date ?? null,
    last30: list.reduce((s, v) => s + v.last30, 0),
    vendors: list,
    monthly: Array.from(monthly, ([month, Spent]) => ({ month, Spent: Math.round(Spent * 100) / 100 })),
  };
}
