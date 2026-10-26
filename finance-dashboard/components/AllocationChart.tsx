"use client";

import { Card, DonutChart, Legend } from "@tremor/react";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";
import type { CategoryPoint } from "@/lib/data";

const COLORS = ["emerald", "blue", "slate"];

export default function AllocationChart({ data, netWorth }: { data: CategoryPoint[]; netWorth: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card className="h-full p-3">
      <h3 className="text-sm font-medium text-dark-tremor-content-strong">Asset allocation</h3>
      <p className="text-[11px] text-dark-tremor-content">Cash vs. investments · net worth {fmtUsd(netWorth)}</p>
      {data.length === 0 ? (
        <p className="py-16 text-center text-xs text-dark-tremor-content-subtle">No account balances yet</p>
      ) : (
        <>
          <DonutChart
            className="mt-3 h-44"
            data={data}
            category="value"
            index="name"
            colors={COLORS}
            valueFormatter={fmtCompact}
            label={fmtCompact(total)}
          />
          <Legend className="mt-2 justify-center" categories={data.map((d) => `${d.name} ${fmtPct(total ? d.value / total : 0)}`)} colors={COLORS} />
        </>
      )}
    </Card>
  );
}
