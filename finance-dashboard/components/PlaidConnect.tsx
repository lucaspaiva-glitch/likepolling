"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";

type Status = { tone: "info" | "ok" | "err"; text: string } | null;

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${url} failed (${res.status})`);
  return json;
}

function summarize(json: { items?: Array<{ ok: boolean; institution?: string; upserted?: number; error?: string }> }) {
  const items = json.items ?? [];
  if (items.length === 0) return { tone: "info" as const, text: "No linked institutions yet" };
  const failed = items.filter((i) => !i.ok);
  const n = items.reduce((s, i) => s + (i.upserted ?? 0), 0);
  if (failed.length) return { tone: "err" as const, text: `Synced ${n} txns; failed: ${failed.map((f) => `${f.institution}: ${f.error}`).join("; ")}` };
  return { tone: "ok" as const, text: `Synced ${n} transactions from ${items.length} institution(s)` };
}

export default function PlaidConnect() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const sync = useCallback(async () => {
    setBusy(true);
    setStatus({ tone: "info", text: "Syncing…" });
    try {
      setStatus(summarize(await postJson("/api/plaid/sync")));
      router.refresh();
    } catch (e) {
      setStatus({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [router]);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) return;
      setLinkToken(null);
      setBusy(true);
      setStatus({ tone: "info", text: `Linking ${metadata.institution?.name ?? "institution"}…` });
      try {
        await postJson("/api/plaid/exchange-token", { public_token: publicToken, institution: metadata.institution });
        await sync();
      } catch (e) {
        setStatus({ tone: "err", text: (e as Error).message });
        setBusy(false);
      }
    },
    [sync],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      setLinkToken(null);
      if (err) setStatus({ tone: "err", text: err.display_message || err.error_message });
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function connect() {
    setBusy(true);
    setStatus(null);
    try {
      const { link_token } = await postJson("/api/plaid/create-link-token");
      setLinkToken(link_token);
    } catch (e) {
      setStatus({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const color = status?.tone === "err" ? "text-rose-400" : status?.tone === "ok" ? "text-emerald-400" : "text-dark-tremor-content";

  return (
    <div className="flex items-center gap-2">
      {status && (
        <span className={`max-w-md truncate text-xs ${color}`} title={status.text}>
          {status.text}
        </span>
      )}
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="rounded border border-dark-tremor-border px-2.5 py-1 text-xs text-dark-tremor-content-emphasis hover:bg-dark-tremor-background-subtle disabled:opacity-50"
      >
        Sync now
      </button>
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        title="Bank of America, Merrill Lynch, or any Plaid institution"
        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        Connect BofA / Merrill
      </button>
    </div>
  );
}
