"use client";

import { useEffect, useState } from "react";
import type { TaxKind, DdFlags } from "@/app/api/dd-flags/route";

type Row = {
  kind: TaxKind;
  label: string;
  setupUrl: string;
  helpText: string;
  preReq?: string;     // anything that has to happen before DD is possible
  preReqUrl?: string;
};

const ROWS: Row[] = [
  {
    kind: "vat",
    label: "VAT",
    setupUrl: "https://www.tax.service.gov.uk/vat-through-software/vat-overview",
    helpText:
      "Once set up, HMRC pulls the exact amount owed 3 working days after the VAT return is filed. Only the return amount is collected — penalties/interest still need manual payment.",
  },
  {
    kind: "corp_tax",
    label: "Corporation Tax",
    setupUrl: "https://www.gov.uk/pay-corporation-tax/direct-debit",
    helpText:
      "Set up after each return is filed. A one-off DD pulls the exact amount on or just before the payment deadline. New DD needed every year.",
    preReq:
      "Corp Tax isn't currently linked to your HMRC online account — your accountant handles it via their agent service. Either ask them to set up DD on each filing, OR add CT to your own HMRC account first.",
    preReqUrl: "https://www.tax.service.gov.uk/business-account/add-tax",
  },
  {
    kind: "self_assessment",
    label: "Self Assessment",
    setupUrl: "https://www.gov.uk/pay-self-assessment-tax-bill",
    helpText:
      "Two options: (a) one-off DD per bill via the 'Pay your Self Assessment' flow, (b) Budget Payment Plan — recurring weekly/monthly DD that builds up credit toward your next bill.",
  },
  {
    kind: "paye",
    label: "PAYE & NI",
    setupUrl: "https://www.gov.uk/pay-paye-tax/direct-debit",
    helpText:
      "Variable DD pulls the exact PAYE amount owed each month, calculated from your RTI submissions. Set-and-forget.",
    preReq:
      "PAYE isn't currently linked to your HMRC online account — your accountant handles it via their agent service. Variable DD must be set up by whoever the employer-PAYE login belongs to.",
    preReqUrl: "https://www.gov.uk/paye-online",
  },
];

export default function DdSettings() {
  const [flags, setFlags] = useState<DdFlags>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dd-flags").then((r) => r.json()).then(setFlags).finally(() => setLoading(false));
  }, []);

  async function toggle(kind: TaxKind, enabled: boolean) {
    setFlags((f) => ({ ...f, [kind]: enabled }));
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
          <div key={r.kind} className={`border rounded-2xl p-5 transition-colors ${on ? "border-primary/30 bg-primary/5" : "border-white/8 bg-surface"}`}>
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-foreground">{r.label}</p>
                  {on && (
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                      🔒 On
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted/70 leading-snug">{r.helpText}</p>
              </div>
              <button
                onClick={() => toggle(r.kind, !on)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  on ? "bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25"
                     : "bg-white/5 text-muted border border-white/15 hover:bg-white/10"
                }`}
              >
                {on ? "DD set up ✓" : "Mark as set up"}
              </button>
            </div>

            {/* Pre-requirement (CT / PAYE — accountant handles these) */}
            {r.preReq && !on && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mt-3 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">⚠ Heads-up</p>
                <p className="text-[11px] text-muted/80 leading-snug">{r.preReq}</p>
                {r.preReqUrl && (
                  <a href={r.preReqUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline mt-2 inline-block">
                    Add {r.label} to your account ↗
                  </a>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-2">
              <a
                href={r.setupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
              >
                {on ? "Manage DD ↗" : "Set up DD on gov.uk ↗"}
              </a>
            </div>
          </div>
        );
      })}

      <div className="bg-surface border border-white/8 rounded-2xl p-4 mt-2">
        <p className="text-[10px] uppercase tracking-widest text-muted/60 font-bold mb-2">
          Already verified for you
        </p>
        <p className="text-[11px] text-muted/70 leading-snug">
          I checked your HMRC business tax account on 24 May 2026:
          <br />· <strong>VAT:</strong> Direct Debit Instruction in place ✓
          <br />· <strong>Self Assessment:</strong> No active DD or Budget Payment Plan — pay manually or set up per bill
          <br />· <strong>Corp Tax + PAYE:</strong> Not on your HMRC account (accountant manages via agent)
        </p>
      </div>
    </div>
  );
}
