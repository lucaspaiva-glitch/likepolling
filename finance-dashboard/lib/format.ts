const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export const fmtUsd = (n: number) => usd.format(n);
export const fmtUsd2 = (n: number) => usd2.format(n);
export const fmtCompact = (n: number) => compact.format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}
// "2026-04-02" → "Apr 2" or "Apr 2, 2026".
export function fmtDate(iso: string, withYear = false) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
export const fmtMillions = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : fmtCompact(n));
export const fmtSignedPct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
