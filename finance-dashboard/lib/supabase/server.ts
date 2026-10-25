import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return /^https?:\/\//.test(url) && !url.includes("your-project") && key.length > 0 && !key.startsWith("your-");
}

let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  if (!serverClient) {
    serverClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Opt out of the Next.js Data Cache so every request sees fresh rows.
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }
  return serverClient;
}
