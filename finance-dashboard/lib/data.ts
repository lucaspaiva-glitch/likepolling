import "server-only";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/server";
import { isLiability } from "@/lib/categorize";
import { internalTransferIds } from "@/lib/transfers";
import { BR_FOREIGN_INVESTMENT_RATE, TAX_ACCOUNT_EXTERNAL_ID, irpfFilingYear } from "@/lib/br-tax";
import { fmtUsd } from "@/lib/format";
import type { Account, Transaction } from "@/lib/types";

export interface CategoryPoint {
  name: string;
  value: number;
}

export interface PortfolioPoint {
  date: string;
  Value: number;
}

export interface DashboardData {
  configured: boolean;
  error: string | null;
  accounts: Account[];
  transactions: Transaction[];
  kpis: {
    checking: number;
    cardOwed: number;
    cardPending: number;
    estimatedTaxes: number;
    moneyToSpend: number;
    cardSpentSincePayment: number;
    lastCardPayment: string | null;
    netWorth: number;
    portfolio: number;
    portfolioStart: number | null;
    portfolioStartDate: string | null;
    portfolioChangePct: number | null;
    portfolioChangeExWithdrawalsPct: number | null;
  };
  allocation: CategoryPoint[];
  portfolioSeries: PortfolioPoint[];
  snapshotsReady: boolean;
  categories: { d30: CategoryPoint[]; d90: CategoryPoint[]; m12: CategoryPoint[] };
  lastUpdated: string | null;
}

const PAGE = 1000; // PostgREST caps responses at 1,000 rows

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}


function emptyData(configured: boolean, error: string | null): DashboardData {
  return {
    configured,
    error,
    accounts: [],
    transactions: [],
    kpis: {
      checking: 0,
      cardOwed: 0,
      cardPending: 0,
      estimatedTaxes: 0,
      moneyToSpend: 0,
      cardSpentSincePayment: 0,
      lastCardPayment: null,
      netWorth: 0,
      portfolio: 0,
      portfolioStart: null,
      portfolioStartDate: null,
      portfolioChangePct: null,
      portfolioChangeExWithdrawalsPct: null,
    },
    allocation: [],
    portfolioSeries: [],
    snapshotsReady: false,
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
      .select("id, account_id, date, payee, amount, category, type, pending:raw_data->pending")
      .gte("date", since)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount), pending: t.pending === true })));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type Flow = { income: number; burn: number };

const isCardPayment = (t: Transaction) =>
  t.amount > 0 && (t.category === "Transfer" || t.category === "Loan payments" || /\bpayment\b/i.test(t.payee ?? ""));

async function loadSnapshots(accountIds: string[]): Promise<{ rows: Array<{ account_id: string; date: string; balance: number }>; ok: boolean }> {
  if (accountIds.length === 0) return { rows: [], ok: true };
  const rows: Array<{ account_id: string; date: string; balance: number }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getServerSupabase()
      .from("balance_snapshots")
      .select("account_id, date, balance")
      .in("account_id", accountIds)
      .order("date", { ascending: true })
      .order("account_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], ok: false };
    rows.push(...(data ?? []).map((r) => ({ account_id: r.account_id as string, date: r.date as string, balance: Number(r.balance) })));
    if (!data || data.length < PAGE) return { rows, ok: true };
  }
}

// How a transaction moves income/spending. Transfers between your accounts and securities trades move
// neither; credit-card refunds reduce spending; negative investment income (e.g. accrued bond interest
// paid on purchase) reduces income.
function flowOf(t: Transaction, accountType: Map<string, string>, internal: Set<string>, investmentHistoryStart: string | null): Flow | null {
  if (internal.has(t.id) || t.category === "Trades") return null;
  const type = (t.account_id && accountType.get(t.account_id)) || "";
  if (t.amount >= 0) {
    if (isLiability(type)) {
      // Card payments whose other side isn't tracked are still transfers, not refunds.
      if (isCardPayment(t)) return null;
      return { income: 0, burn: -t.amount };
    }
    // Brokerage → bank transfers from before the brokerage history begins have no counterpart to pair with.
    if (type !== "investment" && t.category === "Investments" && investmentHistoryStart && t.date < investmentHistoryStart) return null;
    return { income: t.amount, burn: 0 };
  }
  if (t.category === "Income") return { income: t.amount, burn: 0 };
  return { income: 0, burn: -t.amount };
}

function categoryTotals(txs: Transaction[], since: string, flows: Map<string, Flow>): CategoryPoint[] {
  const totals = new Map<string, number>();
  for (const t of txs) {
    const f = flows.get(t.id);
    if (!f || f.burn === 0 || t.date < since) continue;
    const c = t.category || "Uncategorized";
    totals.set(c, (totals.get(c) ?? 0) + f.burn);
  }
  return Array.from(totals, ([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
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
      getServerSupabase().from("accounts").select("id, name, type, institution, balance, currency, updated_at, external_id").order("balance", { ascending: false }),
      loadTransactions(since12),
    ]);
    if (accRes.error) throw new Error(accRes.error.message);
    accounts = ((accRes.data ?? []) as Account[]).map((a) => ({ ...a, balance: Number(a.balance) }));
    transactions = txs;
  } catch (err) {
    return emptyData(true, err instanceof Error ? err.message : String(err));
  }


  const todayIso = isoDay(today);
  const accountType = new Map(accounts.map((a) => [a.id, a.type]));
  const investmentIds = new Set(accounts.filter((a) => a.type === "investment").map((a) => a.id));
  const investmentHistoryStart = transactions.reduce<string | null>(
    (min, t) => (t.account_id && investmentIds.has(t.account_id) && (!min || t.date < min) ? t.date : min),
    null,
  );
  const internal = internalTransferIds(transactions);
  const flows = new Map<string, Flow>();
  for (const t of transactions) {
    const f = flowOf(t, accountType, internal, investmentHistoryStart);
    if (f) flows.set(t.id, f);
  }

  // Brazil taxes foreign investment income at 15% a year (Law 14.754/2023), declared the following May.
  // Estimate: investment income received so far in the tax year, projected to Dec 31 at the same daily pace.
  const taxYear = irpfFilingYear(today) - 1;
  const taxYearEnd = `${taxYear}-12-31`;
  const incomeFrom = [`${taxYear}-01-01`, investmentHistoryStart ?? todayIso].sort()[1];
  const investmentIncome = transactions
    .filter((t) => t.account_id && investmentIds.has(t.account_id) && t.date.startsWith(`${taxYear}-`))
    .reduce((sum, t) => sum + (flows.get(t.id)?.income ?? 0), 0);
  const dayCount = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const projectedIncome =
    todayIso >= taxYearEnd ? investmentIncome : (investmentIncome * dayCount(incomeFrom, taxYearEnd)) / dayCount(incomeFrom, todayIso);
  const taxEstimate = Math.round(projectedIncome * BR_FOREIGN_INVESTMENT_RATE);
  accounts = accounts.map((a) =>
    a.external_id === TAX_ACCOUNT_EXTERNAL_ID
      ? {
          ...a,
          balance: -taxEstimate,
          institution: `15% of ${fmtUsd(projectedIncome)} ${taxYear} investment income (${fmtUsd(investmentIncome)} so far${todayIso >= taxYearEnd ? "" : ", rest projected"})`,
        }
      : a,
  );

  let assets = 0;
  let liabilities = 0;
  let checking = 0;
  let cardOwed = 0;
  let estimatedTaxes = 0;
  let portfolio = 0;
  const buckets = new Map<string, number>();
  for (const a of accounts) {
    if (isLiability(a.type) || a.balance < 0) {
      liabilities += Math.abs(a.balance);
      if (a.type === "credit") cardOwed += Math.abs(a.balance);
      else estimatedTaxes += Math.abs(a.balance);
      continue;
    }
    assets += a.balance;
    if (a.type === "cash") checking += a.balance;
    if (a.type === "investment") portfolio += a.balance;
    const bucket = a.type === "investment" ? "Investments" : a.type === "cash" ? "Cash" : "Other";
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + a.balance);
  }
  const allocation = Array.from(buckets, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Card: amount owed comes from the bank; spending is everything charged since the last payment.
  const creditIds = new Set(accounts.filter((a) => a.type === "credit").map((a) => a.id));
  const cardTx = transactions.filter((t) => t.account_id && creditIds.has(t.account_id));
  // The bank's card balance only has posted charges; add pending ones so owed matches spending.
  const cardPending = Math.round(-cardTx.filter((t) => t.pending).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  cardOwed += cardPending;
  liabilities += cardPending;
  const lastCardPayment = cardTx.filter(isCardPayment).reduce<string | null>((max, t) => (!max || t.date > max ? t.date : max), null);
  const cardSpentSincePayment = cardTx
    .filter((t) => !lastCardPayment || t.date > lastCardPayment)
    .reduce((sum, t) => sum + (flows.get(t.id)?.burn ?? 0), 0);

  // Portfolio history: carry each investment account's last known balance forward day by day.
  const snaps = await loadSnapshots(Array.from(investmentIds));
  const lastKnown = new Map<string, number>();
  const portfolioSeries: PortfolioPoint[] = [];
  for (const r of snaps.rows) {
    lastKnown.set(r.account_id, r.balance);
    const value = Math.round(Array.from(lastKnown.values()).reduce((s, v) => s + v, 0) * 100) / 100;
    const last = portfolioSeries[portfolioSeries.length - 1];
    if (last?.date === r.date) last.Value = value;
    else portfolioSeries.push({ date: r.date, Value: value });
  }
  const current = Math.round(portfolio * 100) / 100;
  const tail = portfolioSeries[portfolioSeries.length - 1];
  if (investmentIds.size > 0 && (!tail || tail.Value !== current)) {
    if (tail?.date === todayIso) tail.Value = current;
    else portfolioSeries.push({ date: todayIso, Value: current });
  }
  const startPoint = portfolioSeries[0] ?? null;
  // Withdrawals to your own accounts lower the balance without being a loss; add them back for the return.
  const netTransfers = startPoint
    ? transactions
        .filter((t) => t.account_id && investmentIds.has(t.account_id) && t.category === "Transfer" && t.date > startPoint.date)
        .reduce((s, t) => s + t.amount, 0)
    : 0;
  const portfolioChangePct = startPoint && startPoint.Value > 0 ? (current - startPoint.Value) / startPoint.Value : null;
  const portfolioChangeExWithdrawalsPct =
    startPoint && startPoint.Value > 0 && netTransfers !== 0 ? (current - startPoint.Value - netTransfers) / startPoint.Value : null;

  const since30 = isoDay(new Date(today.getTime() - 30 * 864e5));
  const since90 = isoDay(new Date(today.getTime() - 90 * 864e5));
  const lastUpdated = accounts.reduce<string | null>((max, a) => (!max || a.updated_at > max ? a.updated_at : max), null);

  return {
    configured: true,
    error: null,
    accounts,
    transactions,
    kpis: {
      checking,
      cardOwed,
      cardPending,
      estimatedTaxes,
      moneyToSpend: checking - cardOwed - estimatedTaxes,
      cardSpentSincePayment,
      lastCardPayment,
      netWorth: assets - liabilities + estimatedTaxes,
      portfolio,
      portfolioStart: startPoint?.Value ?? null,
      portfolioStartDate: startPoint?.date ?? null,
      portfolioChangePct,
      portfolioChangeExWithdrawalsPct,
    },
    allocation,
    portfolioSeries,
    snapshotsReady: snaps.ok,
    categories: {
      d30: categoryTotals(transactions, since30, flows),
      d90: categoryTotals(transactions, since90, flows),
      m12: categoryTotals(transactions, since12, flows),
    },
    lastUpdated,
  };
}
