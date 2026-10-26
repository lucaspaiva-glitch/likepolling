import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { category?: unknown };
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 80) : "";
  if (!category) return NextResponse.json({ error: "category is required" }, { status: 400 });

  const db = getServerSupabase();
  const { data: current, error: readErr } = await db.from("transactions").select("raw_data").eq("id", params.id).single();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 });
  // category_locked: a category you chose yourself wins over automatic rules like Vacation detection.
  const raw_data = { ...((current?.raw_data as Record<string, unknown> | null) ?? {}), category_locked: true };
  const { data, error } = await db
    .from("transactions")
    .update({ category, raw_data })
    .eq("id", params.id)
    .select("id, category")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
