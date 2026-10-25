import Papa from "papaparse";
import { categorize, txType } from "@/lib/categorize";
import type { ImportRow } from "@/lib/types";

export interface ParsedCsv {
  institution: "Bank of America" | "Merrill Lynch";
  rows: ImportRow[];
  skipped: number;
  columns: { date: string; payee: string[]; amount: string | null; debit: string | null; credit: string | null };
  latestBalance: number | null;
  accountHint: string | null;
}

const DATE_COLS = ["date", "posted date", "transaction date", "trade date", "settlement date", "run date"];
const PAYEE_COLS = ["payee", "description", "description 1", "description 2", "original description", "merchant", "name", "action"];
const AMOUNT_COLS = ["amount", "amount ($)", "amount($)", "net amount", "transaction amount"];
const BALANCE_COLS = ["running bal.", "running balance", "running bal", "balance"];

const norm = (s: string) => s.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");

export function parseAmount(v: unknown): number {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s || s === "--") return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.endsWith("-")) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

export function parseDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function findHeaderLine(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const cells = (Papa.parse<string[]>(lines[i]).data[0] ?? []).map(norm);
    const hasDate = cells.some((c) => DATE_COLS.includes(c));
    const hasAmount = cells.some((c) => AMOUNT_COLS.includes(c) || c === "debit" || c === "credit" || c.startsWith("amount"));
    if (hasDate && hasAmount) return i;
  }
  return 0;
}

export function parseBankCsv(text: string, fileName = ""): ParsedCsv {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const start = findHeaderLine(lines);
  const body = lines.slice(start).join("\n");
  const parsed = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const pick = (cands: string[]) => cands.map((c) => byNorm.get(c)).find(Boolean) ?? null;

  const date = pick(DATE_COLS);
  if (!date) throw new Error("Could not find a date column in this CSV");
  const amount = pick(AMOUNT_COLS) ?? headers.find((h) => norm(h).startsWith("amount")) ?? null;
  const debit = byNorm.get("debit") ?? byNorm.get("withdrawals") ?? null;
  const credit = byNorm.get("credit") ?? byNorm.get("deposits") ?? null;
  if (!amount && !debit && !credit) throw new Error("Could not find an amount column in this CSV");
  const payeeCols = PAYEE_COLS.map((c) => byNorm.get(c)).filter((h): h is string => Boolean(h));
  const balanceCol = pick(BALANCE_COLS);

  const lower = headers.map(norm);
  const isMerrill =
    /merrill|\bml\b/i.test(fileName) ||
    lower.some((h) => h.includes("symbol/cusip") || h === "account registration" || h === "account nickname" || h === "trade date");
  const institution = isMerrill ? "Merrill Lynch" : "Bank of America";
  const accountCol = byNorm.get("account nickname") ?? byNorm.get("account #") ?? byNorm.get("account") ?? null;

  const rows: ImportRow[] = [];
  let skipped = 0;
  let latestBalance: number | null = null;
  let latestBalanceDate = "";
  let accountHint: string | null = null;

  for (const rec of parsed.data) {
    const d = parseDate(rec[date]);
    let amt = amount ? parseAmount(rec[amount]) : NaN;
    if (!Number.isFinite(amt) && (debit || credit)) {
      const dr = debit ? parseAmount(rec[debit]) : NaN;
      const cr = credit ? parseAmount(rec[credit]) : NaN;
      if (Number.isFinite(dr) || Number.isFinite(cr)) amt = (Number.isFinite(cr) ? Math.abs(cr) : 0) - (Number.isFinite(dr) ? Math.abs(dr) : 0);
    }
    const payee = payeeCols
      .map((c) => (rec[c] ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
    if (!d || !Number.isFinite(amt) || /^beginning balance|^ending balance/i.test(payee)) {
      skipped++;
      continue;
    }
    if (balanceCol) {
      const bal = parseAmount(rec[balanceCol]);
      if (Number.isFinite(bal) && d >= latestBalanceDate) {
        latestBalance = bal;
        latestBalanceDate = d;
      }
    }
    if (!accountHint && accountCol && rec[accountCol]) accountHint = rec[accountCol].trim();
    rows.push({ date: d, payee, amount: amt, category: categorize(payee, amt), type: txType(amt), raw: rec });
  }

  return { institution, rows, skipped, columns: { date, payee: payeeCols, amount, debit, credit }, latestBalance, accountHint };
}
