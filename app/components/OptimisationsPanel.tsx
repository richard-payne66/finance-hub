"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OptimisationsResponse, Tip } from "@/app/api/optimisations/route";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export default function OptimisationsPanel() {
  const [data, setData] = useState<OptimisationsResponse | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function load() {
    fetch("/api/optimisations").then((r) => r.json()).then(setData).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function markDone(tip: Tip, enabled: boolean) {
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

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!data) {
    return (
      <div className="bg-gradient-to-br from-primary/5 to-surface border border-white/8 rounded-2xl p-6 animate-pulse">
        <div className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="h-10 w-64 bg-white/5 rounded" />
      </div>
    );
  }

  const todoTips = data.tips.filter((t) => t.status !== "done");
  const doneTips = data.tips.filter((t) => t.status === "done");

  return (
    <div className="bg-gradient-to-br from-primary/5 to-surface border border-primary/20 rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[9px] text-primary uppercase tracking-widest font-bold">
            💸 Ways to save money
          </p>
          <p className="text-[10px] text-muted/50 mt-0.5">
            {data.todo_count > 0
              ? `${data.todo_count} to do · sorted by saving`
              : "All set ✓"}
            {data.done_count > 0 && ` · ${data.done_count} already in place`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl sm:text-3xl font-black tracking-tight text-primary leading-none">
            ~{GBP.format(data.total_potential_saving)}
          </p>
          <p className="text-[9px] text-muted/50 mt-0.5">/yr available</p>
        </div>
      </div>

      {/* TODO tips — compact one-line rows, click to expand */}
      <div className="flex flex-col gap-1.5 mt-4">
        {todoTips.map((tip) => (
          <CompactTipRow
            key={tip.id}
            tip={tip}
            busy={busyId === tip.id}
            expanded={expanded.has(tip.id)}
            onToggleExpand={() => toggleExpand(tip.id)}
            onDone={(v) => markDone(tip, v)}
          />
        ))}
      </div>

      {/* Done tips — collapsed by default */}
      {doneTips.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            onClick={() => setShowDone((v) => !v)}
            className="text-[10px] text-primary/70 hover:text-primary uppercase tracking-widest font-bold flex items-center gap-2"
          >
            <span>✓ Done ({doneTips.length})</span>
            <span className="font-mono">{showDone ? "▴" : "▾"}</span>
          </button>
          {showDone && (
            <div className="mt-2 flex flex-col gap-1 opacity-70">
              {doneTips.map((tip) => (
                <div key={tip.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-primary shrink-0">✓</span>
                    <span className="text-foreground/80 truncate">{tip.title}</span>
                  </div>
                  <button
                    onClick={() => markDone(tip, false)}
                    disabled={busyId === tip.id || tip.id.startsWith("dd_") || tip.id === "categorise_queue"}
                    className="text-[10px] text-muted/40 hover:text-muted shrink-0 disabled:opacity-30"
                    title={tip.id.startsWith("dd_") || tip.id === "categorise_queue" ? "Auto-managed" : "Mark as not done"}
                  >
                    undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[9px] text-muted/30 mt-4 leading-relaxed">
        UK tax year 2025/26 estimates for single-director Ltd. Check with your accountant before changing.
      </p>
    </div>
  );
}

function CompactTipRow({
  tip, busy, expanded, onToggleExpand, onDone,
}: {
  tip: Tip; busy: boolean; expanded: boolean;
  onToggleExpand: () => void; onDone: (v: boolean) => void;
}) {
  const isManual = !tip.id.startsWith("dd_") && tip.id !== "categorise_queue";
  const diffColor = tip.difficulty === "easy" ? "text-primary/70"
                  : tip.difficulty === "medium" ? "text-amber-400/70"
                  : "text-rose-400/70";

  return (
    <div className={`bg-surface border rounded-lg transition-colors ${
      tip.status === "in_progress" ? "border-amber-500/30" : "border-white/8 hover:border-white/15"
    }`}>
      {/* Compact summary row — always visible */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`text-[9px] font-bold uppercase tracking-widest shrink-0 ${diffColor}`}>
            {tip.difficulty === "easy" ? "·" : tip.difficulty === "medium" ? "··" : "···"}
          </span>
          <span className="text-sm text-foreground truncate">{tip.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-bold text-primary font-mono">
            +{GBP.format(tip.estimated_saving)}
          </span>
          <span className="text-[10px] text-muted/40 font-mono">{expanded ? "▴" : "▾"}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5">
          <p className="text-[11px] text-muted/70 leading-snug mb-3">{tip.why}</p>
          <div className="flex flex-wrap gap-2">
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
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 ml-auto"
              >
                ✓ I&apos;m doing this
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
