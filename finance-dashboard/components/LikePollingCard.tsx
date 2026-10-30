"use client";

import { useMemo } from "react";
import { AreaChart, Card, DonutChart } from "@tremor/react";
import { fmtDate, fmtUsd } from "@/lib/format";
import type { LikePollingSummary } from "@/lib/like-polling";

const COLORS = ["emerald", "blue", "cyan", "indigo", "lime", "sky", "teal", "green"];
const DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  green: "bg-green-500",
  cyan: "bg-cyan-500",
  indigo: "bg-indigo-500",
  lime: "bg-lime-500",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function LikePollingCard({ data }: { data: LikePollingSummary }) {
  // Running total from the first charge to today, so the chart keeps growing.
  const points = useMemo(() => {
    if (!data.since) return [];
    const byDay = new Map(data.daily.map((p) => [p.date, p.spent]));
    const multiYear = data.since.slice(0, 4) !== data.today.slice(0, 4);
    const out: Array<{ date: string; Spent: number }> = [];
    let total = 0;
    const d = new Date(`${data.since}T00:00:00Z`);
    for (let k = iso(d); k <= data.today; d.setUTCDate(d.getUTCDate() + 1), k = iso(d)) {
      total += byDay.get(k) ?? 0;
      out.push({ date: fmtDate(k, multiYear), Spent: Math.round(total * 100) / 100 });
    }
    return out;
  }, [data]);

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-dark-tremor-content-strong">Like Polling</h3>
          <p className="text-[11px] text-dark-tremor-content">
            Spent so far{data.since ? ` · since ${fmtDate(data.since, true)}` : ""}
          </p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-dark-tremor-content-strong">{fmtUsd(data.total)}</p>
      </div>
      {data.vendors.length === 0 ? (
        <p className="py-6 text-center text-xs text-dark-tremor-content-subtle">No Like Polling charges yet</p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3">
            <DonutChart
              className="h-24 w-24 shrink-0"
              data={data.vendors}
              category="total"
              index="name"
              variant="pie"
              colors={COLORS}
              valueFormatter={fmtUsd}
              showAnimation={false}
            />
            <ul className="min-w-0 flex-1 divide-y divide-dark-tremor-border text-xs">
              {data.vendors.map((v, i) => (
                <li key={v.name} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-dark-tremor-content-emphasis">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[COLORS[i % COLORS.length]]}`} />
                    {v.name}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-dark-tremor-content-strong">
                    {fmtUsd(v.total)}
                    <span className="ml-1 text-dark-tremor-content">{data.total > 0 ? Math.round((v.total / data.total) * 100) : 0}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[11px] text-dark-tremor-content">Total spent over time</p>
          <AreaChart
            className="mt-1 h-56"
            data={points}
            index="date"
            categories={["Spent"]}
            colors={["emerald"]}
            valueFormatter={fmtUsd}
            yAxisWidth={52}
            showLegend={false}
            showAnimation={false}
          />
        </>
      )}
    </Card>
  );
}
