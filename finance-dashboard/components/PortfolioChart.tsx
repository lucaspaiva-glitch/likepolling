"use client";

import { AreaChart, Card } from "@tremor/react";
import { fmtCompact } from "@/lib/format";
import type { PortfolioPoint } from "@/lib/data";

export default function PortfolioChart({ data, ready }: { data: PortfolioPoint[]; ready: boolean }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-medium text-dark-tremor-content-strong">Portfolio value</h3>
      <p className="text-[11px] text-dark-tremor-content">
        Investment accounts · {data[0] ? `since ${data[0].date}` : "no history yet"}
      </p>
      {!ready ? (
        <p className="py-16 text-center text-xs text-amber-200">
          Run <code>supabase/migrations/0002_balance_snapshots.sql</code> in the Supabase SQL Editor to start tracking.
        </p>
      ) : data.length < 2 ? (
        <p className="py-16 text-center text-xs text-dark-tremor-content-subtle">
          Tracking started{data[0] ? ` ${data[0].date}` : ""}. The chart fills in each time the balance changes.
        </p>
      ) : (
        <AreaChart
          className="mt-3 h-56"
          data={data}
          index="date"
          categories={["Value"]}
          colors={["emerald"]}
          valueFormatter={fmtCompact}
          yAxisWidth={64}
          autoMinValue
          showLegend={false}
          showAnimation={false}
        />
      )}
    </Card>
  );
}
