import { NextResponse } from "next/server";
import { isPlaidConfigured } from "@/lib/plaid";
import { isSupabaseConfigured } from "@/lib/db/server";
import { syncItems } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called daily by Vercel Cron (see vercel.json); Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPlaidConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Plaid and Supabase must both be configured." }, { status: 503 });
  }
  try {
    const items = await syncItems();
    return NextResponse.json({ items }, { status: items.some((r) => !r.ok) ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
