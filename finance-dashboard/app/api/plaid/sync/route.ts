import { NextResponse } from "next/server";
import { isPlaidConfigured } from "@/lib/plaid";
import { isSupabaseConfigured } from "@/lib/db/server";
import { syncItems } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!isPlaidConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Plaid and Supabase must both be configured." }, { status: 503 });
  }
  try {
    const items = await syncItems();
    const allFailed = items.length > 0 && items.every((r) => !r.ok);
    return NextResponse.json({ items }, { status: allFailed ? 502 : 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
