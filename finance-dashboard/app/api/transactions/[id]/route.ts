import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { category?: unknown };
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 80) : "";
  if (!category) return NextResponse.json({ error: "category is required" }, { status: 400 });

  const { data, error } = await getServerSupabase()
    .from("transactions")
    .update({ category })
    .eq("id", params.id)
    .select("id, category")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
