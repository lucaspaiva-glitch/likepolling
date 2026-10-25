import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export function isPlaidConfigured(): boolean {
  const id = process.env.PLAID_CLIENT_ID ?? "";
  const secret = process.env.PLAID_SECRET ?? "";
  return id.length > 0 && secret.length > 0 && !id.startsWith("your-") && !secret.startsWith("your-");
}

let client: PlaidApi | null = null;

export function getPlaid(): PlaidApi {
  if (!isPlaidConfigured()) throw new Error("Plaid is not configured: set PLAID_CLIENT_ID and PLAID_SECRET in .env.local");
  if (!client) {
    const env = (process.env.PLAID_ENV || "sandbox") as keyof typeof PlaidEnvironments;
    const basePath = PlaidEnvironments[env];
    if (!basePath) throw new Error(`Unknown PLAID_ENV "${env}" (use sandbox or production)`);
    client = new PlaidApi(
      new Configuration({
        basePath,
        baseOptions: {
          headers: {
            "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
            "PLAID-SECRET": process.env.PLAID_SECRET!,
          },
        },
      }),
    );
  }
  return client;
}

export function plaidErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
  if (data?.error_code) return `${data.error_code}: ${data.error_message ?? ""}`.trim();
  return err instanceof Error ? err.message : String(err);
}
