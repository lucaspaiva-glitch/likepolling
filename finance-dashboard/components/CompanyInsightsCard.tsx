import { Card } from "@tremor/react";
import { fmtUsd2 } from "@/lib/format";
import type { CompanyInsights } from "@/lib/company-insights";

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (c: string) => (c === "XX" ? "Unknown" : (() => { try { return regions.of(c) ?? c; } catch { return c; } })());
const PRODUCTS: Record<string, string> = { country: "Country report", artist: "Artist report", company: "Company report", ad: "Ad spot" };
const SOURCES: Record<string, string> = {
  "news-world-routine": "World news",
  "news-ai-routine": "AI news",
  "news-fashion-routine": "Fashion news",
  "education-routine": "Education",
  "report-ideas-routine": "Report ideas",
  ad: "Ad checks",
};
const n = (x: number) => x.toLocaleString("en-US");

// Where interest comes from and what each Gemini feature costs, so marketing and spending follow the data.
export default function CompanyInsightsCard({ data }: { data: CompanyInsights }) {
  if (!data.configured) return null;
  const top = data.countries.slice(0, 8);
  const visits = data.countries.reduce((s, c) => s + c.visits, 0);
  const clicks = data.countries.reduce((s, c) => s + c.buyClicks, 0);
  const geminiTotal = data.geminiBySource.reduce((s, g) => s + g.cost, 0);
  return (
    <Card className="p-3">
      <h3 className="text-sm font-medium text-dark-tremor-content-strong">Like Polling · interest and costs</h3>
      <p className="text-[11px] text-dark-tremor-content">Last {data.days} days · anonymous counts per visitor country</p>
      {data.error && <p className="mt-1 text-[11px] text-rose-400">Couldn&apos;t read Like Polling data: {data.error}</p>}

      <p className="mt-3 text-xs font-medium text-dark-tremor-content-strong">Where interest is</p>
      {top.length === 0 ? (
        <p className="py-3 text-center text-xs text-dark-tremor-content-subtle">No visits counted yet</p>
      ) : (
        <>
          <table className="mt-1 w-full text-xs">
            <thead className="text-[11px] text-dark-tremor-content">
              <tr>
                <th className="py-1 text-left font-normal">Country</th>
                <th className="py-1 text-right font-normal">Visits</th>
                <th className="py-1 text-right font-normal">Searches</th>
                <th className="py-1 text-right font-normal">Buy clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-tremor-border tabular-nums">
              {top.map((c) => (
                <tr key={c.country}>
                  <td className="py-1 text-dark-tremor-content-emphasis">{countryName(c.country)}</td>
                  <td className="py-1 text-right text-dark-tremor-content-strong">{n(c.visits)}</td>
                  <td className="py-1 text-right text-dark-tremor-content-strong">{n(c.searches)}</td>
                  <td className={`py-1 text-right ${c.buyClicks ? "text-emerald-400" : "text-dark-tremor-content"}`}>{n(c.buyClicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-dark-tremor-content">
            {n(visits)} visits → {n(clicks)} Buy clicks{visits ? ` (${((clicks / visits) * 100).toFixed(1)}%)` : ""}
            {data.buyClicks.length > 0 && ` · ${data.buyClicks.map((b) => `${PRODUCTS[b.product] ?? b.product} ${n(b.clicks)}`).join(", ")}`}
          </p>
        </>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-dark-tremor-content-strong">Gemini cost per feature</p>
        <p className="text-xs tabular-nums text-dark-tremor-content-strong">{fmtUsd2(geminiTotal)}</p>
      </div>
      {data.geminiBySource.length === 0 ? (
        <p className="py-3 text-center text-xs text-dark-tremor-content-subtle">No Gemini requests recorded yet</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {data.geminiBySource.map((g) => (
            <li key={g.source}>
              <div className="flex justify-between gap-2">
                <span className="text-dark-tremor-content-emphasis">{SOURCES[g.source] ?? g.source}</span>
                <span className="tabular-nums text-dark-tremor-content-strong">
                  {fmtUsd2(g.cost)} <span className="text-dark-tremor-content">· {n(g.requests)} req</span>
                </span>
              </div>
              <div className="mt-0.5 h-1 rounded bg-dark-tremor-border">
                <div className="h-1 rounded bg-blue-500" style={{ width: `${geminiTotal ? Math.max(2, (g.cost / geminiTotal) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
