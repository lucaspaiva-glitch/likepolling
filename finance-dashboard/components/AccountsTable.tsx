"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@tremor/react";
import { parseAmount } from "@/lib/csv";
import { TAX_ACCOUNT_EXTERNAL_ID } from "@/lib/br-tax";
import { fmtUsd } from "@/lib/format";
import type { Account } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = { cash: "emerald", investment: "blue", credit: "rose", loan: "orange" };

function BalanceCell({ account }: { account: Account }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manual = (account.external_id?.startsWith("csv:") && account.external_id !== TAX_ACCOUNT_EXTERNAL_ID) ?? false;
  const cls = `w-24 text-right tabular-nums ${account.balance < 0 ? "text-rose-400" : "text-dark-tremor-content-strong"}`;

  async function save() {
    const balance = parseAmount(value);
    if (!Number.isFinite(balance)) {
      setError("Enter a number");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balance }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error || `Failed (${res.status})`);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!manual) return <span className={cls}>{fmtUsd(account.balance)}</span>;
  if (!editing) {
    return (
      <button
        type="button"
        title="Edit balance (manual account)"
        className={`${cls} rounded underline decoration-dotted underline-offset-2 hover:bg-dark-tremor-background-subtle`}
        onClick={() => {
          setValue(String(account.balance));
          setEditing(true);
        }}
      >
        {fmtUsd(account.balance)}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => !busy && !error && setEditing(false)}
        className="w-28 rounded border border-dark-tremor-border bg-dark-tremor-background px-1 py-0.5 text-right tabular-nums text-dark-tremor-content-strong"
      />
      {error && <span className="text-[11px] text-rose-400">{error}</span>}
    </span>
  );
}

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
                <p className="truncate text-[11px] text-dark-tremor-content-subtle">
                  {a.institution ?? "—"}
                  {a.external_id?.startsWith("csv:") && a.external_id !== TAX_ACCOUNT_EXTERNAL_ID && ` · balance as of ${a.updated_at.slice(0, 10)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge size="xs" color={TYPE_COLOR[a.type] ?? "slate"}>
                  {a.type}
                </Badge>
                <BalanceCell account={a} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
