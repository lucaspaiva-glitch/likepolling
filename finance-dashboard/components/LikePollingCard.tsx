"use client";

import { useMemo } from "react";
import { AreaChart, Card, DonutChart } from "@tremor/react";
import { fmtDate, fmtUsd, monthLabel } from "@/lib/format";
import type { LikePollingSummary } from "@/lib/like-polling";
import type { GeminiCredit } from "@/lib/gemini-credit";
import GeminiCreditBox from "@/components/GeminiCreditBox";

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

export default function LikePollingCard({ data, gemini }: { data: LikePollingSummary; gemini: GeminiCredit }) {
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
          <h3 className="text-sm font-medium text-tremor-content-strong">Like Polling</h3>
          <p className="text-[11px] text-tremor-content">
            Spent so far{data.since ? ` · since ${fmtDate(data.since, true)}` : ""}
          </p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-tremor-content-strong">{fmtUsd(data.total)}</p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          ["Costs", data.total, "text-tremor-content-strong"],
          ["Revenue", data.revenue, "text-blue-600"],
          ["Profit", data.revenue - data.total, data.revenue - data.total < 0 ? "text-rose-600" : "text-emerald-600"],
        ].map(([label, value, color]) => (
          <div key={label as string} className="rounded border border-tremor-border px-1 py-1">
            <p className="text-[11px] text-tremor-content">{label}</p>
            <p className={`text-sm font-semibold tabular-nums ${color}`}>{fmtUsd(value as number)}</p>
          </div>
        ))}
      </div>
      {data.cash != null && (
        <div className="mt-2 flex items-center justify-between rounded border border-tremor-border px-2 py-1.5 text-xs">
          <span className="text-tremor-content-emphasis">PayPal balance</span>
          <span className="font-semibold tabular-nums text-emerald-600">{fmtUsd(data.cash)}</span>
        </div>
      )}
      <GeminiCreditBox data={gemini} />
      {data.vendors.length === 0 ? (
        <p className="py-6 text-center text-xs text-tremor-content-subtle">No Like Polling charges yet</p>
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
            <ul className="min-w-0 flex-1 divide-y divide-tremor-border text-xs">
              {data.vendors.map((v, i) => (
                <li key={v.name} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-tremor-content-emphasis">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[COLORS[i % COLORS.length]]}`} />
                    {v.name}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-tremor-content-strong">
                    {fmtUsd(v.total)}
                    <span className="ml-1 text-tremor-content">{data.total > 0 ? Math.round((v.total / data.total) * 100) : 0}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[11px] text-tremor-content">Total spent over time</p>
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
      {data.months.length > 0 && (
        <table className="mt-3 w-full text-xs tabular-nums">
          <thead className="text-[11px] text-tremor-content">
            <tr>
              <th className="py-1 text-left font-normal">Month</th>
              <th className="py-1 text-right font-normal">Costs</th>
              <th className="py-1 text-right font-normal">Revenue</th>
              <th className="py-1 text-right font-normal">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tremor-border text-tremor-content-emphasis">
            {data.months.map((m) => (
              <tr key={m.month}>
                <td className="py-1">{monthLabel(m.month)}</td>
                <td className="py-1 text-right">{fmtUsd(m.costs)}</td>
                <td className="py-1 text-right">{fmtUsd(m.revenue)}</td>
                <td className={`py-1 text-right ${m.revenue - m.costs < 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtUsd(m.revenue - m.costs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.plan.vendors.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] text-tremor-content">Planned · next 3 months (latest monthly bills, plus Supabase Pro)</p>
          <table className="mt-1 w-full text-xs tabular-nums">
            <tbody className="divide-y divide-tremor-border text-tremor-content-emphasis">
              {data.plan.vendors.map((v) => (
                <tr key={v.name}>
                  <td className="py-1">{v.name}</td>
                  <td className="py-1 text-right">{fmtUsd(v.monthly)}/mo</td>
                </tr>
              ))}
              {data.plan.months.map((m) => (
                <tr key={m.month} className="font-medium text-tremor-content-strong">
                  <td className="py-1">{monthLabel(m.month)}</td>
                  <td className="py-1 text-right">{fmtUsd(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
