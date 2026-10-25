const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export const fmtUsd = (n: number) => usd.format(n);
export const fmtUsd2 = (n: number) => usd2.format(n);
export const fmtCompact = (n: number) => compact.format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
