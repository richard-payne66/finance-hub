"use client";

import { useEffect, useState } from "react";
import type { DashboardStats, BankSnapshot } from "@/app/api/dashboard-stats/route";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function daysAgoLabel(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

export default function DataHealthPanel() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard-stats")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || !data.connected) return null;

  const issues: string[] = [];
  if (data.stale_accounts_count > 0) {
    issues.push(`${data.stale_accounts_count} bank account${data.stale_accounts_count !== 1 ? "s" : ""} not synced recently`);
  }
  if (data.total_marked_for_review > 0) {
    issues.push(`${data.total_marked_for_review} transaction${data.total_marked_for_review !== 1 ? "s" : ""} need categorising`);
  }
  if (data.total_unexplained > 0) {
    issues.push(`${data.total_unexplained} unexplained transaction${data.total_unexplained !== 1 ? "s" : ""}`);
  }

  const healthy = issues.length === 0;

  return (
    <div className={`border rounded-2xl p-5 ${
      healthy
        ? "bg-emerald-500/5 border-emerald-500/20"
        : "bg-amber-500/5 border-amber-500/20"
    }`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl">{healthy ? "✓" : "⚠️"}</span>
          <div className="min-w-0">
            <p className={`text-[9px] uppercase tracking-widest font-bold ${
              healthy ? "text-emerald-400" : "text-amber-400"
            }`}>
              Data accuracy
            </p>
            <p className="text-sm text-foreground mt-0.5">
              {healthy
                ? "All bank feeds fresh, nothing to review"
                : issues.join(" · ")}
            </p>
          </div>
        </div>
        <span className="text-[9px] font-mono text-muted/50 shrink-0">
          {expanded ? "Hide ▴" : "Details ▾"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="text-[9px] text-muted/60 uppercase tracking-widest font-bold mb-3">
            Bank accounts ({data.banks.length})
          </p>
          <div className="flex flex-col gap-2">
            {data.banks.map((b) => <BankRow key={b.name} bank={b} />)}
          </div>

          {data.cash_total_fresh !== data.cash_total && (
            <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-muted/60 leading-relaxed">
              <p>
                <span className="font-bold text-foreground">{GBP.format(data.cash_total_fresh)}</span>{" "}
                from recently-synced accounts;{" "}
                <span className="font-bold text-amber-400">
                  {GBP.format(data.cash_total - data.cash_total_fresh)}
                </span>{" "}
                from accounts that may be stale.
              </p>
              <p className="mt-1 text-muted/40">
                Stale balances often mean broken bank feed or Monzo Pot that
                hasn&apos;t been reconciled. Reconnect in FreeAgent → Banking.
              </p>
            </div>
          )}

          {data.total_marked_for_review > 0 && (
            <a
              href="https://richardpayneltd.freeagent.com/banking"
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-4 text-center text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-full border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Categorise transactions in FreeAgent →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function BankRow({ bank: b }: { bank: BankSnapshot }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-white/5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs text-foreground truncate">{b.name}</p>
          {b.stale && (
            <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              stale
            </span>
          )}
          {b.marked_for_review > 0 && (
            <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
              {b.marked_for_review} to review
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted/40 mt-0.5">
          Last activity {daysAgoLabel(b.days_since_activity)}
        </p>
      </div>
      <p className={`text-sm font-bold font-mono shrink-0 ${
        b.balance < 0 ? "text-red-400" : b.stale ? "text-muted/50" : "text-foreground"
      }`}>
        {GBP.format(b.balance)}
      </p>
    </div>
  );
}
