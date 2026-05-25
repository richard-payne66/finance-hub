"use client";

import { useEffect, useState } from "react";

type LastRun = {
  last_run_at?: string;
  finished_at?: string;
  processed?: number;
  skipped?: number;
  error?: string | null;
};

type Status = {
  connected: boolean;
  pending_count?: number;
  message?: string;
  last_run?: LastRun | null;
};

function ago(iso?: string): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h > 0) return `${h}h ago`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m}m ago`;
}

function dayLabel(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function GmailQueueCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function load() {
    fetch("/api/gmail-receipts")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }
  useEffect(() => {
    load();
  }, []);

  async function processNow() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/gmail-receipts", { method: "POST" });
      const j = await r.json();
      if (r.ok) {
        const created = j.receipts_created ?? 0;
        const matched = j.bank_matches ?? 0;
        setResult(
          `✓ ${created} receipt${created !== 1 ? "s" : ""} created${matched > 0 ? ` · ${matched} auto-attached to bank` : ""}`,
        );
        load();
      } else {
        setResult(`Error: ${j.error ?? "unknown"}`);
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  if (!status.connected) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-5">
        <p className="text-[9px] uppercase tracking-widest font-bold text-muted/70 mb-2">
          📧 Email receipt processing
        </p>
        <p className="text-xs text-muted/60 mb-3">
          Connect Gmail to auto-process receipts forwarded to{" "}
          <span className="font-mono">receipts@richard-payne.com</span>.
        </p>
        <a
          href="/api/google/connect"
          className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity"
        >
          Connect Gmail
        </a>
      </div>
    );
  }

  const pending = status.pending_count ?? 0;
  const lr = status.last_run ?? null;

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-widest font-bold text-muted/70 mb-2">
            📧 Email receipts · weekly auto-check
          </p>

          {pending > 0 ? (
            <p className="text-sm text-foreground mb-1">
              <span className="font-bold text-primary">{pending}</span> waiting in your{" "}
              <span className="font-mono text-muted/70">receipts@</span> mailbox.
            </p>
          ) : (
            <p className="text-sm text-foreground/70 mb-1">
              Nothing waiting. We&apos;ll check again Friday afternoon.
            </p>
          )}

          {lr?.last_run_at ? (
            <p className="text-[11px] text-muted/60 leading-relaxed">
              Last checked <span className="text-foreground/80">{dayLabel(lr.last_run_at)}</span>
              {" "}({ago(lr.last_run_at)})
              {typeof lr.processed === "number" && lr.processed > 0 && (
                <> · imported <span className="text-foreground/80">{lr.processed}</span></>
              )}
              {typeof lr.processed === "number" && lr.processed === 0 && (
                <> · 0 new</>
              )}
              {lr.error && (
                <span className="text-rose-400"> · error: {lr.error}</span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted/40 leading-relaxed italic">
              No run recorded yet — the next scheduled check is Friday ~14:00 UK.
            </p>
          )}
        </div>
        <button
          onClick={processNow}
          disabled={busy}
          className="shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {busy ? "Checking…" : pending > 0 ? "Process now" : "Check now"}
        </button>
      </div>
      {result && (
        <p className={`text-[11px] mt-3 font-mono ${result.startsWith("✓") ? "text-emerald-400" : "text-rose-400"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
