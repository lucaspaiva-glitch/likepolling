import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client (anon key). The finance tables have RLS enabled with no anon
// policies, so this client cannot read them; data flows through server routes.
let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return browserClient;
}
