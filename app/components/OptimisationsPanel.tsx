"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OptimisationsResponse, Tip } from "@/app/api/optimisations/route";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export default function OptimisationsPanel() {
  const [data, setData] = useState<OptimisationsResponse | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/optimisations").then((r) => r.json()).then(setData).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function markDone(tip: Tip, enabled: boolean) {
    // DD flags + categorise queue are computed elsewhere — they auto-update.
    // Only manual optimisation_flags get persisted here.
    if (tip.id.startsWith("dd_") || tip.id === "categorise_queue") return;
    setBusyId(tip.id);
    await fetch("/api/optimisation-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag: tip.id, enabled }),
    });
    load();
    setBusyId(null);
  }

  if (!data) {
    return (
      <div className="bg-gradient-to-br from-emerald-500/5 to-surface border border-white/8 rounded-2xl p-6 animate-pulse">
        <div className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="h-10 w-64 bg-white/5 rounded" />
      </div>
    );
  }

  const todoTips = data.tips.filter((t) => t.status !== "done");
  const doneTips = data.tips.filter((t) => t.status === "done");

  return (
    <div className="bg-gradient-to-br from-emerald-500/5 to-surface border border-emerald-500/20 rounded-2xl p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">
          💸 Ways to save money
        </p>
        {data.done_count > 0 && (
          <p className="text-[9px] text-emerald-400/60 font-mono">
            {data.done_count} done ✓
          </p>
        )}
      </div>

      <div className="flex items-baseline gap-3 mb-2">
        <p className="text-4xl sm:text-5xl font-black tracking-tight text-emerald-300">
          ~{GBP.format(data.total_potential_saving)}
        </p>
        <p className="text-xs text-muted/60">potential annual saving</p>
      </div>

      <p className="text-sm text-muted/70 leading-relaxed mb-6">
        {data.todo_count > 0
          ? `${data.todo_count} concrete things you could do — sorted biggest first.`
          : "You're doing everything on the list — nice."}
      </p>

      {/* The list of actionable tips */}
      <div className="flex flex-col gap-3">
        {todoTips.map((tip) => (
          <TipCard key={tip.id} tip={tip} busy={busyId === tip.id} onDone={(v) => markDone(tip, v)} />
        ))}
      </div>

      {doneTips.length > 0 && (
        <div className="mt-5 pt-4 border-t border-white/5">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-[10px] text-muted/50 hover:text-muted uppercase tracking-widest font-bold flex items-center gap-2"
          >
            <span>Already done ({doneTips.length})</span>
            <span className="font-mono">{showDone ? "▴" : "▾"}</span>
          </button>
          {showDone && (
            <div className="mt-3 flex flex-col gap-2 opacity-60">
              {doneTips.map((tip) => (
                <div key={tip.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/3">
                  <div className="min-w-0">
                    <p className="text-xs text-foreground/80 line-through">{tip.title}</p>
                  </div>
                  <button
                    onClick={() => markDone(tip, false)}
                    disabled={busyId === tip.id || tip.id.startsWith("dd_") || tip.id === "categorise_queue"}
                    className="text-[10px] text-muted/50 hover:text-muted shrink-0"
                  >
                    undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted/40 mt-5 leading-relaxed">
        Estimates based on UK tax year 2025/26 for a single-director Ltd.
        Ask your accountant before making big changes.
      </p>
    </div>
  );
}

function TipCard({ tip, busy, onDone }: { tip: Tip; busy: boolean; onDone: (v: boolean) => void }) {
  const isManual = !tip.id.startsWith("dd_") && tip.id !== "categorise_queue";
  const diffColor = tip.difficulty === "easy" ? "text-emerald-400"
                  : tip.difficulty === "medium" ? "text-amber-400"
                  : "text-rose-400/80";
  const diffLabel = tip.difficulty === "easy" ? "easy"
                  : tip.difficulty === "medium" ? "5 min"
                  : "ask accountant";

  return (
    <div className={`bg-surface border rounded-xl p-4 ${tip.status === "in_progress" ? "border-amber-500/30" : "border-white/8"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-bold text-foreground">{tip.title}</p>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${diffColor}`}>
              · {diffLabel}
            </span>
          </div>
          <p className="text-[11px] text-muted/70 leading-snug">{tip.why}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-emerald-400 font-mono">
            +{GBP.format(tip.estimated_saving)}
          </p>
          <p className="text-[9px] text-muted/40">/year</p>
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {tip.internal_link && (
          <Link
            href={tip.internal_link}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
          >
            Take action →
          </Link>
        )}
        {tip.action_url && (
          <a
            href={tip.action_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-muted hover:border-white/30 hover:text-foreground transition-colors"
          >
            {tip.internal_link ? "gov.uk ↗" : "Open ↗"}
          </a>
        )}
        {isManual && (
          <button
            onClick={() => onDone(true)}
            disabled={busy}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-muted hover:border-emerald-500/40 hover:text-emerald-400 transition-colors disabled:opacity-40 ml-auto"
          >
            ✓ I&apos;m doing this
          </button>
        )}
      </div>
    </div>
  );
}
