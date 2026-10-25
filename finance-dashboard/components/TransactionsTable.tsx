"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  MultiSelect,
  MultiSelectItem,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from "@tremor/react";
import { DEFAULT_CATEGORIES } from "@/lib/categorize";
import { fmtUsd2 } from "@/lib/format";
import type { Account, Transaction } from "@/lib/types";

const PAGE = 150;

function CategoryCell({ tx, onSaved }: { tx: Transaction; onSaved: (c: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tx.category ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function save() {
    setEditing(false);
    const next = value.trim();
    if (!next || next === tx.category) {
      setValue(tx.category ?? "");
      return;
    }
    setState("saving");
    onSaved(next);
    const res = await fetch(`/api/transactions/${tx.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: next }),
    });
    if (!res.ok) {
      setState("error");
      onSaved(tx.category ?? "");
      setValue(tx.category ?? "");
      return;
    }
    setState("idle");
  }

  if (editing) {
    return (
      <input
        autoFocus
        list="category-options"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setValue(tx.category ?? "");
            setEditing(false);
          }
        }}
        className="w-full rounded border-dark-tremor-border bg-dark-tremor-background px-1.5 py-0.5 text-xs text-dark-tremor-content-strong focus:border-blue-500 focus:ring-0"
        aria-label="Edit category"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit category"
      className={`w-full rounded px-1.5 py-0.5 text-left text-xs hover:bg-dark-tremor-background-subtle ${
        state === "error" ? "text-rose-400" : state === "saving" ? "text-dark-tremor-content-subtle" : "text-dark-tremor-content-emphasis"
      }`}
    >
      {tx.category || "Uncategorized"}
      {state === "error" && " · save failed"}
    </button>
  );
}

export default function TransactionsTable({ transactions, accounts }: { transactions: Transaction[]; accounts: Account[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(transactions);
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [type, setType] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [dirty, setDirty] = useState(false);

  const [prev, setPrev] = useState(transactions);
  if (prev !== transactions) {
    setPrev(transactions);
    setRows(transactions);
  }

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const categoryOptions = useMemo(() => {
    const s = new Set(DEFAULT_CATEGORIES);
    rows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || (r.payee ?? "").toLowerCase().includes(q) || (r.category ?? "").toLowerCase().includes(q) || String(r.amount).includes(q)) &&
        (cats.length === 0 || cats.includes(r.category || "Uncategorized")) &&
        (type === "all" || r.type === type) &&
        (accountId === "all" || r.account_id === accountId),
    );
  }, [rows, query, cats, type, accountId]);

  const sum = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h3 className="text-sm font-medium text-dark-tremor-content-strong">Transactions</h3>
          <p className="text-[11px] text-dark-tremor-content">
            {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} · net {fmtUsd2(sum)} · click a category to edit
          </p>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setDirty(false);
              router.refresh();
            }}
            className="rounded border border-blue-500/40 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/10"
          >
            Refresh charts
          </button>
        )}
        <TextInput className="w-56" placeholder="Search payee, category, amount" value={query} onValueChange={setQuery} />
        <MultiSelect className="w-48" placeholder="All categories" value={cats} onValueChange={setCats}>
          {categoryOptions.concat("Uncategorized").filter((c, i, a) => a.indexOf(c) === i).map((c) => (
            <MultiSelectItem key={c} value={c}>
              {c}
            </MultiSelectItem>
          ))}
        </MultiSelect>
        <Select className="w-32" value={type} onValueChange={setType} enableClear={false}>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="income">Income</SelectItem>
          <SelectItem value="expense">Expense</SelectItem>
        </Select>
        <Select className="w-44" value={accountId} onValueChange={setAccountId} enableClear={false}>
          {[
            <SelectItem key="all" value="all">
              All accounts
            </SelectItem>,
            ...accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            )),
          ]}
        </Select>
      </div>

      <datalist id="category-options">
        {categoryOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Table className="mt-2 max-h-[560px] overflow-auto">
        <TableHead className="sticky top-0 z-10 bg-dark-tremor-background">
          <TableRow>
            <TableHeaderCell className="w-24 py-1.5 text-xs">Date</TableHeaderCell>
            <TableHeaderCell className="py-1.5 text-xs">Payee</TableHeaderCell>
            <TableHeaderCell className="w-44 py-1.5 text-xs">Account</TableHeaderCell>
            <TableHeaderCell className="w-48 py-1.5 text-xs">Category</TableHeaderCell>
            <TableHeaderCell className="w-20 py-1.5 text-xs">Type</TableHeaderCell>
            <TableHeaderCell className="w-28 py-1.5 text-right text-xs">Amount</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.slice(0, limit).map((t) => (
            <TableRow key={t.id} className="hover:bg-dark-tremor-background-subtle/40">
              <TableCell className="py-1 text-xs tabular-nums">{t.date}</TableCell>
              <TableCell className="max-w-0 truncate py-1 text-xs text-dark-tremor-content-emphasis" title={t.payee ?? ""}>
                {t.payee}
              </TableCell>
              <TableCell className="truncate py-1 text-xs">{(t.account_id && accountName.get(t.account_id)) || "—"}</TableCell>
              <TableCell className="py-0.5">
                <CategoryCell
                  tx={t}
                  onSaved={(c) => {
                    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, category: c } : r)));
                    setDirty(true);
                  }}
                />
              </TableCell>
              <TableCell className="py-1 text-xs">{t.type}</TableCell>
              <TableCell className={`py-1 text-right text-xs tabular-nums ${t.amount >= 0 ? "text-emerald-400" : "text-dark-tremor-content-strong"}`}>
                {fmtUsd2(t.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtered.length === 0 && <p className="py-8 text-center text-xs text-dark-tremor-content-subtle">No transactions</p>}
      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-2 w-full rounded border border-dark-tremor-border py-1 text-xs text-dark-tremor-content hover:bg-dark-tremor-background-subtle"
        >
          Show {Math.min(PAGE, filtered.length - limit)} more
        </button>
      )}
    </Card>
  );
}
