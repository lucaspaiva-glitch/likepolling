"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@tremor/react";
import { parseBankCsv, type ParsedCsv } from "@/lib/csv";
import { fmtUsd2 } from "@/lib/format";
import { TAX_ACCOUNT_EXTERNAL_ID } from "@/lib/br-tax";
import type { Account } from "@/lib/types";

const NEW = "__new__";

export default function CsvDropzone({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [target, setTarget] = useState(NEW);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleFile(f: File) {
    setMsg(null);
    setFile(f.name);
    try {
      const p = parseBankCsv(await f.text(), f.name);
      if (p.rows.length === 0) throw new Error("No transactions found in this file");
      setParsed(p);
      const guess = p.accountHint || (p.institution === "Merrill Lynch" ? "Merrill CMA" : "BofA Checking");
      setNewName(guess);
      setNewType(p.institution === "Merrill Lynch" ? "investment" : "cash");
      const match = accounts.find((a) => a.name.toLowerCase() === guess.toLowerCase());
      setTarget(match ? match.id : NEW);
    } catch (e) {
      setParsed(null);
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function importRows() {
    if (!parsed) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: target === NEW ? undefined : target,
          newAccount: target === NEW ? { name: newName, type: newType, institution: parsed.institution } : undefined,
          latestBalance: parsed.latestBalance,
          rows: parsed.rows,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Import failed (${res.status})`);
      setMsg({ ok: true, text: `Imported ${json.inserted} new, ${json.skipped} already present` });
      setParsed(null);
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const investments = parsed?.rows.filter((r) => r.category === "Investments").length ?? 0;
  const dateRange = parsed?.rows.length
    ? `${parsed.rows.reduce((m, r) => (r.date < m ? r.date : m), parsed.rows[0].date)} → ${parsed.rows.reduce((m, r) => (r.date > m ? r.date : m), parsed.rows[0].date)}`
    : "";

  return (
    <Card className="h-full p-3">
      <h3 className="text-sm font-medium text-dark-tremor-content-strong">CSV import</h3>
      <p className="text-[11px] text-dark-tremor-content">Bank of America / Merrill Lynch exports · fallback when Plaid is unavailable</p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`mt-2 cursor-pointer rounded border border-dashed px-3 py-4 text-center text-xs transition-colors ${
          drag ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-dark-tremor-border text-dark-tremor-content hover:border-dark-tremor-content-subtle"
        }`}
      >
        {file ? <span className="text-dark-tremor-content-emphasis">{file}</span> : "Drop a .csv here or click to browse"}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {parsed && (
        <div className="mt-2 space-y-2 text-xs">
          <p className="text-dark-tremor-content">
            <span className="text-dark-tremor-content-strong">{parsed.rows.length}</span> rows · {parsed.institution} · {dateRange}
            {parsed.skipped > 0 && ` · ${parsed.skipped} skipped`}
            {investments > 0 && ` · ${investments} → Investments`}
            {parsed.latestBalance != null && ` · balance ${fmtUsd2(parsed.latestBalance)}`}
          </p>
          <div className="max-h-28 overflow-auto rounded border border-dark-tremor-border">
            <table className="w-full text-[11px]">
              <tbody>
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b border-dark-tremor-border last:border-0">
                    <td className="px-1.5 py-0.5 tabular-nums">{r.date}</td>
                    <td className="max-w-[9rem] truncate px-1.5 py-0.5">{r.payee}</td>
                    <td className="px-1.5 py-0.5 text-dark-tremor-content-subtle">{r.category}</td>
                    <td className={`px-1.5 py-0.5 text-right tabular-nums ${r.amount >= 0 ? "text-emerald-400" : ""}`}>{fmtUsd2(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded border-dark-tremor-border bg-dark-tremor-background py-1 text-xs"
          >
            <option value={NEW}>+ New account…</option>
            {accounts.filter((a) => a.external_id !== TAX_ACCOUNT_EXTERNAL_ID).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.institution ? `· ${a.institution}` : ""}
              </option>
            ))}
          </select>
          {target === NEW && (
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Account name"
                className="min-w-0 flex-1 rounded border-dark-tremor-border bg-dark-tremor-background py-1 text-xs"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="rounded border-dark-tremor-border bg-dark-tremor-background py-1 text-xs"
              >
                <option value="cash">cash</option>
                <option value="investment">investment</option>
                <option value="credit">credit</option>
                <option value="loan">loan</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={importRows}
            disabled={busy || (target === NEW && !newName.trim())}
            className="w-full rounded bg-blue-600 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${parsed.rows.length} transactions`}
          </button>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>}
    </Card>
  );
}
