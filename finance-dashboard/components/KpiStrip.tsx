import { Card } from "@tremor/react";
import { fmtSignedPct, fmtUsd } from "@/lib/format";
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
  const change = kpis.portfolioChangePct;
  return (
    <div className="grid grid-cols-5 gap-2">
      <Kpi label="Checking" value={fmtUsd(kpis.checking)} />
      <Kpi
        label="Credit card owed"
        value={fmtUsd(kpis.cardOwed)}
        tone={kpis.cardOwed > 0 ? "neg" : undefined}
        sub={`${fmtUsd(kpis.cardSpentSincePayment)} spent ${kpis.lastCardPayment ? `since last payment ${kpis.lastCardPayment}` : "so far"}`}
      />
      <Kpi label="Net worth" value={fmtUsd(kpis.netWorth)} sub={`investments + checking − card${kpis.estimatedTaxes > 0 ? ` − est. taxes ${fmtUsd(kpis.estimatedTaxes)}` : ""}`} />
      <Kpi
        label="Portfolio value"
        value={fmtUsd(kpis.portfolio)}
        sub={kpis.portfolioStart != null ? `${fmtUsd(kpis.portfolioStart)} at start, ${kpis.portfolioStartDate}` : undefined}
      />
      <Kpi
        label="Portfolio since start"
        value={change != null ? fmtSignedPct(change) : "—"}
        tone={change == null || change === 0 ? undefined : change > 0 ? "pos" : "neg"}
        sub={
          kpis.portfolioChangeExWithdrawalsPct != null
            ? `${fmtSignedPct(kpis.portfolioChangeExWithdrawalsPct)} with withdrawals added back`
            : kpis.portfolioStartDate
              ? `tracking since ${kpis.portfolioStartDate}`
              : undefined
        }
      />
    </div>
  );
}
