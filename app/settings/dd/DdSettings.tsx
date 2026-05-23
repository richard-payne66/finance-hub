"use client";

import { useEffect, useState } from "react";
import type { TaxKind, DdFlags } from "@/app/api/dd-flags/route";

type Row = { kind: TaxKind; label: string; setupUrl: string; helpText: string };

const ROWS: Row[] = [
  {
    kind: "vat",
    label: "VAT",
    setupUrl: "https://www.gov.uk/pay-vat/direct-debit",
    helpText: "Set up in HMRC online so VAT bills auto-pay from your business account.",
  },
  {
    kind: "corp_tax",
    label: "Corporation Tax",
    setupUrl: "https://www.gov.uk/pay-corporation-tax/direct-debit",
    helpText: "One-off DD per return — has to be set up after filing each year.",
  },
  {
    kind: "self_assessment",
    label: "Self Assessment (personal)",
    setupUrl: "https://www.gov.uk/pay-self-assessment-tax-bill",
    helpText: "Budget Payment Plan lets you spread the cost across the year.",
  },
  {
    kind: "paye",
    label: "PAYE & NI",
    setupUrl: "https://www.gov.uk/pay-paye-tax/direct-debit",
    helpText: "Variable DD pays the correct amount each month automatically.",
  },
];

export default function DdSettings() {
  const [flags, setFlags] = useState<DdFlags>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dd-flags").then((r) => r.json()).then(setFlags).finally(() => setLoading(false));
  }, []);

  async function toggle(kind: TaxKind, enabled: boolean) {
    setFlags((f) => ({ ...f, [kind]: enabled })); // optimistic
    await fetch("/api/dd-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, enabled }),
    });
  }

  if (loading) return <p className="text-sm text-muted/60">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {ROWS.map((r) => {
        const on = !!flags[r.kind];
        return (
          <div key={r.kind} className={`border rounded-2xl p-5 transition-colors ${on ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/8 bg-surface"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-foreground">{r.label}</p>
                  {on && (
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      🔒 On
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted/60 leading-snug">{r.helpText}</p>
                <a
                  href={r.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary hover:underline mt-2 inline-block"
                >
                  Set up at gov.uk ↗
                </a>
              </div>
              <button
                onClick={() => toggle(r.kind, !on)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  on ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/25"
                     : "bg-white/5 text-muted border border-white/15 hover:bg-white/10"
                }`}
              >
                {on ? "DD set up ✓" : "Mark as set up"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
