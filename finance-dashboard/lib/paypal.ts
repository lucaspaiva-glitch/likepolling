import "server-only";
import { getServerSupabase } from "@/lib/db/server";
import { recordSnapshots } from "@/lib/snapshots";
import { txType } from "@/lib/categorize";

// Like Polling's store payouts land in PayPal (Brazilian account, R$). Read via PayPal's Reporting API
// (Live app with "Transaction Search"); amounts are stored in USD at the day's ECB rate, originals kept in raw_data.
const API = "https://api-m.paypal.com";
const DAYS = 90; // re-read window; PayPal allows at most 31 days per request
const ACCOUNT_EXTERNAL_ID = "paypal:balance";

export const isPayPalConfigured = () => !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;

interface Money {
  currency_code: string;
  value: string;
}
interface PayPalTx {
  transaction_info: {
    transaction_id: string;
    transaction_event_code: string;
    transaction_initiation_date: string;
    transaction_amount: Money;
    fee_amount?: Money;
    transaction_status: string;
    transaction_subject?: string;
  };
  payer_info?: { payer_name?: { alternate_full_name?: string }; email_address?: string };
}

async function token() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal login failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function get<T>(bearer: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${bearer}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`PayPal ${path.split("?")[0]} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function usdRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=USD`, { cache: "no-store" });
  if (!res.ok) throw new Error(`No ${currency}→USD rate (${res.status})`);
  const rate = ((await res.json()) as { rates?: { USD?: number } }).rates?.USD;
  if (!rate) throw new Error(`No ${currency}→USD rate`);
  return rate;
}

// T04xx = money moved to/from a bank; T11xx = reversals. Everything else in is a sale, out is a cost.
function categoryOf(code: string, amount: number) {
  if (code.startsWith("T04") || code.startsWith("T03")) return "Transfer";
  return amount > 0 ? "Like Polling revenue" : "Like Polling";
}

export async function syncPayPal() {
  const db = getServerSupabase();
  const bearer = await token();
  const now = new Date();

  const bal = await get<{ balances?: Array<{ currency: string; primary?: boolean; total_balance: Money }> }>(bearer, "/v1/reporting/balances");
  const rates = new Map<string, number>();
  const rate = async (c: string) => rates.get(c) ?? rates.set(c, await usdRate(c)).get(c)!;
  let balanceUsd = 0;
  const parts: string[] = [];
  for (const b of bal.balances ?? []) {
    const v = Number(b.total_balance.value);
    balanceUsd += v * (await rate(b.total_balance.currency_code));
    parts.push(`${b.total_balance.currency_code} ${v.toFixed(2)}`);
  }
  const { data: acc, error: accErr } = await db
    .from("accounts")
    .upsert(
      {
        external_id: ACCOUNT_EXTERNAL_ID,
        name: `PayPal${parts.length ? ` (${parts.join(", ")})` : ""}`,
        type: "cash",
        institution: "PayPal · Like Polling",
        balance: Math.round(balanceUsd * 100) / 100,
        currency: "USD",
        updated_at: now.toISOString(),
      },
      { onConflict: "external_id" },
    )
    .select("id, external_id, balance")
    .single();
  if (accErr) throw new Error(accErr.message);
  await recordSnapshots(db, [acc]);

  const txs: PayPalTx[] = [];
  for (let end = now.getTime(), i = 0; i < Math.ceil(DAYS / 30); i++, end -= 30 * 864e5) {
    const range = `start_date=${new Date(end - 30 * 864e5).toISOString().slice(0, 19)}Z&end_date=${new Date(end).toISOString().slice(0, 19)}Z`;
    for (let page = 1, pages = 1; page <= pages; page++) {
      const r = await get<{ transaction_details?: PayPalTx[]; total_pages?: number }>(
        bearer,
        `/v1/reporting/transactions?${range}&fields=transaction_info,payer_info&page_size=500&page=${page}`,
      );
      txs.push(...(r.transaction_details ?? []));
      pages = r.total_pages ?? 1;
    }
  }

  const { data: lockedRows } = await db
    .from("transactions")
    .select("external_id, category")
    .like("external_id", "paypal:%")
    .eq("raw_data->>category_locked", "true");
  const locked = new Map((lockedRows ?? []).map((r) => [r.external_id as string, r.category as string]));
  const rows = [];
  for (const t of txs) {
    const info = t.transaction_info;
    if (info.transaction_status !== "S") continue;
    const date = info.transaction_initiation_date.slice(0, 10);
    const r = await rate(info.transaction_amount.currency_code);
    const amount = Math.round(Number(info.transaction_amount.value) * r * 100) / 100;
    const payee = t.payer_info?.payer_name?.alternate_full_name || info.transaction_subject || "PayPal";
    const id = `paypal:${info.transaction_id}`;
    rows.push({
      external_id: id,
      account_id: acc.id,
      date,
      payee,
      amount,
      category: locked.get(id) ?? categoryOf(info.transaction_event_code, amount),
      type: txType(amount),
      raw_data: { ...t, usd_rate: r, ...(locked.has(id) ? { category_locked: true } : {}) },
    });
    const fee = Number(info.fee_amount?.value ?? 0);
    if (fee) {
      const feeUsd = Math.round(fee * r * 100) / 100;
      rows.push({
        external_id: `${id}:fee`,
        account_id: acc.id,
        date,
        payee: "PayPal fee",
        amount: feeUsd,
        category: "Like Polling",
        type: txType(feeUsd),
        raw_data: { fee: info.fee_amount, usd_rate: r, of: info.transaction_id },
      });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("transactions").upsert(rows.slice(i, i + 500), { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }
  return { institution: "PayPal", accounts: 1, upserted: rows.length };
}
