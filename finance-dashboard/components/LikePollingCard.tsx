"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart, Card } from "@tremor/react";
import { fmtDate, fmtUsd } from "@/lib/format";
import type { LikePollingSummary } from "@/lib/like-polling";

// Zoom levels from closest to farthest; "+" moves left, "−" moves right.
const LEVELS = ["Day", "Week", "Month", "Year"] as const;
type Level = (typeof LEVELS)[number];
const BAR_PX: Record<Level, number> = { Day: 14, Week: 28, Month: 48, Year: 80 };

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

function bucketStart(date: string, level: Level): string {
  const d = utc(date);
  if (level === "Week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  if (level === "Month") d.setUTCDate(1);
  if (level === "Year") d.setUTCMonth(0, 1);
  return iso(d);
}

function nextBucket(start: string, level: Level): string {
  const d = utc(start);
  if (level === "Day") d.setUTCDate(d.getUTCDate() + 1);
  if (level === "Week") d.setUTCDate(d.getUTCDate() + 7);
  if (level === "Month") d.setUTCMonth(d.getUTCMonth() + 1);
  if (level === "Year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  return iso(d);
}

function label(start: string, level: Level): string {
  const d = utc(start);
  if (level === "Year") return String(d.getUTCFullYear());
  if (level === "Month") return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return fmtDate(start, true);
}

export default function LikePollingCard({ data }: { data: LikePollingSummary }) {
  const [level, setLevel] = useState<Level>("Month");
  const scroller = useRef<HTMLDivElement>(null);

  const points = useMemo(() => {
    if (!data.since) return [];
    const totals = new Map<string, number>();
    for (const p of data.daily) {
      const k = bucketStart(p.date, level);
      totals.set(k, (totals.get(k) ?? 0) + p.spent);
    }
    // The chart starts on Jan 1 of the first year with costs and runs to today, so it grows each year.
    const out: Array<{ period: string; Spent: number }> = [];
    const end = bucketStart(data.today, level);
    for (let k = bucketStart(`${data.since.slice(0, 4)}-01-01`, level); k <= end; k = nextBucket(k, level)) {
      out.push({ period: label(k, level), Spent: Math.round((totals.get(k) ?? 0) * 100) / 100 });
    }
    return out;
  }, [data, level]);

  // Show the most recent periods first when zoomed in.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points]);

  const idx = LEVELS.indexOf(level);
  const zoomBtn =
    "h-7 w-7 rounded border border-dark-tremor-border text-sm font-semibold text-dark-tremor-content-strong disabled:opacity-30";

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
          <ul className="mt-2 divide-y divide-dark-tremor-border text-xs">
            {data.vendors.map((v) => (
              <li key={v.name} className="flex justify-between gap-2 py-1">
                <span className="text-dark-tremor-content-emphasis">{v.name}</span>
                <span className="tabular-nums text-dark-tremor-content-strong">{fmtUsd(v.total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-dark-tremor-content">Spent per {level.toLowerCase()}</p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Zoom out" className={zoomBtn} disabled={idx === LEVELS.length - 1} onClick={() => setLevel(LEVELS[idx + 1])}>
                −
              </button>
              <span className="w-12 text-center text-[11px] text-dark-tremor-content-emphasis">{level}</span>
              <button type="button" aria-label="Zoom in" className={zoomBtn} disabled={idx === 0} onClick={() => setLevel(LEVELS[idx - 1])}>
                +
              </button>
            </div>
          </div>
          <div ref={scroller} className="mt-1 overflow-x-auto">
            <div style={{ minWidth: `${points.length * BAR_PX[level] + 56}px` }}>
              <BarChart
                className="h-40"
                data={points}
                index="period"
                categories={["Spent"]}
                colors={["red"]}
                valueFormatter={fmtUsd}
                showLegend={false}
                showAnimation={false}
                yAxisWidth={48}
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
