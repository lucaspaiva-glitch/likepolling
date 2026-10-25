import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { getPlaid, isPlaidConfigured } from "@/lib/plaid";
import { isSupabaseConfigured } from "@/lib/db/server";
import { syncItems } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const keyCache = new Map<string, JWK>();

// https://plaid.com/docs/api/webhooks/webhook-verification/
async function verify(token: string | null, body: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { alg, kid } = decodeProtectedHeader(token);
    if (alg !== "ES256" || !kid) return false;
    let jwk = keyCache.get(kid);
    if (!jwk) {
      const { data } = await getPlaid().webhookVerificationKeyGet({ key_id: kid });
      if (data.key.expired_at) return false;
      jwk = data.key as unknown as JWK;
      keyCache.set(kid, jwk);
    }
    const { payload } = await jwtVerify(token, await importJWK(jwk, "ES256"), { maxTokenAge: "5 min" });
    const expected = Buffer.from(createHash("sha256").update(body).digest("hex"));
    const claimed = Buffer.from(String(payload.request_body_sha256 ?? ""));
    return expected.length === claimed.length && timingSafeEqual(expected, claimed);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!isPlaidConfigured() || !isSupabaseConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const body = await req.text();
  if (!(await verify(req.headers.get("plaid-verification"), body))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  const event = JSON.parse(body) as { webhook_type?: string; webhook_code?: string; item_id?: string };
  const syncCodes = ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"];
  if (event.webhook_type === "TRANSACTIONS" && event.item_id && syncCodes.includes(event.webhook_code ?? "")) {
    const items = await syncItems({ itemId: event.item_id });
    return NextResponse.json({ received: true, items });
  }
  return NextResponse.json({ received: true });
}
