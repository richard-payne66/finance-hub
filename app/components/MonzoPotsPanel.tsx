"use client";

import { useEffect, useState } from "react";
import type { PotsSummary } from "@/app/api/monzo/pots/route";
import type { DashboardStats } from "@/app/api/dashboard-stats/route";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const GBP_PRECISE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

// Heuristic: which pots are "tax savings"?
const TAX_POT_KEYWORDS = /vat|tax|hmrc|corp(oration)?|paye|sa\b/i;

export default function MonzoPotsPanel() {
  const [pots, setPots] = useState<PotsSummary | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/monzo/pots").then((r) => r.json()),
      fetch("/api/dashboard-stats").then((r) => r.json()),
    ]).then(([p, s]) => { setPots(p); setStats(s); }).catch(() => {});
  }, []);

  if (!pots) return null;

  // Not connected — show connect CTA
  if (!pots.connected) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-6">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-2">
          Tax saved
        </p>
        <p className="text-sm text-muted/60 mb-4">
          Connect Monzo to see live pot balances and how covered your tax bills are.
        </p>
        <a
          href="/api/monzo/connect"
          className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity"
        >
          Connect Monzo
        </a>
      </div>
    );
  }

  // Connected but waiting for SCA approval in the Monzo app
  if (pots.sca_required) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-6">
        <p className="text-[9px] text-amber-400 uppercase tracking-widest font-bold mb-2">
          📱 Action required
        </p>
        <p className="text-sm text-foreground mb-3">
          Open the <strong>Monzo app</strong> on your phone, tap the notification, and approve <strong>Finance Hub</strong>.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
        >
          I&apos;ve approved — refresh
        </button>
        <p className="text-[10px] text-muted/40 mt-3">
          Monzo requires this re-approval every 90 days for security.
        </p>
      </div>
    );
  }

  // Collect all pots across accounts, classify as tax-related vs other
  const allPots = pots.accounts.flatMap((a) => a.pots);
  const taxPots = allPots.filter((p) => TAX_POT_KEYWORDS.test(p.name));
  const otherPots = allPots.filter((p) => !TAX_POT_KEYWORDS.test(p.name));

  const taxSaved = taxPots.reduce((s, p) => s + p.balance, 0);
  const owedNow = stats?.owed_now ?? 0;
  const coverage = owedNow > 0 ? Math.min(taxSaved / owedNow, 1) : 1;
  const shortfall = owedNow - taxSaved;

  return (
    <div className="bg-surface border border-white/8 rounded-2xl p-6">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
          Tax saved (Monzo pots)
        </p>
        <p className="text-[9px] text-muted/40 font-mono">live</p>
      </div>

      <p className={`text-4xl font-black tracking-tight ${
        coverage >= 1 ? "text-emerald-400" : coverage >= 0.5 ? "text-amber-400" : "text-red-400"
      }`}>
        {GBP.format(taxSaved)}
      </p>
      <p className="text-xs text-muted/60 mt-1">
        across {taxPots.length} pot{taxPots.length !== 1 ? "s" : ""}
        {owedNow > 0 && (
          <span> · {Math.round(coverage * 100)}% of {GBP.format(owedNow)} owed</span>
        )}
      </p>

      {/* Progress bar */}
      {owedNow > 0 && (
        <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              coverage >= 1 ? "bg-emerald-500" : coverage >= 0.5 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${coverage * 100}%` }}
          />
        </div>
      )}

      {/* Shortfall callout */}
      {shortfall > 0 && (
        <p className="text-[10px] text-amber-400 mt-2">
          You&apos;re {GBP.format(shortfall)} short for the next tax bill — consider moving some from the main account.
        </p>
      )}
      {shortfall < 0 && owedNow > 0 && (
        <p className="text-[10px] text-emerald-400 mt-2">
          Fully covered — surplus of {GBP.format(-shortfall)}.
        </p>
      )}

      {/* Per-pot breakdown */}
      <div className="mt-5 flex flex-col gap-2">
        {taxPots.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-t border-white/5 first:border-t-0">
            <p className="text-xs text-foreground/80 truncate">{p.name}</p>
            <p className="text-xs font-bold font-mono">{GBP_PRECISE.format(p.balance)}</p>
          </div>
        ))}
      </div>

      {/* Other pots, dimmed */}
      {otherPots.length > 0 && (
        <details className="mt-4 pt-3 border-t border-white/5">
          <summary className="text-[9px] text-muted/50 uppercase tracking-widest font-bold cursor-pointer hover:text-muted">
            Other pots ({otherPots.length}) · {GBP.format(otherPots.reduce((s, p) => s + p.balance, 0))}
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 opacity-70">
            {otherPots.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-1">
                <p className="text-xs text-muted truncate">{p.name}</p>
                <p className="text-xs font-mono text-muted/70">{GBP_PRECISE.format(p.balance)}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-[9px] text-muted/30 mt-4">
        Direct from Monzo · updated {new Date(pots.updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
