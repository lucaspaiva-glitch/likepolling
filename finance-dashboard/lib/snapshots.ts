import type { SupabaseClient } from "@supabase/supabase-js";

// One balance per account per day; the latest write of the day wins.
export async function recordSnapshots(db: SupabaseClient, accounts: Array<{ id: string; balance: number | string | null }>) {
  if (accounts.length === 0) return;
  const date = new Date().toISOString().slice(0, 10);
  const { error } = await db
    .from("balance_snapshots")
    .upsert(accounts.map((a) => ({ account_id: a.id, date, balance: Number(a.balance ?? 0) })), { onConflict: "account_id,date" });
  if (error) console.warn("balance snapshot skipped:", error.message);
}
