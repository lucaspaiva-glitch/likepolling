"use client";

import { AreaChart, Card } from "@tremor/react";
import { fmtDate, fmtUsd2 } from "@/lib/format";
import type { CompanyInsights } from "@/lib/company-insights";
import { VISITS_SINCE } from "@/lib/visits";

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (c: string) => (c === "XX" ? "Unknown" : (() => { try { return regions.of(c) ?? c; } catch { return c; } })());
const n = (x: number) => x.toLocaleString("en-US");

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tremor-default border border-tremor-border bg-white/70 p-2 text-center">
      <p className="text-[11px] text-tremor-content">{label}</p>
      <p className="text-base font-semibold tabular-nums text-tremor-content-strong">{value}</p>
    </div>
  );
}

// Daily visitors and daily running cost of likepolling.com over the last 30 days.
export default function CompanyInsightsCard({ data }: { data: CompanyInsights }) {
  if (!data.configured) return null;
  // From the first tracked day through yesterday: earlier days predate counting and today is still partial.
  const first = data.daily.findIndex((d) => d.visits > 0 || d.cost > 0);
  const days = first < 0 ? [] : data.daily.slice(first, -1);
  const visitDays = days.filter((d) => d.date >= VISITS_SINCE);
  const visits = visitDays.reduce((s, d) => s + d.visits, 0);
  const cost = days.reduce((s, d) => s + d.cost, 0);
  const clicks = data.countries.reduce((s, c) => s + c.buyClicks, 0);
  const avgVisits = visitDays.length ? visits / visitDays.length : 0;
  const avgCost = days.length ? cost / days.length : 0;
  const visitPoints = visitDays.map((d) => ({ date: fmtDate(d.date), Visitors: d.visits }));
  const costPoints = days.map((d) => ({ date: fmtDate(d.date), Cost: Math.round(d.cost * 100) / 100 }));
  const top = data.countries.filter((c) => c.visits > 0).slice(0, 5);

  return (
    <Card className="p-3">
      <h3 className="text-sm font-medium text-tremor-content-strong">Like Polling · visitors and daily cost</h3>
      <p className="text-[11px] text-tremor-content">
        {days.length ? `Since ${fmtDate(days[0].date)} · ${days.length} days` : `Last ${data.days} days`}
      </p>
      {data.error && <p className="mt-1 text-[11px] text-rose-600">Couldn&apos;t read Like Polling data: {data.error}</p>}

      <p className="mt-3 text-xs font-medium text-tremor-content-strong">Visitors per day</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Stat label="Average per day" value={n(Math.round(avgVisits))} />
        <Stat label={`Total, ${visitDays.length} days`} value={n(visits)} />
      </div>
      <p className="mt-1 text-[11px] text-tremor-content">
        Real visitors only, counted since {fmtDate(VISITS_SINCE)}
        {visitDays.length ? "" : ". The first full day shows up the day after"}.
      </p>
      <AreaChart
        className="mt-2 h-44"
        data={visitPoints}
        index="date"
        categories={["Visitors"]}
        colors={["blue"]}
        valueFormatter={n}
        yAxisWidth={40}
        allowDecimals={false}
        showLegend={false}
        showAnimation={false}
      />
      {top.length > 0 && (
        <p className="mt-1 text-[11px] text-tremor-content">
          Top countries: {top.map((c) => `${countryName(c.country)} ${n(c.visits)}`).join(" · ")}
          {` · ${n(clicks)} Buy clicks`}
        </p>
      )}

      <p className="mt-4 text-xs font-medium text-tremor-content-strong">Website cost per day</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Stat label="Average per day" value={fmtUsd2(avgCost)} />
        <Stat label={`Total, ${days.length} days`} value={fmtUsd2(cost)} />
      </div>
      <AreaChart
        className="mt-2 h-44"
        data={costPoints}
        index="date"
        categories={["Cost"]}
        colors={["emerald"]}
        valueFormatter={fmtUsd2}
        yAxisWidth={48}
        showLegend={false}
        showAnimation={false}
      />
      <p className="mt-1 text-[11px] text-tremor-content">Gemini usage, the cost that changes day to day. Monthly bills (Devin, Vercel, Supabase…) are in the Like Polling card.</p>
    </Card>
  );
}
