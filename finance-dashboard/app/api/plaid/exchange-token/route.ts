import { NextResponse } from "next/server";
import { getPlaid, isPlaidConfigured, plaidErrorMessage } from "@/lib/plaid";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isPlaidConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Plaid and Supabase must both be configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    public_token?: string;
    institution?: { name?: string; institution_id?: string } | null;
  };
  if (!body.public_token) return NextResponse.json({ error: "public_token is required" }, { status: 400 });

  try {
    const { data } = await getPlaid().itemPublicTokenExchange({ public_token: body.public_token });
    const { error } = await getServerSupabase()
      .from("plaid_items")
      .upsert(
        {
          item_id: data.item_id,
          access_token: data.access_token,
          institution: body.institution?.name ?? null,
          institution_id: body.institution?.institution_id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "item_id" },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ item_id: data.item_id });
  } catch (err) {
    return NextResponse.json({ error: plaidErrorMessage(err) }, { status: 500 });
  }
}
