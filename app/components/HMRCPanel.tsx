"use client";

import { useEffect, useState } from "react";
import type { HmrcSummary, HmrcLine } from "@/app/api/freeagent/hmrc/route";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const GBP_DECIMAL = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function dueLabel(iso: string | null): string {
  if (!iso) return "";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 60) return `due in ${days}d`;
  const months = Math.round(days / 30);
  return `due in ${months}mo`;
}

const KIND_COLOR: Record<HmrcLine["kind"], string> = {
  "VAT":              "text-blue-400 border-blue-500/30 bg-blue-500/10",
  "Corporation Tax":  "text-purple-400 border-purple-500/30 bg-purple-500/10",
  "Self Assessment":  "text-amber-400 border-amber-500/30 bg-amber-500/10",
  "PAYE":             "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  "Other":            "text-muted border-white/10 bg-white/5",
};

export default function HMRCPanel() {
  const [data, setData] = useState<HmrcSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaid, setShowPaid] = useState(false);

  useEffect(() => {
    fetch("/api/freeagent/hmrc")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && data && !data.connected) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-6">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-2">
          What you owe HMRC
        </p>
        <p className="text-sm text-muted/60 mb-4">
          Connect FreeAgent to see VAT &amp; Corporation Tax owed.
        </p>
        <a
          href="/api/freeagent/connect"
          className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity"
        >
          Connect FreeAgent
        </a>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-6">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-2">
          What you owe HMRC
        </p>
        <p className="text-sm text-muted/40">Loading…</p>
      </div>
    );
  }

  const owedLines = data.lines.filter((l) => l.bucket === "owed_now");
  const upcomingLines = data.lines.filter((l) => l.bucket === "upcoming_estimate");
  const paidLines = data.lines.filter((l) => l.bucket === "paid");

  const isOverdue = (data.next_due_days ?? 0) < 0;

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          What you owe HMRC
        </p>
        {data.next_due_on && (
          <p className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
            isOverdue ? "text-red-400" :
            ((data.next_due_days ?? 999) < 14 ? "text-amber-400" : "text-muted/50")
          }`}>
            next {dueLabel(data.next_due_on)}
          </p>
        )}
      </div>

      {/* Headline number */}
      {data.owed_now_total === 0 && upcomingLines.length === 0 ? (
        <div>
          <p className="text-4xl font-black text-emerald-400">£0</p>
          <p className="text-xs text-muted/50 mt-2">Nothing owed right now — nice 🎉</p>
        </div>
      ) : (
        <p className="text-4xl font-black text-foreground tracking-tight">
          {GBP.format(data.owed_now_total)}
        </p>
      )}

      {/* Owed now lines */}
      {owedLines.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {owedLines.map((l, i) => <LineRow key={i} line={l} />)}
        </div>
      )}

      {/* Upcoming estimates */}
      {upcomingLines.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] text-muted/60 uppercase tracking-widest font-bold">
              Estimated upcoming
            </p>
            <p className="text-[10px] text-muted/40 font-mono">
              {GBP.format(data.upcoming_total)} total
            </p>
          </div>
          <div className="flex flex-col gap-2 opacity-80">
            {upcomingLines.map((l, i) => <LineRow key={i} line={l} estimate />)}
          </div>
          <p className="text-[9px] text-muted/30 mt-2 italic">
            Draft estimates from FreeAgent · not yet finalised
          </p>
        </div>
      )}

      {/* Paid history toggle */}
      {paidLines.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/5">
          <button
            onClick={() => setShowPaid((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
              Paid history · {paidLines.length} payment{paidLines.length !== 1 ? "s" : ""}
              {data.paid_ytd_total > 0 && (
                <span className="ml-2 text-muted/40 font-mono normal-case">
                  ({GBP.format(data.paid_ytd_total)} last 12mo)
                </span>
              )}
            </p>
            <span className="text-[9px] text-muted/40 font-mono">
              {showPaid ? "Hide ▴" : "Show ▾"}
            </span>
          </button>
          {showPaid && (
            <div className="mt-3 flex flex-col gap-1.5 opacity-70">
              {paidLines.map((l, i) => <LineRow key={i} line={l} paid />)}
            </div>
          )}
        </div>
      )}

      <p className="text-[9px] text-muted/30 mt-5 flex items-center justify-between gap-2">
        <span>FreeAgent + manual entries · updated {new Date(data.updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
        <a
          href="/api/freeagent/connect"
          className="text-muted/40 hover:text-foreground transition-colors underline"
          title="Reconnect FreeAgent"
        >
          ↻
        </a>
      </p>
    </div>
  );
}

function LineRow({ line: l, estimate, paid }: { line: HmrcLine; estimate?: boolean; paid?: boolean }) {
  const days = l.due_on ? Math.ceil((new Date(l.due_on).getTime() - Date.now()) / 86400000) : null;
  const lineOverdue = (days ?? 0) < 0 && !paid;
  const lineSoon = !paid && !estimate && (days ?? 999) < 14;

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-t border-white/5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${KIND_COLOR[l.kind]}`}>
            {l.kind}
          </span>
          {l.source === "Manual" && (
            <span className="text-[8px] text-muted/40 uppercase tracking-widest font-bold">
              manual
            </span>
          )}
        </div>
        <p className="text-xs text-muted/70 mt-1 truncate">{l.period_label}</p>
        <p className={`text-[10px] mt-0.5 ${
          lineOverdue ? "text-red-400" :
          lineSoon ? "text-amber-400/80" :
          "text-muted/40"
        }`}>
          {paid && l.paid_on ? `Paid ${fmtDate(l.paid_on)}` :
           l.due_on ? `${fmtDate(l.due_on)} · ${dueLabel(l.due_on)}` :
           "—"}
        </p>
      </div>
      <p className={`text-sm font-bold font-mono shrink-0 ${
        paid ? "text-muted/50 line-through" :
        lineOverdue ? "text-red-400" :
        "text-foreground"
      }`}>
        {GBP_DECIMAL.format(l.amount)}
      </p>
    </div>
  );
}
