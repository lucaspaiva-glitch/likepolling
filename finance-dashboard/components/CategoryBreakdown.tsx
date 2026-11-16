"use client";

import { useState } from "react";
import { Card, DonutChart, Tab, TabGroup, TabList } from "@tremor/react";
import { fmtCompact, fmtUsd } from "@/lib/format";
import type { DashboardData } from "@/lib/data";

const RANGES = [
  { key: "d30", label: "30d" },
  { key: "d90", label: "90d" },
  { key: "m12", label: "12m" },
] as const;

const COLORS = ["blue", "emerald", "sky", "teal", "indigo", "green", "cyan", "lime", "slate", "zinc"];
const BAR: Record<string, string> = {
  blue: "from-blue-500 to-sky-400",
  emerald: "from-emerald-500 to-teal-300",
  sky: "from-sky-500 to-cyan-300",
  teal: "from-teal-500 to-emerald-300",
  indigo: "from-indigo-500 to-blue-300",
  green: "from-green-500 to-lime-300",
  cyan: "from-cyan-500 to-sky-300",
  lime: "from-lime-500 to-green-300",
  slate: "from-slate-500 to-slate-300",
  zinc: "from-zinc-500 to-zinc-300",
};

export default function CategoryBreakdown({ categories }: { categories: DashboardData["categories"] }) {
  const [idx, setIdx] = useState(1);
  const all = categories[RANGES[idx].key];
  const top = all.slice(0, 10);
  const rest = all.slice(10).reduce((s, c) => s + c.value, 0);
  const rows = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  const total = all.reduce((s, c) => s + c.value, 0);
  const max = rows.reduce((m, c) => Math.max(m, c.value), 0);

  return (
    <Card className="relative h-full overflow-hidden p-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-400 via-blue-500 to-emerald-400" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-tremor-content">Spending by category</h3>
          <p className="mt-1 bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text font-mono text-2xl font-semibold tabular-nums text-transparent">
            {fmtUsd(total)}
          </p>
          <p className="text-[11px] text-tremor-content">Outflows · excludes transfers, trades and Like Polling</p>
        </div>
        <TabGroup index={idx} onIndexChange={setIdx} className="w-auto">
          <TabList variant="solid" className="text-xs">
            {RANGES.map((r) => (
              <Tab key={r.key} className="px-2 py-0.5 font-mono">
                {r.label}
              </Tab>
            ))}
          </TabList>
        </TabGroup>
      </div>
      {all.length === 0 ? (
        <p className="py-16 text-center text-xs text-tremor-content-subtle">No outflows in this range</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 items-center gap-4 md:grid-cols-5">
          <ul className="space-y-2 md:col-span-3">
            {rows.map((c, i) => {
              const color = COLORS[i % COLORS.length];
              return (
                <li key={c.name} className="grid grid-cols-[1.25rem_minmax(0,7rem)_1fr_auto] items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-tremor-content-subtle">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate text-tremor-content-emphasis">{c.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className={`block h-full rounded-full bg-gradient-to-r ${BAR[color]} shadow-[0_0_8px_rgba(56,189,248,0.45)]`}
                      style={{ width: `${max ? Math.max(2, (c.value / max) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="w-24 text-right font-mono tabular-nums text-tremor-content-strong">
                    {fmtUsd(c.value)} <span className="text-tremor-content-subtle">{total ? Math.round((c.value / total) * 100) : 0}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <DonutChart
            className="hidden md:col-span-2 md:block md:h-64"
            data={rows}
            index="name"
            category="value"
            colors={COLORS}
            valueFormatter={fmtUsd}
            label={fmtCompact(total)}
            showAnimation={false}
          />
        </div>
      )}
    </Card>
  );
}
