"use client";

import { useState } from "react";
import { BarChart, Card, DonutChart, Tab, TabGroup, TabList } from "@tremor/react";
import { fmtCompact, fmtUsd } from "@/lib/format";
import type { DashboardData } from "@/lib/data";

const RANGES = [
  { key: "d30", label: "30d" },
  { key: "d90", label: "90d" },
  { key: "m12", label: "12m" },
] as const;

const COLORS = ["blue", "cyan", "indigo", "violet", "fuchsia", "rose", "amber", "lime", "emerald", "teal", "slate"];

export default function CategoryBreakdown({ categories }: { categories: DashboardData["categories"] }) {
  const [idx, setIdx] = useState(1);
  const all = categories[RANGES[idx].key];
  const top = all.slice(0, 10);
  const rest = all.slice(10).reduce((s, c) => s + c.value, 0);
  const donut = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  const total = all.reduce((s, c) => s + c.value, 0);

  return (
    <Card className="h-full p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-dark-tremor-content-strong">Spending by category</h3>
          <p className="text-[11px] text-dark-tremor-content">Outflows · total {fmtUsd(total)}</p>
        </div>
        <TabGroup index={idx} onIndexChange={setIdx} className="w-auto">
          <TabList variant="solid" className="text-xs">
            {RANGES.map((r) => (
              <Tab key={r.key} className="px-2 py-0.5">
                {r.label}
              </Tab>
            ))}
          </TabList>
        </TabGroup>
      </div>
      {all.length === 0 ? (
        <p className="py-16 text-center text-xs text-dark-tremor-content-subtle">No outflows in this range</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          <BarChart
            className="h-72 md:col-span-3"
            data={top}
            index="name"
            categories={["value"]}
            colors={["blue"]}
            layout="vertical"
            valueFormatter={fmtCompact}
            yAxisWidth={110}
            showLegend={false}
            showAnimation={false}
          />
          <DonutChart
            className="hidden md:col-span-2 md:block md:h-72"
            data={donut}
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
