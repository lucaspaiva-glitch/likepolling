import "server-only";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/server";
import { isLiability } from "@/lib/categorize";
import { internalTransferIds } from "@/lib/transfers";
import type { Account, Transaction } from "@/lib/types";

export interface CashFlowPoint {
  month: string;
  Income: number;
  Burn: number;
  Net: number;
}

export interface CategoryPoint {
  name: string;
  value: number;
}

export interface DashboardData {
  configured: boolean;
  error: string | null;
  accounts: Account[];
  transactions: Transaction[];
  kpis: {
    netWorth: number;
    assets: number;
    liabilities: number;
    income30: number;
    burn30: number;
    avgBurn3m: number;
    savingsRate12m: number | null;
    runwayMonths: number | null;
  };
  allocation: CategoryPoint[];
  cashFlow: CashFlowPoint[];
  categories: { d30: CategoryPoint[]; d90: CategoryPoint[]; m12: CategoryPoint[] };
  lastUpdated: string | null;
}

const PAGE = 1000; // PostgREST caps responses at 1,000 rows

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function emptyData(configured: boolean, error: string | null): DashboardData {
  return {
    configured,
    error,
    accounts: [],
    transactions: [],
    kpis: { netWorth: 0, assets: 0, liabilities: 0, income30: 0, burn30: 0, avgBurn3m: 0, savingsRate12m: null, runwayMonths: null },
    allocation: [],
    cashFlow: [],
    categories: { d30: [], d90: [], m12: [] },
    lastUpdated: null,
  };
}

async function loadTransactions(since: string): Promise<Transaction[]> {
  const db = getServerSupabase();
  const out: Transaction[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("transactions")
      .select("id, account_id, date, payee, amount, category, type")
      .gte("date", since)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) })));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function categoryTotals(txs: Transaction[], since: string, internal: Set<string>): CategoryPoint[] {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.amount >= 0 || t.date < since || internal.has(t.id)) continue;
    const c = t.category || "Uncategorized";
    totals.set(c, (totals.get(c) ?? 0) - t.amount);
  }
  return Array.from(totals, ([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return emptyData(false, null);

  const today = new Date();
  const start12 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const since12 = isoDay(start12);

  let accounts: Account[];
  let transactions: Transaction[];
  try {
    const [accRes, txs] = await Promise.all([
      getServerSupabase().from("accounts").select("id, name, type, institution, balance, currency, updated_at").order("balance", { ascending: false }),
      loadTransactions(since12),
    ]);
    if (accRes.error) throw new Error(accRes.error.message);
    accounts = ((accRes.data ?? []) as Account[]).map((a) => ({ ...a, balance: Number(a.balance) }));
    transactions = txs;
  } catch (err) {
    return emptyData(true, err instanceof Error ? err.message : String(err));
  }

  let assets = 0;
  let liabilities = 0;
  const buckets = new Map<string, number>();
  for (const a of accounts) {
    if (isLiability(a.type) || a.balance < 0) {
      liabilities += Math.abs(a.balance);
      continue;
    }
    assets += a.balance;
    const bucket = a.type === "investment" ? "Investments" : a.type === "cash" ? "Cash" : "Other";
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + a.balance);
  }
  const allocation = Array.from(buckets, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const months: string[] = [];
  for (let i = 0; i < 12; i++) months.push(isoDay(new Date(Date.UTC(start12.getUTCFullYear(), start12.getUTCMonth() + i, 1))).slice(0, 7));
  const byMonth = new Map(months.map((m) => [m, { income: 0, burn: 0 }]));
  const since30 = isoDay(new Date(today.getTime() - 30 * 864e5));
  const since90 = isoDay(new Date(today.getTime() - 90 * 864e5));
  let income30 = 0;
  let burn30 = 0;
  const internal = internalTransferIds(transactions);
  for (const t of transactions) {
    if (internal.has(t.id)) continue;
    const m = byMonth.get(monthKey(t.date));
    if (m) {
      if (t.amount >= 0) m.income += t.amount;
      else m.burn -= t.amount;
    }
    if (t.date >= since30) {
      if (t.amount >= 0) income30 += t.amount;
      else burn30 -= t.amount;
    }
  }
  const cashFlow = months.map((key) => {
    const v = byMonth.get(key)!;
    return { month: monthLabel(key), Income: Math.round(v.income), Burn: Math.round(v.burn), Net: Math.round(v.income - v.burn) };
  });

  const completed = months.slice(-4, -1).map((k) => byMonth.get(k)!.burn);
  const avgBurn3m = completed.reduce((s, v) => s + v, 0) / (completed.length || 1);
  const inc12 = cashFlow.reduce((s, p) => s + p.Income, 0);
  const burn12 = cashFlow.reduce((s, p) => s + p.Burn, 0);
  const cash = buckets.get("Cash") ?? 0;

  const lastUpdated = accounts.reduce<string | null>((max, a) => (!max || a.updated_at > max ? a.updated_at : max), null);

  return {
    configured: true,
    error: null,
    accounts,
    transactions,
    kpis: {
      netWorth: assets - liabilities,
      assets,
      liabilities,
      income30,
      burn30,
      avgBurn3m,
      savingsRate12m: inc12 > 0 ? (inc12 - burn12) / inc12 : null,
      runwayMonths: avgBurn3m > 0 ? cash / avgBurn3m : null,
    },
    allocation,
    cashFlow,
    categories: {
      d30: categoryTotals(transactions, since30, internal),
      d90: categoryTotals(transactions, since90, internal),
      m12: categoryTotals(transactions, since12, internal),
    },
    lastUpdated,
  };
}
