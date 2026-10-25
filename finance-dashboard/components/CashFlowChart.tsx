"use client";

import { AreaChart, Card } from "@tremor/react";
import { fmtCompact } from "@/lib/format";
import type { CashFlowPoint } from "@/lib/data";

export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-medium text-dark-tremor-content-strong">Cash flow velocity</h3>
      <p className="text-[11px] text-dark-tremor-content">Monthly income vs. burn rate · trailing 12 months</p>
      <AreaChart
        className="mt-3 h-56"
        data={data}
        index="month"
        categories={["Income", "Burn", "Net"]}
        colors={["emerald", "rose", "blue"]}
        valueFormatter={fmtCompact}
        yAxisWidth={56}
        curveType="monotone"
        showAnimation={false}
      />
    </Card>
  );
}
