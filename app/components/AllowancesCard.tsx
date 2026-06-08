"use client";

import { useEffect, useState } from "react";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

type Summary = {
  tax_year: string;
  trivial: { used: number; cap: number; remaining: number; count: number; per_gift: number };
  mileage: { miles: number; rate: number; claimable: number; trips: number };
};

export default function AllowancesCard() {
  const [d, setD] = useState<Summary | null>(null);
  const [giftAmt, setGiftAmt] = useState("50");
  const [miles, setMiles] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/trackers").then((r) => r.json()).then(setD).catch(() => {});
  }
  useEffect(load, []);

  async function add(type: "trivial" | "mileage", payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...payload }),
      });
      const j = await r.json();
      if (r.ok) { setD(j); if (type === "mileage") setMiles(""); }
    } finally { setBusy(false); }
  }

  if (!d) {
    return <div className="mb-6 h-[120px] rounded-2xl bg-surface/40 border border-white/5 animate-pulse" />;
  }

  const tb = d.trivial;
  const mil = d.mileage;
  const tbPct = Math.min(100, Math.round((tb.used / tb.cap) * 100));

  return (
    <div className="mb-6 bg-surface border border-white/8 rounded-2xl p-5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50 mb-3">
        🎁 Tax-free extras · {d.tax_year}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Trivial benefits */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-foreground/70">Trivial benefits</p>
          <p className="text-2xl font-black text-primary mt-0.5">{GBP.format(tb.remaining)} <span className="text-[11px] font-bold text-muted/50">left</span></p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${tbPct}%` }} />
          </div>
          <p className="text-[11px] text-muted/60 mt-1.5">
            {GBP.format(tb.used)} of {GBP.format(tb.cap)} used · {tb.count} gift{tb.count === 1 ? "" : "s"} so far
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-muted/50">£</span>
            <input
              type="number" inputMode="decimal" value={giftAmt} onChange={(e) => setGiftAmt(e.target.value)}
              className="w-16 bg-background border border-white/10 rounded-lg px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-white/30"
            />
            <button
              onClick={() => add("trivial", { amount: parseFloat(giftAmt) })}
              disabled={busy}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 disabled:opacity-40"
            >
              Log a gift
            </button>
          </div>
          <p className="text-[10px] text-muted/40 mt-1.5 leading-snug">≤£50 gift card on the company card. Keep the receipt.</p>
        </div>

        {/* Mileage */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-foreground/70">Business mileage</p>
          <p className="text-2xl font-black text-primary mt-0.5">{GBP.format(mil.claimable)} <span className="text-[11px] font-bold text-muted/50">to claim</span></p>
          <p className="text-[11px] text-muted/60 mt-1.5">
            {mil.miles.toLocaleString()} miles this year @ 45p · {mil.trips} trip{mil.trips === 1 ? "" : "s"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number" inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)}
              placeholder="miles"
              className="w-20 bg-background border border-white/10 rounded-lg px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-white/30"
            />
            <button
              onClick={() => add("mileage", { miles: parseFloat(miles) })}
              disabled={busy || !miles}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 disabled:opacity-40"
            >
              Log a trip
            </button>
          </div>
          <p className="text-[10px] text-muted/40 mt-1.5 leading-snug">Just log the miles — no petrol receipts needed.</p>
        </div>
      </div>
    </div>
  );
}
