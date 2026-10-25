import type { Transaction } from "@/lib/types";

const MAX_DAYS_APART = 4;

const cents = (amount: number) => Math.round(Math.abs(amount) * 100);
const daysApart = (a: Transaction, b: Transaction) => Math.abs(Date.parse(a.date) - Date.parse(b.date)) / 864e5;
const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

// Equal-and-opposite pairs that are not real income or spending:
// 1. Same account and description (refunds, brokerage entries that reverse each other).
// 2. Money moved between two linked accounts (e.g. Merrill paying the BofA card or funding checking).
// Closest pairs win, so a transfer pairs with its same-day counterpart before an earlier look-alike.
export function internalTransferIds(txs: Transaction[]): Set<string> {
  const inflowsByCents = new Map<number, Transaction[]>();
  for (const t of txs) {
    if (t.amount > 0 && t.account_id) inflowsByCents.set(cents(t.amount), [...(inflowsByCents.get(cents(t.amount)) ?? []), t]);
  }
  const sameAccount: Array<[Transaction, Transaction, number]> = [];
  const crossAccount: Array<[Transaction, Transaction, number]> = [];
  for (const out of txs) {
    if (out.amount >= 0 || !out.account_id) continue;
    for (const inflow of inflowsByCents.get(cents(out.amount)) ?? []) {
      const gap = daysApart(out, inflow);
      if (gap > MAX_DAYS_APART) continue;
      if (inflow.account_id !== out.account_id) crossAccount.push([out, inflow, gap]);
      else if (norm(inflow.payee) === norm(out.payee)) sameAccount.push([out, inflow, gap]);
    }
  }
  const matched = new Set<string>();
  for (const pairs of [sameAccount, crossAccount]) {
    pairs.sort((a, b) => a[2] - b[2]);
    for (const [out, inflow] of pairs) {
      if (matched.has(out.id) || matched.has(inflow.id)) continue;
      matched.add(out.id);
      matched.add(inflow.id);
    }
  }
  return matched;
}
