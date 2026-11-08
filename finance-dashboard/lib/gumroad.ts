import "server-only";
import { getServerSupabase } from "@/lib/db/server";
import { txType } from "@/lib/categorize";

// Like Polling's Gumroad store: each sale is revenue, Gumroad's cut a cost. Payouts go to a bank Vault doesn't track,
// so this account has no balance of its own; it only holds the sales.
const API = "https://api.gumroad.com/v2";
const ACCOUNT_EXTERNAL_ID = "gumroad:sales";

export const isGumroadConfigured = () => !!process.env.GUMROAD_ACCESS_TOKEN;

interface Sale {
  id: string;
  created_at: string;
  product_name: string;
  price: number; // cents, seller currency (USD)
  gumroad_fee?: number; // cents
  refunded?: boolean;
  chargedback?: boolean;
}

export async function syncGumroad() {
  const db = getServerSupabase();
  const sales: Sale[] = [];
  for (let pageKey: string | undefined, i = 0; i < 100; i++) {
    const res = await fetch(`${API}/sales${pageKey ? `?page_key=${encodeURIComponent(pageKey)}` : ""}`, {
      headers: { Authorization: `Bearer ${process.env.GUMROAD_ACCESS_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gumroad sales failed (${res.status})`);
    const r = (await res.json()) as { success: boolean; message?: string; sales?: Sale[]; next_page_key?: string };
    if (!r.success) throw new Error(`Gumroad: ${r.message ?? "request failed"}`);
    sales.push(...(r.sales ?? []));
    pageKey = r.next_page_key;
    if (!pageKey) break;
  }

  const { data: acc, error: accErr } = await db
    .from("accounts")
    .upsert(
      {
        external_id: ACCOUNT_EXTERNAL_ID,
        name: "Gumroad sales",
        type: "other",
        institution: "Gumroad · Like Polling",
        balance: 0,
        currency: "USD",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_id" },
    )
    .select("id")
    .single();
  if (accErr) throw new Error(accErr.message);

  const rows = [];
  const undone: string[] = [];
  for (const s of sales) {
    const id = `gumroad:${s.id}`;
    if (s.refunded || s.chargedback) {
      undone.push(id, `${id}:fee`);
      continue;
    }
    const date = s.created_at.slice(0, 10);
    const amount = s.price / 100;
    rows.push({
      external_id: id,
      account_id: acc.id,
      date,
      payee: `Gumroad · ${s.product_name}`,
      amount,
      category: "Like Polling revenue",
      type: txType(amount),
      raw_data: { source: "gumroad", sale_id: s.id, product: s.product_name, price_cents: s.price },
    });
    if (s.gumroad_fee) {
      const fee = -s.gumroad_fee / 100;
      rows.push({
        external_id: `${id}:fee`,
        account_id: acc.id,
        date,
        payee: "Gumroad fee",
        amount: fee,
        category: "Like Polling",
        type: txType(fee),
        raw_data: { source: "gumroad", of: s.id, fee_cents: s.gumroad_fee },
      });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("transactions").upsert(rows.slice(i, i + 500), { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }
  if (undone.length) await db.from("transactions").delete().in("external_id", undone);
  return { institution: "Gumroad", accounts: 1, upserted: rows.length };
}
