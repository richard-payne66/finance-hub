"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

type Tally = {
  connected?: boolean;
  tax_year: string;
  tax_year_end?: string;
  dividends: number;
  cheap_rate_cap: number;
  room: number;
  over_threshold: boolean;
  near_threshold: boolean;
};

export default function DividendTracker() {
  const [d, setD] = useState<Tally | null>(null);

  useEffect(() => {
    fetch("/api/dividend-tally").then((r) => r.json()).then(setD).catch(() => {});
  }, []);

  if (!d) {
    return <div className="mb-6 h-[96px] rounded-2xl bg-surface/40 border border-white/5 animate-pulse" />;
  }
  if (d.connected === false) return null;

  const pct = Math.min(100, Math.round((d.dividends / d.cheap_rate_cap) * 100));
  const colour = d.over_threshold ? "bg-rose-400" : d.near_threshold ? "bg-amber-400" : "bg-primary/70";
  const accent = d.over_threshold ? "text-rose-400" : d.near_threshold ? "text-amber-300" : "text-primary";

  return (
    <div className="mb-6 bg-surface border border-white/8 rounded-2xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
          💷 Dividends taken · {d.tax_year}
        </p>
        <Link href="/dividends" className="text-[9px] text-muted/40 hover:text-foreground uppercase tracking-widest font-bold">
          Record one →
        </Link>
      </div>

      <p className={`text-3xl font-black tracking-tight mt-1 ${accent}`}>{GBP.format(d.dividends)}</p>

      {/* Progress toward the higher-rate band */}
      <div className="mt-3 h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-2 text-[13px] text-foreground/80 leading-snug">
        {d.over_threshold ? (
          <>
            You&apos;re into the <strong className="text-rose-400">35.75% higher-rate</strong> band — dividends above
            here are taxed far more heavily.
          </>
        ) : (
          <>
            You can take about <strong className={accent}>{GBP.format(d.room)}</strong> more in dividends
            before the <strong className="text-foreground/90">35.75% higher-rate</strong> band kicks in.
          </>
        )}
        {d.tax_year_end && (
          <>
            {" "}You&apos;ve got until <strong className="text-foreground/90">{d.tax_year_end}</strong> — it resets the
            next morning for the new tax year.
          </>
        )}
      </p>
      <p className="mt-1 text-[10px] text-muted/40">
        Counts dividends booked in FreeAgent this tax year, on top of your £12,570 salary. Updates as transfers sync (can lag a day).
      </p>
    </div>
  );
}
