import { Badge, Card } from "@tremor/react";
import { fmtUsd } from "@/lib/format";
import type { Account } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = { cash: "emerald", investment: "blue", credit: "rose", loan: "orange" };

export default function AccountsTable({ accounts }: { accounts: Account[] }) {
  return (
    <Card className="p-3">
      <h3 className="text-sm font-medium text-dark-tremor-content-strong">Accounts</h3>
      {accounts.length === 0 ? (
        <p className="py-8 text-center text-xs text-dark-tremor-content-subtle">Connect a bank or import a CSV</p>
      ) : (
        <ul className="mt-2 divide-y divide-dark-tremor-border text-xs">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-dark-tremor-content-emphasis">{a.name}</p>
                <p className="truncate text-[11px] text-dark-tremor-content-subtle">{a.institution ?? "—"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge size="xs" color={TYPE_COLOR[a.type] ?? "slate"}>
                  {a.type}
                </Badge>
                <span className={`w-24 text-right tabular-nums ${a.balance < 0 ? "text-rose-400" : "text-dark-tremor-content-strong"}`}>
                  {fmtUsd(a.balance)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
