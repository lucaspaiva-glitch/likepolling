import { Card } from "@tremor/react";
import { fmtPct, fmtUsd } from "@/lib/format";
import type { DashboardData } from "@/lib/data";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-dark-tremor-content-strong";
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-dark-tremor-content">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-dark-tremor-content-subtle">{sub}</p>}
    </Card>
  );
}

export default function KpiStrip({ kpis }: { kpis: DashboardData["kpis"] }) {
  const net30 = kpis.income30 - kpis.burn30;
  return (
    <div className="grid grid-cols-6 gap-2">
      <Kpi label="Net worth" value={fmtUsd(kpis.netWorth)} sub={`${fmtUsd(kpis.assets)} assets`} />
      <Kpi label="Liabilities" value={fmtUsd(kpis.liabilities)} tone={kpis.liabilities > 0 ? "neg" : undefined} />
      <Kpi label="Income · 30d" value={fmtUsd(kpis.income30)} tone="pos" />
      <Kpi label="Burn · 30d" value={fmtUsd(kpis.burn30)} tone="neg" sub={`Net ${fmtUsd(net30)}`} />
      <Kpi label="Avg burn · 3 mo" value={fmtUsd(kpis.avgBurn3m)} sub={kpis.runwayMonths != null ? `${kpis.runwayMonths.toFixed(1)} mo cash runway` : undefined} />
      <Kpi
        label="Savings rate · 12 mo"
        value={kpis.savingsRate12m != null ? fmtPct(kpis.savingsRate12m) : "—"}
        tone={kpis.savingsRate12m == null ? undefined : kpis.savingsRate12m >= 0 ? "pos" : "neg"}
      />
    </div>
  );
}
