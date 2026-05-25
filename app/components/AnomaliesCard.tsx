"use client";

import { useEffect, useState } from "react";
import type { Anomaly } from "@/app/api/anomalies/route";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export default function AnomaliesCard() {
  const [data, setData] = useState<{ connected: boolean; anomalies: Anomaly[] } | null>(null);

  useEffect(() => {
    fetch("/api/anomalies").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data || !data.connected) return null;

  // Calm by default — only render if there's something to look at
  if (data.anomalies.length === 0) {
    return (
      <div className="bg-surface border border-primary/20 rounded-2xl p-5">
        <p className="text-[9px] uppercase tracking-widest font-bold text-primary mb-1">
          ✓ Nothing unusual
        </p>
        <p className="text-xs text-muted/60">
          No anomalies in the last 6 months — recurring payments are on schedule, no duplicates, no surprise vendors.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5">
      <p className="text-[9px] uppercase tracking-widest font-bold text-muted/70 mb-3">
        🔍 Worth a look ({data.anomalies.length})
      </p>
      <div className="flex flex-col gap-2">
        {data.anomalies.map((a) => (
          <div key={a.id} className="flex items-start gap-3 py-2 border-t border-white/5 first:border-t-0">
            <span className={`text-base shrink-0 ${
              a.severity === "high"   ? "text-rose-400" :
              a.severity === "medium" ? "text-amber-400" :
                                        "text-muted/50"
            }`}>
              {a.kind === "possible_duplicate" ? "⚠" :
               a.kind === "missing_recurring" ? "↺" :
               a.kind === "large_outgoing"    ? "↑" :
                                                "✦"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">{a.title}</p>
              <p className="text-[11px] text-muted/60 mt-0.5">{a.detail}</p>
            </div>
            {a.amount !== null && (
              <p className="text-sm font-mono font-bold text-foreground/80 shrink-0">
                {GBP.format(Math.abs(a.amount))}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
