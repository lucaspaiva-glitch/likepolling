import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/server";

export const dynamic = "force-dynamic";

// Manual balance updates for CSV-imported accounts; Plaid-linked balances are overwritten on every sync.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { balance?: unknown };
  const balance = typeof body.balance === "number" ? body.balance : Number(body.balance);
  if (!Number.isFinite(balance)) return NextResponse.json({ error: "balance must be a number" }, { status: 400 });

  const { data, error } = await getServerSupabase()
    .from("accounts")
    .update({ balance, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .like("external_id", "csv:%")
    .select("id, balance")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Only CSV-imported accounts can be edited" }, { status: 404 });
  return NextResponse.json(data);
}
