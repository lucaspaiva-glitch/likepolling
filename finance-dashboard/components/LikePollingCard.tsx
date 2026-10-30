"use client";

import { BarChart, Card } from "@tremor/react";
import { fmtDate, fmtUsd, monthLabel } from "@/lib/format";
import type { LikePollingSummary } from "@/lib/like-polling";

export default function LikePollingCard({ data }: { data: LikePollingSummary }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-dark-tremor-content-strong">Like Polling</h3>
          <p className="text-[11px] text-dark-tremor-content">
            Running costs{data.since ? ` · since ${fmtDate(data.since, true)}` : ""}
          </p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-dark-tremor-content-strong">{fmtUsd(data.total)}</p>
      </div>
      {data.vendors.length === 0 ? (
        <p className="py-6 text-center text-xs text-dark-tremor-content-subtle">No Like Polling charges yet</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-dark-tremor-border text-xs">
            {data.vendors.map((v) => (
              <li key={v.name} className="flex justify-between gap-2 py-1">
                <span className="text-dark-tremor-content-emphasis">{v.name}</span>
                <span className="tabular-nums text-dark-tremor-content-strong">{fmtUsd(v.total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 rounded bg-dark-tremor-background-subtle px-2 py-1.5 text-xs">
            <p className="text-dark-tremor-content">
              Next 30 days, at the last 30 days&apos; pace:{" "}
              <span className="font-semibold tabular-nums text-dark-tremor-content-strong">{fmtUsd(data.last30)}</span>
            </p>
            <p className="text-[11px] text-dark-tremor-content-subtle">≈ {fmtUsd(data.last30 * 12)} a year · estimate, usage-based charges vary</p>
          </div>
          {data.monthly.length > 1 && (
            <BarChart
              className="mt-2 h-28"
              data={data.monthly.map((m) => ({ ...m, month: monthLabel(m.month) }))}
              index="month"
              categories={["Spent"]}
              colors={["red"]}
              valueFormatter={fmtUsd}
              showLegend={false}
              showAnimation={false}
              yAxisWidth={48}
            />
          )}
        </>
      )}
    </Card>
  );
}
