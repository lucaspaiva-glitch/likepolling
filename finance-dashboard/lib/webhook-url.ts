export function plaidWebhookUrl(): string | undefined {
  if (process.env.PLAID_WEBHOOK_URL) return process.env.PLAID_WEBHOOK_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/api/plaid/webhook` : undefined;
}
