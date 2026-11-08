import { fmtDate, fmtUsd2 } from "@/lib/format";
import type { GeminiCredit } from "@/lib/gemini-credit";

// Gemini prepaid credit: the latest Google Cloud top-up minus Like Polling's requests since that day.
export default function GeminiCreditBox({ data }: { data: GeminiCredit }) {
  if (!data.configured) return null;
  // Google's own "no credit" answer beats the estimate.
  const left = data.outOfCredit ? 0 : Math.max(0, data.left ?? 0);
  return (
    <div className="mt-2 rounded border border-dark-tremor-border px-2 py-1.5">
      {data.outOfCredit && (
        <p className="mb-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-200">
          Gemini: out of credit{data.outSince ? ` since ${fmtDate(data.outSince)}` : ""}. Top up in Google AI Studio.
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-dark-tremor-content-strong">Gemini credit left (at least)</p>
          <p className="text-[11px] text-dark-tremor-content">
            {data.topUpDate
              ? `${fmtUsd2(data.topUp ?? 0)} top-up on ${fmtDate(data.topUpDate)} − ${fmtUsd2(data.spent)} used (${data.requests.toLocaleString("en-US")} requests). Older leftover credit not counted.`
              : "Shows once a Google Cloud top-up reaches the bank."}
          </p>
        </div>
        {data.left != null && (
          <p className={`text-base font-semibold tabular-nums ${left <= 0 ? "text-rose-400" : "text-emerald-400"}`}>{fmtUsd2(left)}</p>
        )}
      </div>
      {data.error && <p className="mt-1 text-[11px] text-rose-400">Couldn&apos;t read Gemini usage: {data.error}</p>}
    </div>
  );
}
