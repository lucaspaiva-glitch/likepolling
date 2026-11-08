import "server-only";
import { lp, requestCost } from "@/lib/gemini-credit";

// Like Polling's anonymous counters (per visitor country per day) and Gemini usage, for marketing and cost decisions.
export interface CountryInterest {
  country: string;
  visits: number;
  searches: number;
  buyClicks: number;
}
export interface CompanyInsights {
  configured: boolean;
  error: string | null;
  days: number;
  countries: CountryInterest[]; // sorted by visits + searches, highest first
  buyClicks: Array<{ product: string; clicks: number }>;
  geminiBySource: Array<{ source: string; cost: number; requests: number }>;
}

export const DAYS = 30;
export const emptyInsights = (configured = false, error: string | null = null): CompanyInsights => ({
  configured, error, days: DAYS, countries: [], buyClicks: [], geminiBySource: [],
});

async function all<T>(query: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = await lp<T[]>(`${query}&offset=${from}&limit=1000`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function loadCompanyInsights(today: Date): Promise<CompanyInsights> {
  if (!process.env.LP_SUPABASE_URL || !process.env.LP_SUPABASE_KEY) return emptyInsights(false);
  const since = new Date(today.getTime() - (DAYS - 1) * 864e5).toISOString().slice(0, 10);
  try {
    const [interest, searches, usage] = await Promise.all([
      all<{ country_code: string; kind: string; item: string; n: number }>(
        `interest_daily?select=country_code,kind,item,n&day=gte.${since}&order=day.asc`,
      ),
      all<{ country_code: string; searches: number }>(`search_counts_daily?select=country_code,searches&day=gte.${since}&order=day.asc`),
      all<{ source: string; model: string; input_tokens: number; output_tokens: number }>(
        `gemini_usage?select=source,model,input_tokens,output_tokens&status=eq.ok&at=gte.${since}T00:00:00Z&order=id.asc`,
      ),
    ]);

    const byCountry = new Map<string, CountryInterest>();
    const row = (c: string) => {
      let r = byCountry.get(c);
      if (!r) byCountry.set(c, (r = { country: c, visits: 0, searches: 0, buyClicks: 0 }));
      return r;
    };
    const buys = new Map<string, number>();
    for (const r of interest) {
      if (r.kind === "visit") row(r.country_code).visits += r.n;
      else if (r.kind === "buy") {
        row(r.country_code).buyClicks += r.n;
        buys.set(r.item, (buys.get(r.item) ?? 0) + r.n);
      }
    }
    for (const r of searches) row(r.country_code).searches += r.searches;

    const gemini = new Map<string, { cost: number; requests: number }>();
    for (const r of usage) {
      const g = gemini.get(r.source) ?? { cost: 0, requests: 0 };
      g.cost += requestCost(r);
      g.requests += 1;
      gemini.set(r.source, g);
    }

    return {
      ...emptyInsights(true),
      countries: Array.from(byCountry.values()).sort((a, b) => b.visits + b.searches - (a.visits + a.searches) || b.buyClicks - a.buyClicks),
      buyClicks: Array.from(buys).map(([product, clicks]) => ({ product, clicks })).sort((a, b) => b.clicks - a.clicks),
      geminiBySource: Array.from(gemini).map(([source, g]) => ({ source, ...g })).sort((a, b) => b.cost - a.cost),
    };
  } catch (err) {
    return emptyInsights(true, err instanceof Error ? err.message : String(err));
  }
}
