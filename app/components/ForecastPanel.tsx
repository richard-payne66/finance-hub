"use client";

import { useEffect, useState } from "react";
import type { Forecast } from "@/app/api/forecast/route";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

// Stripped-down: just shows upcoming HMRC bills + DD status.
// No cash projections — those were confusing the user with 'you'll have
// negative money' headlines that made a healthy business look scary.

export default function ForecastPanel() {
  const [data, setData] = useState<Forecast | null>(null);

  useEffect(() => {
    fetch("/api/forecast").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-5 animate-pulse">
        <div className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="h-6 w-48 bg-white/5 rounded" />
      </div>
    );
  }

  const horizonDays = 90;
  const now = Date.now();
  const within90 = data.events.filter(
    (e) => new Date(e.date).getTime() <= now + horizonDays * 86400000
  );

  if (within90.length === 0) {
    return (
      <div className="bg-surface border border-primary/20 rounded-2xl p-5">
        <p className="text-[9px] uppercase tracking-widest font-bold text-primary mb-1">
          🗓️ Upcoming bills
        </p>
        <p className="text-sm text-muted/80">No HMRC bills due in the next 90 days.</p>
      </div>
    );
  }

  const total = within90.reduce((s, e) => s + Math.abs(e.amount), 0);

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
            🗓️ Upcoming bills (next 90 days)
          </p>
          <p className="text-[10px] text-muted/50 mt-0.5">
            {within90.length} bill{within90.length !== 1 ? "s" : ""} · {GBP.format(total)} total
          </p>
        </div>
        <p className="text-[9px] text-muted/40">🔒 = direct debit set up</p>
      </div>

      <div className="flex flex-col">
        {within90.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 border-t border-white/5 first:border-t-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-[10px] font-mono tabular-nums shrink-0 w-12 text-muted/60">
                {fmtDate(e.date)}
              </span>
              <span className="text-sm text-foreground/90 truncate">{e.label}</span>
              {e.dd_enabled ? (
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 shrink-0">
                  🔒 DD
                </span>
              ) : (e.kind === "vat" || e.kind === "corp_tax" || e.kind === "self_assessment" || e.kind === "paye") ? (
                <span className="text-[9px] text-amber-400/60 shrink-0 font-mono">
                  no DD
                </span>
              ) : null}
            </div>
            <span className="text-sm font-bold font-mono shrink-0 text-foreground">
              {GBP.format(e.amount)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted/40 mt-4">
        Set up DDs in <a href="/settings/dd" className="underline hover:text-muted">settings</a> to remove them from the to-remember list.
      </p>
    </div>
  );
}
