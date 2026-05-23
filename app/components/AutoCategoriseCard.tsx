"use client";

import { useEffect, useState } from "react";
import type { AuditEntry } from "@/app/lib/audit-log";

type Summary = { total: number; auto_applied: number; queued: number; skipped: number; errors: number; cumulative_amount: number };
type ApiShape = { summary_7d: Summary; summary_30d: Summary; recent: AuditEntry[] };

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

export default function AutoCategoriseCard() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  function load() {
    fetch("/api/auto-categorise").then((r) => r.json()).then(setData).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const r = await fetch("/api/auto-categorise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const j = await r.json();
      if (r.ok) {
        setRunResult(`Processed ${j.processed} · auto-applied ${j.auto_applied} · queued ${j.queued}${j.errors > 0 ? ` · ${j.errors} errors` : ""}`);
        load();
      } else {
        setRunResult(`Error: ${j.error ?? "unknown"}`);
      }
    } catch (err) {
      setRunResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  if (!data) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-5 animate-pulse h-full">
        <div className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="h-8 w-16 bg-white/5 rounded" />
      </div>
    );
  }

  const s = data.summary_7d;
  const has_activity = s.total > 0;

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
            🤖 Auto bookkeeping
          </p>
          <p className="text-[10px] text-muted/50 mt-0.5">
            Categorises new transactions daily · biased for tax efficiency
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>

      {runResult && (
        <p className="text-[10px] text-emerald-400 mb-3">{runResult}</p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Auto-applied" value={s.auto_applied} accent="emerald" />
        <Stat label="Need a look" value={s.queued} accent={s.queued > 0 ? "amber" : "muted"} />
        <Stat label="Skipped" value={s.skipped} accent="muted" sublabel="(personal)" />
      </div>

      <p className="text-[10px] text-muted/60">
        {has_activity
          ? `Last 7 days: ${GBP.format(s.cumulative_amount)} of transactions sorted${s.errors > 0 ? ` · ${s.errors} errors` : ""}`
          : `No activity yet — click "Run now" to categorise your transactions.`}
      </p>

      {data.recent.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 w-full text-[9px] text-muted/50 uppercase tracking-widest font-bold hover:text-muted text-left flex items-center justify-between"
        >
          <span>Recent decisions ({data.recent.length})</span>
          <span className="font-mono">{expanded ? "Hide ▴" : "Show ▾"}</span>
        </button>
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-2">
          {data.recent.slice(0, 15).map((e) => <DecisionRow key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, sublabel }: { label: string; value: number; accent: "emerald" | "amber" | "muted"; sublabel?: string }) {
  const color = accent === "emerald" ? "text-emerald-400"
              : accent === "amber"   ? "text-amber-400"
              :                        "text-muted";
  return (
    <div className="bg-white/3 rounded-lg p-3 text-center">
      <p className="text-[9px] text-muted/60 uppercase tracking-widest font-bold">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
      {sublabel && <p className="text-[9px] text-muted/40 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function DecisionRow({ entry: e }: { entry: AuditEntry }) {
  const isOut = e.txn_amount < 0;
  const actionColor =
    e.action === "auto_applied"      ? "text-emerald-400" :
    e.action === "queued_for_review" ? "text-amber-400" :
    e.action === "skipped_personal"  ? "text-muted/50" :
                                       "text-rose-400";
  const actionLabel =
    e.action === "auto_applied"      ? "✓ applied" :
    e.action === "queued_for_review" ? "⊙ review" :
    e.action === "skipped_personal"  ? "skip" :
                                       "error";

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-t border-white/5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground truncate">{e.txn_description}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted/50">
          <span>{fmtDate(e.txn_date)}</span>
          <span>·</span>
          <span>{isOut ? "−" : "+"}{GBP.format(Math.abs(e.txn_amount))}</span>
          {e.category_name && (
            <>
              <span>·</span>
              <span className="text-foreground/60">→ {e.category_name}</span>
            </>
          )}
          <span>·</span>
          <span className="font-mono">{Math.round(e.confidence * 100)}%</span>
        </div>
        {e.tax_note && (
          <p className="text-[10px] text-emerald-400/70 mt-1 italic">{e.tax_note}</p>
        )}
        {e.error && (
          <p className="text-[10px] text-rose-400 mt-1">{e.error}</p>
        )}
      </div>
      <span className={`text-[9px] font-bold uppercase tracking-widest shrink-0 ${actionColor}`}>
        {actionLabel}
      </span>
    </div>
  );
}
