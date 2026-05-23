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

const STATUS_META = {
  comfortable: {
    badge: "On track",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    valueClass: "text-emerald-300",
  },
  tight: {
    badge: "Getting tight",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    valueClass: "text-amber-300",
  },
  at_risk: {
    badge: "Action needed",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    valueClass: "text-rose-300",
  },
} as const;

export default function ForecastPanel() {
  const [data, setData] = useState<Forecast | null>(null);

  useEffect(() => {
    fetch("/api/forecast").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-gradient-to-br from-surface to-surface/50 border border-white/8 rounded-2xl p-8 animate-pulse">
        <div className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="h-12 w-64 bg-white/5 rounded mb-2" />
        <div className="h-3 w-48 bg-white/5 rounded" />
      </div>
    );
  }

  const meta = STATUS_META[data.status];

  // Build a simple horizontal timeline of next 90 days
  const horizonDays = 90;
  const now = Date.now();
  const within90 = data.events.filter(
    (e) => new Date(e.date).getTime() <= now + horizonDays * 86400000
  );

  return (
    <div className="bg-gradient-to-br from-surface to-surface/50 border border-white/8 rounded-2xl p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          12 Month Outlook
        </p>
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${meta.badgeClass}`}>
          {meta.badge}
        </span>
      </div>

      <div className="flex items-baseline gap-3 mb-2">
        <p className={`text-5xl sm:text-6xl font-black tracking-tight ${meta.valueClass}`}>
          {GBP.format(data.cash_in_12mo)}
        </p>
        <p className="text-xs text-muted/50">in 12 months</p>
      </div>
      <p className="text-sm text-muted/70 leading-relaxed">
        {data.status_note}
      </p>

      {/* Mini cashflow projection: today / 3mo / 6mo / 12mo */}
      <div className="mt-6 grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Today", value: data.cash_today },
          { label: "3 months", value: data.cash_in_3mo },
          { label: "6 months", value: data.cash_in_6mo },
          { label: "12 months", value: data.cash_in_12mo },
        ].map((p, i) => (
          <div key={p.label} className={`py-2 rounded-lg ${i === 3 ? "bg-white/3" : ""}`}>
            <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
              {p.label}
            </p>
            <p className={`text-sm font-bold font-mono mt-1 ${
              p.value < 0 ? "text-rose-400" :
              p.value < data.total_payments_out_12mo * 0.25 ? "text-amber-300" :
              "text-foreground"
            }`}>
              {GBP.format(p.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Next 90 days timeline */}
      {within90.length > 0 && (
        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-[9px] text-muted/60 uppercase tracking-widest font-bold mb-3">
            Next 90 days
          </p>
          <div className="flex flex-col gap-1.5">
            {within90.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[9px] font-mono tabular-nums shrink-0 w-12 ${
                    e.amount > 0 ? "text-emerald-400/70" : "text-muted/50"
                  }`}>
                    {fmtDate(e.date)}
                  </span>
                  <span className="text-xs text-muted/80 truncate">{e.label}</span>
                </div>
                <span className={`text-xs font-bold font-mono shrink-0 ${
                  e.amount > 0 ? "text-emerald-400" : "text-foreground"
                }`}>
                  {e.amount > 0 ? "+" : ""}{GBP.format(e.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-muted/30 mt-5 leading-relaxed">
        Based on cash you have today + invoices already issued + tax bills already known.
        Doesn&apos;t guess at future revenue or spend.
      </p>
    </div>
  );
}
