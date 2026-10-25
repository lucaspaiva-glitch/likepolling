import type { Transaction } from "@/lib/types";

const MAX_DAYS_APART = 4;

// Money moved between two linked accounts (e.g. Merrill paying the BofA card) shows up once as an
// outflow and once as an inflow; pair them so they count as neither income nor spending.
export function internalTransferIds(txs: Transaction[]): Set<string> {
  const inflowsByCents = new Map<number, Transaction[]>();
  for (const t of txs) {
    if (t.amount > 0 && t.account_id) {
      const cents = Math.round(t.amount * 100);
      inflowsByCents.set(cents, [...(inflowsByCents.get(cents) ?? []), t]);
    }
  }
  const matched = new Set<string>();
  for (const out of txs) {
    if (out.amount >= 0 || !out.account_id) continue;
    const candidates = inflowsByCents.get(Math.round(-out.amount * 100)) ?? [];
    let best: Transaction | null = null;
    let bestGap = Infinity;
    for (const inflow of candidates) {
      if (matched.has(inflow.id) || inflow.account_id === out.account_id) continue;
      const gap = Math.abs(Date.parse(inflow.date) - Date.parse(out.date)) / 864e5;
      if (gap <= MAX_DAYS_APART && gap < bestGap) {
        best = inflow;
        bestGap = gap;
      }
    }
    if (best) {
      matched.add(out.id);
      matched.add(best.id);
    }
  }
  return matched;
}
