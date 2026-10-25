import { createHash } from "node:crypto";
import { recordSnapshots } from "@/lib/snapshots";
import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/server";
import { categorize, txType } from "@/lib/categorize";
import type { ImportRow } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  accountId?: string;
  newAccount?: { name: string; type: string; institution: string; balance?: number | null };
  latestBalance?: number | null;
  rows?: ImportRow[];
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  if (rows.length > 20000) return NextResponse.json({ error: "Too many rows (max 20,000 per file)" }, { status: 413 });

  const db = getServerSupabase();
  let accountId = body.accountId;

  if (!accountId) {
    const na = body.newAccount;
    if (!na?.name?.trim()) return NextResponse.json({ error: "Choose an account or name a new one" }, { status: 400 });
    const balance = body.latestBalance ?? na.balance ?? 0;
    const { data, error } = await db
      .from("accounts")
      .upsert(
        {
          external_id: `csv:${na.institution}:${na.name.trim()}`.toLowerCase(),
          name: na.name.trim(),
          type: na.type || "cash",
          institution: na.institution || null,
          balance: Number.isFinite(balance) ? balance : 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "external_id" },
      )
      .select("id, balance")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    accountId = data.id as string;
    await recordSnapshots(db, [data]);
  } else if (body.latestBalance != null && Number.isFinite(body.latestBalance)) {
    await db.from("accounts").update({ balance: body.latestBalance, updated_at: new Date().toISOString() }).eq("id", accountId);
    await recordSnapshots(db, [{ id: accountId, balance: body.latestBalance }]);
  }

  // Stable ids so re-importing the same export does not create duplicates;
  // identical rows within one file are disambiguated by their occurrence count.
  const seen = new Map<string, number>();
  const records = rows
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.amount))
    .map((r) => {
      const key = `${accountId}|${r.date}|${r.payee}|${r.amount.toFixed(2)}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const payee = String(r.payee ?? "").slice(0, 500);
      return {
        external_id: "csv:" + createHash("sha1").update(`${key}|${n}`).digest("hex"),
        account_id: accountId,
        date: r.date,
        payee,
        amount: r.amount,
        category: categorize(payee, r.amount, r.category || null),
        type: txType(r.amount),
        raw_data: r.raw ?? null,
      };
    });

  let inserted = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { data, error } = await db
      .from("transactions")
      .upsert(records.slice(i, i + 500), { onConflict: "external_id", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ error: error.message, inserted }, { status: 500 });
    inserted += data?.length ?? 0;
  }
  return NextResponse.json({ accountId, received: rows.length, inserted, skipped: records.length - inserted });
}
