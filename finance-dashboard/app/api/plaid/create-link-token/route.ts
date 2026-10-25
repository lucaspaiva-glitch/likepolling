import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaid, isPlaidConfigured, plaidErrorMessage } from "@/lib/plaid";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET)." }, { status: 503 });
  }
  try {
    const res = await getPlaid().linkTokenCreate({
      user: { client_user_id: "finance-dashboard-owner" },
      client_name: "Finance Dashboard",
      language: "en",
      country_codes: [CountryCode.Us],
      // Transactions covers Bank of America checking/savings/cards and Merrill CMA cash;
      // Investments is only added (and billed) when the institution supports it (Merrill).
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      transactions: { days_requested: 730 },
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (err) {
    return NextResponse.json({ error: plaidErrorMessage(err) }, { status: 500 });
  }
}
