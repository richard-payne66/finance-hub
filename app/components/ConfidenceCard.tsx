"use client";

import { useEffect, useState } from "react";
import type { DashboardStats } from "@/app/api/dashboard-stats/route";

// Composite score 0-100 across three dimensions:
//   Bank data freshness  (40 pts)
//   Transaction hygiene  (30 pts) — fewer uncategorised = better
//   Receipt queue empty  (15 pts)
//   FA connected         (15 pts)
//
// Designed to be encouraging — 100 is achievable, not idealistic.
function computeScore(s: DashboardStats): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Bank data freshness (40 pts)
  if (!s.connected) {
    reasons.push("Connect FreeAgent");
  } else if (s.stale_accounts_count === 0) {
    score += 40;
  } else if (s.stale_accounts_count <= 1) {
    score += 30;
    reasons.push("1 bank account out of date");
  } else {
    score += 20;
    reasons.push(`${s.stale_accounts_count} bank accounts out of date`);
  }

  // Transaction hygiene (30 pts)
  const txns = s.total_marked_for_review;
  if (txns === 0) score += 30;
  else if (txns < 10) { score += 25; reasons.push(`${txns} transactions to categorise`); }
  else if (txns < 50) { score += 15; reasons.push(`${txns} transactions to categorise`); }
  else { score += 5; reasons.push(`${txns} transactions to categorise`); }

  // Receipt queue (15 pts)
  if (s.receipts_pending_count === 0) score += 15;
  else if (s.receipts_pending_count < 5) { score += 10; }
  else { score += 5; reasons.push(`${s.receipts_pending_count} receipts to review`); }

  // FA connected (15 pts)
  if (s.connected) score += 15;

  return { score, reasons };
}

export default function ConfidenceCard() {
  const [data, setData] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard-stats").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-6 animate-pulse h-full">
        <div className="h-3 w-24 bg-white/5 rounded mb-3" />
        <div className="h-12 w-20 bg-white/5 rounded" />
      </div>
    );
  }

  const { score, reasons } = computeScore(data);
  const tone =
    score >= 90 ? { color: "text-emerald-400", ring: "stroke-emerald-500", label: "Excellent" } :
    score >= 70 ? { color: "text-amber-300", ring: "stroke-amber-500", label: "Good" } :
    score >= 50 ? { color: "text-amber-400", ring: "stroke-amber-500", label: "Needs work" } :
                  { color: "text-rose-400", ring: "stroke-rose-500", label: "Falling behind" };

  // Ring viz
  const C = 2 * Math.PI * 42; // circumference for r=42

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-6 h-full flex flex-col">
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
        Your Books in Order
      </p>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-white/8" />
            <circle
              cx="50" cy="50" r="42" fill="none" strokeWidth="8"
              strokeLinecap="round"
              className={`transition-all ${tone.ring}`}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - score / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-black ${tone.color}`}>{score}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${tone.color}`}>{tone.label}</p>
          <p className="text-[10px] text-muted/60 mt-0.5">
            {reasons.length === 0 ? "Everything looks great." : "A few small things to tidy."}
          </p>
        </div>
      </div>

      {reasons.length > 0 && (
        <ul className="text-[10px] text-muted/70 space-y-1 mt-auto">
          {reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-muted/40 shrink-0">·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
