"use client";

import { useEffect, useState } from "react";
import type { DividendHeadroom } from "@/app/api/dividend-headroom/route";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const GBP_PRECISE = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

// Tax-year 2026/27 thresholds. Pinned here so the strategy maths is
// transparent and editable when bands change.
// NOTE: dividend tax ROSE +2 points from 6 April 2026 (Autumn 2025 Budget).
const PERSONAL_ALLOWANCE = 12570;
const DIVIDEND_ALLOWANCE = 500;
const BASIC_RATE_END = 50270;          // top of basic-rate band (frozen to 2031)
const DIVIDEND_RATE_BASIC = 0.1075;    // 10.75% (was 8.75% pre-Apr-2026)
const DIVIDEND_RATE_HIGHER = 0.3575;   // 35.75% (was 33.75% pre-Apr-2026)
const RECOMMENDED_SALARY = PERSONAL_ALLOWANCE; // £12,570/yr = max no-tax salary

export default function DividendCard() {
  const [data, setData] = useState<DividendHeadroom | null>(null);
  const [tab, setTab] = useState<"now" | "strategy">("now");

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

  const colour = data.status === "comfortable" ? "text-primary"
               : data.status === "tight"       ? "text-amber-300"
               :                                 "text-rose-400";

  // Strategy maths: assume RECOMMENDED_SALARY all year, then how much
  // dividend fits in the basic-rate band before higher-rate kicks in.
  const dividendBasicRateRoom = Math.max(0, BASIC_RATE_END - RECOMMENDED_SALARY); // £37,700
  const monthlyDividendCap = Math.round(dividendBasicRateRoom / 12);
  const taxOnFullBasicDividend = Math.round((dividendBasicRateRoom - DIVIDEND_ALLOWANCE) * DIVIDEND_RATE_BASIC);

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          💰 Pay yourself
        </p>
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest bg-white/3 rounded-full p-0.5">
          <button
            onClick={() => setTab("now")}
            className={`px-2.5 py-1 rounded-full transition-colors ${tab === "now" ? "bg-white/10 text-foreground" : "text-muted/60 hover:text-foreground"}`}
          >
            Now
          </button>
          <button
            onClick={() => setTab("strategy")}
            className={`px-2.5 py-1 rounded-full transition-colors ${tab === "strategy" ? "bg-white/10 text-foreground" : "text-muted/60 hover:text-foreground"}`}
          >
            Strategy
          </button>
        </div>
      </div>

      {tab === "now" && (
        <>
          <p className="text-[10px] text-muted/50 mb-2">Safe dividend right now</p>
          <p className={`text-4xl font-black tracking-tight ${colour}`}>{GBP.format(data.safe_dividend)}</p>
          <p className="text-xs text-muted/70 mt-2 leading-snug">{data.note}</p>

          <details className="mt-auto pt-3 group">
            <summary className="text-[10px] text-muted/40 uppercase tracking-widest font-bold cursor-pointer hover:text-muted list-none">
              <span className="group-open:hidden">Show maths ▾</span>
              <span className="hidden group-open:inline">Hide maths ▴</span>
            </summary>
            <div className="mt-2 text-[11px] text-muted/70 font-mono space-y-1">
              <div className="flex justify-between"><span>Cash today</span><span>{GBP.format(data.cash_today)}</span></div>
              <div className="flex justify-between"><span>− Tax owed</span><span>{GBP.format(data.tax_owed)}</span></div>
              <div className="flex justify-between"><span>− Operating buffer</span><span>{GBP.format(data.operating_buffer)}</span></div>
              <div className="flex justify-between border-t border-white/10 pt-1 mt-1 font-bold text-foreground">
                <span>= Safe dividend</span><span>{GBP.format(data.safe_dividend)}</span>
              </div>
              <p className="text-[10px] text-muted/40 italic pt-2">
                Conservative estimate. Buffer = 1 month avg outgoings or £2k floor.
              </p>
            </div>
          </details>
        </>
      )}

      {tab === "strategy" && (
        <div className="flex flex-col gap-3 text-xs leading-relaxed">
          <p className="text-sm text-foreground font-bold leading-snug">
            The tax-optimal salary + dividend setup for a sole director.
          </p>

          <div className="bg-white/3 rounded-lg p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted/60 font-bold">Salary</span>
              <span className="font-mono font-bold text-foreground">{GBP_PRECISE.format(RECOMMENDED_SALARY)}/yr</span>
            </div>
            <p className="text-[11px] text-muted/70">
              = £{Math.round(RECOMMENDED_SALARY / 12).toLocaleString()}/mo. Zero income tax (uses personal allowance), zero employee NI (under £12,570 threshold), still earns state-pension credit.
            </p>
          </div>

          <div className="bg-white/3 rounded-lg p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-widest text-muted/60 font-bold">Dividends</span>
              <span className="font-mono font-bold text-foreground">up to {GBP.format(monthlyDividendCap)}/mo</span>
            </div>
            <p className="text-[11px] text-muted/70">
              That fills the basic-rate band ({GBP.format(dividendBasicRateRoom)}/yr after salary). Tax: {DIVIDEND_RATE_BASIC * 100}% on dividends above {GBP.format(DIVIDEND_ALLOWANCE)} (~{GBP.format(taxOnFullBasicDividend)}/yr). No NI on dividends ever.
            </p>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1">📝 Don&apos;t skip</p>
            <p className="text-[11px] text-muted/70">
              Every dividend needs a <strong>dividend voucher</strong> (date, amount, shareholder). Without one HMRC can treat it as a director&apos;s loan — taxable + 35.75% s455 charge.
            </p>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">🎯 Bonus optimisation</p>
            <p className="text-[11px] text-muted/70">
              <strong>Employer pension contribution</strong> from the company is deductible (cuts corp tax) AND protects you from the £100k personal allowance taper. Up to £60k/yr annual allowance.
            </p>
          </div>

          <p className="text-[10px] text-muted/40 italic">
            Figures use 2026/27 bands. Dividend tax rose ~2 points in April 2026 (now 10.75% basic,
            35.75% higher). Ask your accountant before changing salary or starting a pension.
          </p>
        </div>
      )}
    </div>
  );
}
