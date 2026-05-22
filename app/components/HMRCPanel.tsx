"use client";

import { useEffect, useState } from "react";
import type { HmrcSummary } from "@/app/api/freeagent/hmrc/route";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function dueLabel(days: number | null): string {
  if (days === null) return "";
  if (days < 0)  return `${Math.abs(days)} days overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

export default function HMRCPanel() {
  const [data, setData] = useState<HmrcSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/freeagent/hmrc")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Not connected — show connect button
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

  const isOverdue = (data.next_due_days ?? 0) < 0;

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          What you owe HMRC
        </p>
        {data.next_due_days !== null && (
          <p className={`text-[9px] font-bold uppercase tracking-widest font-mono ${
            isOverdue ? "text-red-400" :
            (data.next_due_days < 14 ? "text-amber-400" : "text-muted/50")
          }`}>
            {dueLabel(data.next_due_days)}
          </p>
        )}
      </div>

      {data.total === 0 ? (
        <div>
          <p className="text-4xl font-black text-emerald-400">£0</p>
          <p className="text-xs text-muted/50 mt-2">Nothing owed right now — nice 🎉</p>
        </div>
      ) : (
        <>
          <p className="text-4xl font-black text-foreground tracking-tight">
            {GBP.format(data.total)}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {data.lines.map((l, i) => {
              const days = l.due_on ? Math.ceil((new Date(l.due_on).getTime() - Date.now()) / 86400000) : null;
              const lineOverdue = (days ?? 0) < 0 && l.amount > 0;
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2 border-t border-white/5 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">{l.kind}</p>
                    <p className="text-[10px] text-muted/50 mt-0.5">
                      {l.period_label}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-foreground">
                      {GBP.format(l.amount)}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${
                      lineOverdue ? "text-red-400" :
                      ((days ?? 999) < 14 ? "text-amber-400/80" : "text-muted/40")
                    }`}>
                      {l.due_on ? `${fmtDate(l.due_on)}${days !== null ? ` · ${dueLabel(days)}` : ""}` : "no due date"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-[9px] text-muted/30 mt-5">
        From FreeAgent · updated {new Date(data.updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
