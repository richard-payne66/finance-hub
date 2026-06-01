"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { openButler } from "./ButlerChat";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

type Headroom = {
  cash_today: number;
  tax_owed: number;
  safe_dividend: number;
  status: "comfortable" | "tight" | "negative";
  note: string;
};
type Bill = { label: string; date: string; amount: number };

// Decision questions that open the butler pre-asked.
const ASKS = [
  "Can I take £3,000 out this month?",
  "Can I afford a £2,000 camera through the company?",
  "Am I set aside enough for my next tax bill?",
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// The butler's opening line: a plain-English read of where Richard stands,
// built from deterministic numbers (no guessed figures), plus the short list
// of things only he can action. This is the first thing on the dashboard.
export default function ButlerBriefing() {
  const [loaded, setLoaded] = useState(false);
  const [h, setH] = useState<Headroom | null>(null);
  const [queue, setQueue] = useState(0);
  const [bill, setBill] = useState<Bill | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch("/api/dividend-headroom").then((r) => r.json()),
      fetch("/api/categorisation/list").then((r) => r.json()),
      fetch("/api/forecast").then((r) => r.json()),
    ]).then(([hr, list, fc]) => {
      if (cancelled) return;
      if (hr.status === "fulfilled" && hr.value && typeof hr.value.safe_dividend === "number") {
        setH(hr.value as Headroom);
      }
      if (list.status === "fulfilled" && Array.isArray(list.value?.queue)) {
        setQueue(list.value.queue.length);
      }
      if (fc.status === "fulfilled" && Array.isArray(fc.value?.events)) {
        const horizon = Date.now() + 14 * 86400000;
        const soon = fc.value.events.find(
          (e: { amount: number; date: string; dd_enabled?: boolean; label: string }) =>
            e.amount < 0 && !e.dd_enabled && new Date(e.date).getTime() <= horizon
        );
        if (soon) setBill({ label: soon.label, date: soon.date, amount: Math.abs(soon.amount) });
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!loaded) {
    return <div className="mb-6 h-[180px] rounded-2xl bg-surface/40 border border-white/5 animate-pulse" />;
  }

  const notConnected = !h || /connect freeagent/i.test(h.note ?? "");
  const safe = h?.safe_dividend ?? 0;
  const taxOwed = h?.tax_owed ?? 0;
  const hasQueue = queue > 0;
  const hasBill = !!bill;
  const needs = hasQueue || hasBill;

  const headline = needs ? "A couple of things for you" : "You're all set";

  // The money sentence — honest about the tight case.
  let moneyLine: React.ReactNode;
  if (notConnected) {
    moneyLine = (
      <>Connect FreeAgent and I&apos;ll show you exactly what&apos;s safe to take and what to keep for tax.</>
    );
  } else if (safe > 0) {
    moneyLine = (
      <>
        You can safely take about <strong className="text-primary">{GBP.format(safe)}</strong> out right now
        {taxOwed > 0 ? <> — that&apos;s after keeping <strong className="text-foreground/90">{GBP.format(taxOwed)}</strong> aside for tax.</> : <>.</>}
      </>
    );
  } else {
    moneyLine = (
      <>
        I&apos;d hold off taking money out for now — once tax{taxOwed > 0 ? <> ({GBP.format(taxOwed)})</> : null} and a
        month&apos;s buffer are covered, there&apos;s nothing spare yet.
      </>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-surface p-6">
      {/* Greeting + headline */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted/50">{greeting()}, Richard</p>
          <h2 className="text-xl font-black tracking-tight text-foreground mt-0.5">{headline}</h2>
        </div>
        <span
          className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${needs ? "bg-amber-400" : "bg-primary"}`}
          aria-hidden
        />
      </div>

      {/* The CFO line */}
      <p className="text-[15px] text-foreground/85 leading-relaxed">{moneyLine}</p>

      {/* What needs you */}
      <div className="mt-4 flex flex-col gap-2">
        {hasQueue && (
          <Link
            href="/bookkeeping"
            className="flex items-center justify-between gap-3 group rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5"
          >
            <span className="text-sm text-foreground">
              {queue} transaction{queue === 1 ? "" : "s"} to review
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300 group-hover:text-amber-200 shrink-0">
              Review →
            </span>
          </Link>
        )}
        {hasBill && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5">
            <span className="text-sm text-foreground">
              {bill!.label} — {GBP.format(bill!.amount)} due {fmtDate(bill!.date)}
            </span>
            <span className="text-[11px] text-muted/50 shrink-0">pay manually</span>
          </div>
        )}
        {!needs && !notConnected && (
          <p className="text-[13px] text-muted/60">
            ✓ Nothing needs you — I&apos;m handling the bookkeeping and watching your bills.
          </p>
        )}
      </div>

      {/* Ask the butler — one-tap decisions */}
      <div className="mt-5 pt-4 border-t border-white/8">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted/40 mb-2.5">Ask me anything</p>
        <div className="flex flex-wrap gap-2">
          {ASKS.map((q) => (
            <button
              key={q}
              onClick={() => openButler(q)}
              className="text-[12px] text-foreground/80 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
