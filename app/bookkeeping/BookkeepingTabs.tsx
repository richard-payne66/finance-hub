"use client";

import { useState } from "react";
import ReviewQueue from "../review/ReviewQueue";
import ActivityView from "../activity/ActivityView";
import ReconcileView from "../reconcile/ReconcileView";

type Tab = "needs" | "done" | "check";

const TABS: { id: Tab; label: string }[] = [
  { id: "needs", label: "Needs you" },
  { id: "done", label: "Done for you" },
  { id: "check", label: "Cross-check" },
];

export default function BookkeepingTabs() {
  const [tab, setTab] = useState<Tab>("needs");

  return (
    <>
      <div className="flex gap-1 flex-wrap mb-6">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                active
                  ? "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border bg-primary text-background border-primary"
                  : "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border border-white/10 text-muted hover:border-white/20 hover:text-foreground transition-all"
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "needs" && <ReviewQueue />}
      {tab === "done" && <ActivityView />}
      {tab === "check" && <ReconcileView />}
    </>
  );
}
