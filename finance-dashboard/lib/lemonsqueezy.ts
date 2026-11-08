import "server-only";
import { getServerSupabase } from "@/lib/db/server";
import { txType } from "@/lib/categorize";

// Like Polling's Lemon Squeezy store (merchant of record, so tax is theirs): each paid order's pre-tax price is revenue.
// Test-mode orders are skipped. Lemon Squeezy's own fee isn't in the order data, so it isn't counted as a cost.
const API = "https://api.lemonsqueezy.com/v1";
const ACCOUNT_EXTERNAL_ID = "lemonsqueezy:sales";

export const isLemonSqueezyConfigured = () => !!process.env.LEMONSQUEEZY_API_KEY;

interface Order {
  id: string;
  attributes: {
    created_at: string;
    status: string;
    test_mode: boolean;
    refunded: boolean;
    subtotal_usd: number;
    discount_total_usd: number;
    first_order_item?: { product_name?: string };
  };
}

export async function syncLemonSqueezy() {
  const db = getServerSupabase();
  const orders: Order[] = [];
  for (let url: string | undefined = `${API}/orders?page[size]=100`, i = 0; url && i < 100; i++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`, Accept: "application/vnd.api+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Lemon Squeezy orders failed (${res.status})`);
    const r = (await res.json()) as { data?: Order[]; links?: { next?: string } };
    orders.push(...(r.data ?? []));
    url = r.links?.next;
  }

  const { data: acc, error: accErr } = await db
    .from("accounts")
    .upsert(
      {
        external_id: ACCOUNT_EXTERNAL_ID,
        name: "Lemon Squeezy sales",
        type: "other",
        institution: "Lemon Squeezy · Like Polling",
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
  for (const o of orders) {
    const a = o.attributes;
    const id = `lemonsqueezy:${o.id}`;
    if (a.test_mode) continue;
    if (a.status !== "paid" || a.refunded) {
      undone.push(id);
      continue;
    }
    const amount = Math.round((a.subtotal_usd - (a.discount_total_usd ?? 0))) / 100;
    const product = a.first_order_item?.product_name ?? "order";
    rows.push({
      external_id: id,
      account_id: acc.id,
      date: a.created_at.slice(0, 10),
      payee: `Lemon Squeezy · ${product}`,
      amount,
      category: "Like Polling revenue",
      type: txType(amount),
      raw_data: { source: "lemonsqueezy", order_id: o.id, product, subtotal_usd: a.subtotal_usd, discount_usd: a.discount_total_usd },
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("transactions").upsert(rows.slice(i, i + 500), { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }
  if (undone.length) await db.from("transactions").delete().in("external_id", undone);
  return { institution: "Lemon Squeezy", accounts: 1, upserted: rows.length };
}
