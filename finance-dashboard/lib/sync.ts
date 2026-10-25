import "server-only";
import type { RemovedTransaction, Transaction as PlaidTransaction } from "plaid";
import { getPlaid, plaidErrorMessage } from "@/lib/plaid";
import { getServerSupabase } from "@/lib/db/server";
import { recordSnapshots } from "@/lib/snapshots";
import { categorize, isLiability, plaidAccountType, prettyPlaidCategory, txType } from "@/lib/categorize";

export type Item = { id: string; item_id: string; access_token: string; institution: string | null; cursor: string | null };

export async function syncItem(item: Item) {
  const plaid = getPlaid();
  const db = getServerSupabase();

  const { data: acc } = await plaid.accountsGet({ access_token: item.access_token });
  const now = new Date().toISOString();
  const accountRows = acc.accounts.map((a) => {
    const type = plaidAccountType(a.type);
    const raw = a.balances.current ?? a.balances.available ?? 0;
    return {
      external_id: a.account_id,
      name: a.official_name || a.name,
      type,
      institution: item.institution,
      balance: isLiability(type) ? -Math.abs(raw) : raw,
      currency: a.balances.iso_currency_code ?? "USD",
      plaid_item_id: item.id,
      updated_at: now,
    };
  });
  const { data: savedAccounts, error: accErr } = await db
    .from("accounts")
    .upsert(accountRows, { onConflict: "external_id" })
    .select("id, external_id, balance");
  if (accErr) throw new Error(accErr.message);
  await recordSnapshots(db, savedAccounts ?? []);
  const accountIdByPlaid = new Map((savedAccounts ?? []).map((a) => [a.external_id as string, a.id as string]));

  // /transactions/sync pagination; restart from the original cursor if data changes mid-pagination.
  let added: PlaidTransaction[] = [];
  let modified: PlaidTransaction[] = [];
  let removed: RemovedTransaction[] = [];
  let cursor = item.cursor ?? undefined;
  for (let attempt = 0; ; attempt++) {
    added = [];
    modified = [];
    removed = [];
    let next = item.cursor ?? undefined;
    try {
      let hasMore = true;
      while (hasMore) {
        const { data } = await plaid.transactionsSync({
          access_token: item.access_token,
          cursor: next,
          count: 500,
          options: { include_personal_finance_category: true },
        });
        added = added.concat(data.added);
        modified = modified.concat(data.modified);
        removed = removed.concat(data.removed);
        hasMore = data.has_more;
        next = data.next_cursor;
      }
      cursor = next;
      break;
    } catch (err) {
      const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
      if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && attempt < 3) continue;
      throw err;
    }
  }

  const changed = [...added, ...modified].filter((t) => !t.pending);
  // Keep categories the user already edited in the dashboard.
  const existing = new Map<string, string | null>();
  for (let i = 0; i < changed.length; i += 500) {
    const ids = changed.slice(i, i + 500).map((t) => t.transaction_id);
    const { data } = await db.from("transactions").select("external_id, category").in("external_id", ids);
    for (const r of data ?? []) existing.set(r.external_id as string, r.category as string | null);
  }

  const txRows = changed.map((t) => {
    const amount = -t.amount; // Plaid: positive = money out
    const payee = t.merchant_name || t.name || "";
    return {
      external_id: t.transaction_id,
      account_id: accountIdByPlaid.get(t.account_id) ?? null,
      date: t.authorized_date ?? t.date,
      payee,
      amount,
      category: existing.get(t.transaction_id) ?? categorize(payee, amount, prettyPlaidCategory(t.personal_finance_category?.primary)),
      type: txType(amount),
      raw_data: t as unknown as Record<string, unknown>,
    };
  });
  for (let i = 0; i < txRows.length; i += 500) {
    const { error } = await db.from("transactions").upsert(txRows.slice(i, i + 500), { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }
  const removedIds = removed.map((r) => r.transaction_id).filter(Boolean) as string[];
  for (let i = 0; i < removedIds.length; i += 500) {
    const { error } = await db.from("transactions").delete().in("external_id", removedIds.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  const { error: curErr } = await db.from("plaid_items").update({ cursor, updated_at: now }).eq("id", item.id);
  if (curErr) throw new Error(curErr.message);

  return { institution: item.institution, accounts: accountRows.length, upserted: txRows.length, removed: removedIds.length };
}

export type SyncResult = { ok: boolean; institution: string | null; accounts?: number; upserted?: number; removed?: number; error?: string };

export async function syncItems(filter?: { itemId?: string }): Promise<SyncResult[]> {
  let q = getServerSupabase().from("plaid_items").select("id, item_id, access_token, institution, cursor");
  if (filter?.itemId) q = q.eq("item_id", filter.itemId);
  const { data: items, error } = await q;
  if (error) throw new Error(error.message);
  const results: SyncResult[] = [];
  for (const item of (items ?? []) as Item[]) {
    try {
      results.push({ ok: true, ...(await syncItem(item)) });
    } catch (err) {
      results.push({ ok: false, institution: item.institution, error: plaidErrorMessage(err) });
    }
  }
  return results;
}
