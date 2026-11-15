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

// Plans that bill every month even before their first charge shows up at the bank.
const FIXED_PLANS: Record<string, number> = { Supabase: 25 };
const ONE_OFF = new Set(["Chrome Web Store", "Domain"]);

export interface LikePollingPlan {
  basis: string; // the last full month the amounts come from (YYYY-MM)
  vendors: Array<{ name: string; monthly: number }>;
  months: Array<{ month: string; total: number }>; // the next 3 months, oldest first
}

const addMonths = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

// Next 3 months: each vendor's bills from last month, or this month if higher (new plans), plus fixed plans not billed yet.
export function likePollingPlan(rows: Transaction[], vendorOf: Map<string, string>, today: string): LikePollingPlan {
  const basis = addMonths(today.slice(0, 7), -1);
  const now = today.slice(0, 7);
  const spent = new Map<string, Record<string, number>>();
  for (const t of rows) {
    const m = t.date.slice(0, 7);
    const name = vendorOf.get(t.id) ?? t.payee ?? "Other";
    if ((m !== basis && m !== now) || ONE_OFF.has(name)) continue;
    const v = spent.get(name) ?? spent.set(name, {}).get(name)!;
    v[m] = (v[m] ?? 0) - t.amount;
  }
  const last = new Map(Array.from(spent, ([name, v]) => [name, Math.max(v[basis] ?? 0, v[now] ?? 0)]));
  for (const [name, amount] of Object.entries(FIXED_PLANS)) last.set(name, Math.max(last.get(name) ?? 0, amount));
  const vendors = Array.from(last, ([name, monthly]) => ({ name, monthly: Math.round(monthly * 100) / 100 }))
    .filter((v) => v.monthly > 0).sort((a, b) => b.monthly - a.monthly);
  const total = vendors.reduce((s, v) => s + v.monthly, 0);
  return { basis, vendors, months: [1, 2, 3].map((n) => ({ month: addMonths(today.slice(0, 7), n), total })) };
}

export interface LikePollingSummary {
  total: number;
  since: string | null;
  today: string;
  vendors: Array<{ name: string; total: number }>;
  daily: Array<{ date: string; spent: number }>;
  revenue: number;
  months: Array<{ month: string; costs: number; revenue: number }>; // newest first
  plan: LikePollingPlan;
  cash?: number | null; // Like Polling's PayPal balance, when connected
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
    plan: likePollingPlan(rows, vendorOf, today),
  };
}
