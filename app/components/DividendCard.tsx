"use client";

import { useEffect, useState } from "react";
import type { DividendHeadroom } from "@/app/api/dividend-headroom/route";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export default function DividendCard() {
  const [data, setData] = useState<DividendHeadroom | null>(null);
  const [showMath, setShowMath] = useState(false);

  useEffect(() => {
    fetch("/api/dividend-headroom").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-5 animate-pulse h-full">
        <div className="h-3 w-32 bg-white/5 rounded mb-3" />
        <div className="h-10 w-24 bg-white/5 rounded" />
      </div>
    );
  }

  const colour = data.status === "comfortable" ? "text-emerald-400"
               : data.status === "tight"       ? "text-amber-300"
               :                                 "text-rose-400";

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5 h-full flex flex-col">
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-1">
        💰 Pay yourself
      </p>
      <p className="text-[10px] text-muted/50 mb-3">
        Safe dividend right now
      </p>

      <p className={`text-4xl font-black tracking-tight ${colour}`}>
        {GBP.format(data.safe_dividend)}
      </p>
      <p className="text-xs text-muted/70 mt-2 leading-snug">{data.note}</p>

      <button
        onClick={() => setShowMath((v) => !v)}
        className="mt-auto pt-3 text-[10px] text-muted/40 uppercase tracking-widest font-bold text-left hover:text-muted"
      >
        {showMath ? "Hide maths ▴" : "Show maths ▾"}
      </button>

      {showMath && (
        <div className="mt-2 text-[11px] text-muted/70 font-mono space-y-1">
          <div className="flex justify-between"><span>Cash today</span><span>{GBP.format(data.cash_today)}</span></div>
          <div className="flex justify-between"><span>− Tax owed</span><span>{GBP.format(data.tax_owed)}</span></div>
          <div className="flex justify-between"><span>− Operating buffer</span><span>{GBP.format(data.operating_buffer)}</span></div>
          <div className="flex justify-between border-t border-white/10 pt-1 mt-1 font-bold text-foreground">
            <span>= Safe dividend</span><span>{GBP.format(data.safe_dividend)}</span>
          </div>
          <p className="text-[10px] text-muted/40 italic pt-2">
            Buffer = 1 month avg outgoings or £2k floor. Conservative estimate — ask your accountant before drawing big sums.
          </p>
        </div>
      )}
    </div>
  );
}
