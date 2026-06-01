"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

type Bill = { label: string; date: string; amount: number };

// The single calm line at the top of the dashboard: either "you're all
// caught up" or the short list of things only Richard can action right now.
// Sources: the LIVE review queue (same as /bookkeeping) and the next tax
// bill that ISN'T on direct debit and is due within two weeks (i.e. one he
// actually has to pay by hand). If we can't confirm the queue, we stay
// silent rather than falsely reassure.
export default function CaughtUpBanner() {
  const [loaded, setLoaded] = useState(false);
  const [queueOk, setQueueOk] = useState(false);
  const [needLook, setNeedLook] = useState(0);
  const [bill, setBill] = useState<Bill | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch("/api/categorisation/list").then((r) => r.json()),
      fetch("/api/forecast").then((r) => r.json()),
    ]).then(([q, f]) => {
      if (cancelled) return;
      if (q.status === "fulfilled" && Array.isArray(q.value?.queue)) {
        setNeedLook(q.value.queue.length);
        setQueueOk(true);
      }
      if (f.status === "fulfilled" && Array.isArray(f.value?.events)) {
        const horizon = Date.now() + 14 * 86400000;
        const soon = f.value.events.find(
          (e: { amount: number; date: string; dd_enabled?: boolean; label: string }) =>
            e.amount < 0 && !e.dd_enabled && new Date(e.date).getTime() <= horizon
        );
        if (soon) setBill({ label: soon.label, date: soon.date, amount: Math.abs(soon.amount) });
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <div className="mb-4 h-[68px] rounded-2xl bg-surface/40 border border-white/5 animate-pulse" />;
  }

  const hasQueue = needLook > 0;
  const hasBill = !!bill;

  // Something needs him.
  if (hasQueue || hasBill) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4">
        <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400 mb-2.5">Needs you</p>
        <div className="flex flex-col divide-y divide-white/5">
          {hasQueue && (
            <Link href="/bookkeeping" className="flex items-center justify-between gap-3 group pb-2 first:pt-0">
              <span className="text-sm text-foreground">
                {needLook} transaction{needLook === 1 ? "" : "s"} to review
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300 group-hover:text-amber-200 shrink-0">
                Review →
              </span>
            </Link>
          )}
          {hasBill && (
            <div className={`flex items-center justify-between gap-3 ${hasQueue ? "pt-2" : ""}`}>
              <span className="text-sm text-foreground">
                {bill!.label} — {GBP.format(bill!.amount)} due {fmtDate(bill!.date)}
              </span>
              <span className="text-[11px] text-muted/50 shrink-0">pay manually</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Confirmed nothing waiting.
  if (queueOk) {
    return (
      <div className="mb-4 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 flex items-center gap-3">
        <span className="text-2xl leading-none">✓</span>
        <div>
          <p className="text-sm font-bold text-foreground">You&apos;re all caught up.</p>
          <p className="text-[11px] text-muted/60">Nothing needs you right now — I&apos;m handling the rest.</p>
        </div>
      </div>
    );
  }

  // Couldn't read the queue — don't claim "all caught up". Stay silent.
  return null;
}
