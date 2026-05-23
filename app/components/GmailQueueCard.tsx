"use client";

import { useEffect, useState } from "react";

type Status = { connected: boolean; pending_count?: number; message?: string };

export default function GmailQueueCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function load() {
    fetch("/api/gmail-receipts").then((r) => r.json()).then(setStatus).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function processNow() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/gmail-receipts", { method: "POST" });
      const j = await r.json();
      if (r.ok) {
        const created = j.receipts_created ?? 0;
        const matched = j.bank_matches ?? 0;
        setResult(`✓ ${created} receipt${created !== 1 ? "s" : ""} created${matched > 0 ? ` · ${matched} auto-attached to bank` : ""}`);
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
          Connect Gmail to auto-process receipts forwarded to <span className="font-mono">receipts@richard-payne.com</span>.
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
  if (pending === 0 && !result) return null; // hide when nothing to do

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-widest font-bold text-muted/70 mb-1">
            📧 Email receipts waiting
          </p>
          <p className="text-sm text-foreground">
            <span className="font-bold">{pending}</span> receipt{pending !== 1 ? "s" : ""} forwarded to <span className="font-mono text-muted/70">receipts@</span> or tagged <span className="font-mono text-muted/70">RECEIPTS</span>
          </p>
          <p className="text-[10px] text-muted/50 mt-1">
            Cron will process at 09:00 UTC daily. Tap to do it now.
          </p>
        </div>
        <button
          onClick={processNow}
          disabled={busy || pending === 0}
          className="shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {busy ? "Processing…" : "Process now"}
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
