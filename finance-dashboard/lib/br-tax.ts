import type { SupabaseClient } from "@supabase/supabase-js";

export const TAX_ACCOUNT_EXTERNAL_ID = "csv:manual:estimated taxes";
export const BR_FOREIGN_INVESTMENT_RATE = 0.15;
const RECEITA_URL = "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda";
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const EN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export interface IrpfDeadline {
  date: string;
  official: boolean;
}

// The IRPF return (and the single/first tax payment) for year Y's income is due in Y+1, normally late May.
export function irpfFilingYear(today = new Date()): number {
  return today.getUTCMonth() >= 5 ? today.getUTCFullYear() + 1 : today.getUTCFullYear();
}

// Fallback until Receita publishes the date: the last weekday of May, as in recent years.
export function lastWeekdayOfMay(year: number): string {
  const d = new Date(Date.UTC(year, 4, 31));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function parseReceitaDeadline(html: string, year: number): string | null {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const re = /declara\S+ de (\d{4}) sem multa encerra em (\d{1,2}) de ([a-zç]+) de (\d{4})/gi;
  for (const m of Array.from(text.matchAll(re))) {
    const month = MONTHS.indexOf(m[3].toLowerCase());
    if (Number(m[1]) !== year || month < 0) continue;
    return new Date(Date.UTC(Number(m[4]), month, Number(m[2]))).toISOString().slice(0, 10);
  }
  return null;
}

export async function irpfDeadline(today = new Date()): Promise<IrpfDeadline> {
  const year = irpfFilingYear(today);
  try {
    const res = await fetch(RECEITA_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
    const date = res.ok ? parseReceitaDeadline(await res.text(), year) : null;
    if (date) return { date, official: true };
  } catch {
    // fall through to the estimate
  }
  return { date: lastWeekdayOfMay(year), official: false };
}

export function taxAccountName(d: IrpfDeadline): string {
  return `Estimated taxes (Brazil IRPF, due ${EN.format(new Date(d.date))}${d.official ? "" : ", est."})`;
}

export async function refreshTaxDeadline(db: SupabaseClient): Promise<IrpfDeadline> {
  const d = await irpfDeadline();
  const { error } = await db.from("accounts").update({ name: taxAccountName(d) }).eq("external_id", TAX_ACCOUNT_EXTERNAL_ID);
  if (error) throw new Error(error.message);
  return d;
}
