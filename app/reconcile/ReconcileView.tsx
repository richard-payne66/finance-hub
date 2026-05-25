"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReconcileReport } from "@/app/api/reconcile/route";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: 730, label: "2 years" },
];

export default function ReconcileView() {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowDays, setWindowDays] = useState(90);

  async function run(days = windowDays) {
    setLoading(true);
    try {
      const r = await fetch(`/api/reconcile?days=${days}`);
      const j = await r.json();
      setReport(j);
      setWindowDays(days);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Window picker + run button */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1 bg-surface border border-white/8 rounded-full p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => run(w.days)}
              className={`px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold transition-colors ${
                windowDays === w.days
                  ? "bg-primary text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-muted/60 animate-pulse">Crunching…</span>}
      </div>

      {!report && !loading && (
        <div className="bg-surface border border-white/8 rounded-2xl p-8 text-center">
          <p className="text-sm text-muted/70 mb-4">
            Pick a window above. This cross-checks every receipt in the period against every FreeAgent bank transaction and reports anything that doesn&apos;t line up.
          </p>
          <p className="text-[11px] text-muted/40">
            A year typically takes 10-20 seconds.
          </p>
        </div>
      )}

      {report && (
        <>
          {!report.fa_connected && (
            <Banner kind="warn" text={<>FreeAgent not connected. <a href="/api/freeagent/connect" className="underline">Connect FA →</a></>} />
          )}

          {/* Headline */}
          <Headline report={report} />

          {/* Receipts without matching bank txn */}
          <Section
            title="📎 Receipts with no matching bank transaction"
            count={report.totals.orphan_receipts}
            subtitle="Receipt was logged but no bank line matches — could be paid on personal card, cash, or matched outside ±7-day window."
            empty="✓ Every receipt is paired with a bank transaction."
          >
            {report.samples.orphan_receipts.map((r) => (
              <Row key={r.receipt_id}
                   date={r.date}
                   amount={r.amount}
                   description={r.supplier ?? "(no supplier)"}
                   ctaLabel="View in receipts"
                   ctaHref="/receipts"
              />
            ))}
            {report.totals.orphan_receipts > report.samples.orphan_receipts.length && (
              <p className="text-[10px] text-muted/40 pt-2">
                + {report.totals.orphan_receipts - report.samples.orphan_receipts.length} more
              </p>
            )}
          </Section>

          {/* Bank txns with no receipt */}
          <Section
            title="🧾 Bank transactions without a receipt"
            count={report.totals.fa_without_receipt}
            subtitle="Outgoings in FA that have no matching receipt on file. Forward the email receipts or snap photos to bring this down."
            empty="✓ Every outgoing has a receipt attached."
          >
            {report.samples.fa_without_receipt.map((f) => (
              <Row key={f.fa_url}
                   date={f.date}
                   amount={f.amount}
                   description={f.description}
                   ctaLabel={null}
              />
            ))}
            {report.totals.fa_without_receipt > report.samples.fa_without_receipt.length && (
              <p className="text-[10px] text-muted/40 pt-2">
                + {report.totals.fa_without_receipt - report.samples.fa_without_receipt.length} more
              </p>
            )}
          </Section>

          {/* Matched sample */}
          {report.samples.matched.length > 0 && (
            <Section
              title={`✓ Sample matched (${report.totals.fa_with_receipt} total)`}
              count={null}
              subtitle="Receipts paired with their bank transaction — these are filed correctly."
              empty=""
              muted
            >
              {report.samples.matched.map((m, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 border-t border-white/5 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-xs text-muted/70 truncate">
                      {m.receipt_supplier ?? "(no supplier)"} · <span className="text-muted/50">{m.fa_desc}</span>
                    </p>
                    <p className="text-[10px] text-muted/40 mt-0.5">{fmtDate(m.date)}</p>
                  </div>
                  <p className="text-xs font-mono font-bold text-muted/80">{GBP.format(m.amount)}</p>
                </div>
              ))}
            </Section>
          )}

          <p className="text-[10px] text-muted/30 mt-8 text-center">
            Last run {new Date(report.generated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · window: {report.window_days} days
          </p>
        </>
      )}
    </div>
  );
}

function Banner({ kind, text }: { kind: "warn"; text: React.ReactNode }) {
  const cls = kind === "warn" ? "bg-amber-500/5 border-amber-500/30 text-amber-300" : "";
  return <div className={`border rounded-xl p-3 mb-4 text-xs ${cls}`}>{text}</div>;
}

function Headline({ report }: { report: ReconcileReport }) {
  const total = report.totals.receipts;
  const matchedPct = total > 0 ? Math.round((report.totals.receipts_matched_to_bank / total) * 100) : 100;
  const colour = matchedPct >= 95 ? "text-primary" : matchedPct >= 70 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="bg-gradient-to-br from-surface to-surface/50 border border-white/8 rounded-2xl p-6 mb-6">
      <div className="flex items-baseline gap-3 mb-2">
        <p className={`text-5xl font-black tracking-tight ${colour}`}>{matchedPct}%</p>
        <p className="text-sm text-muted/70">of receipts paired with a bank transaction</p>
      </div>
      <p className="text-xs text-muted/60 leading-relaxed">
        {report.totals.receipts_matched_to_bank} of {report.totals.receipts} receipts matched.
        {" "}{report.totals.fa_without_receipt} bank outgoings still missing a receipt.
      </p>
      <div className="grid grid-cols-3 gap-3 mt-5 text-center">
        <Stat label="FreeAgent" value={report.totals.fa_txns} />
        <Stat label="Receipts" value={report.totals.receipts} />
        <Stat label="To fix" value={report.totals.orphan_receipts + report.totals.fa_without_receipt} accent="amber" />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "amber" }) {
  const cls = accent === "amber" ? "text-amber-400" : "text-foreground";
  return (
    <div className="bg-white/3 rounded-lg p-3">
      <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">{label}</p>
      <p className={`text-xl font-black mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function Section({
  title, count, subtitle, empty, children, muted,
}: {
  title: string;
  count: number | null;
  subtitle: string;
  empty: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  const isEmpty = count === 0;
  return (
    <section className={`mb-5 rounded-2xl border p-5 ${
      muted ? "bg-surface border-white/5" :
      isEmpty ? "bg-surface border-primary/20" :
                "bg-surface border-white/8"
    }`}>
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">{title}</p>
        {count !== null && <p className="text-[10px] text-muted/40 font-mono">{count}</p>}
      </div>
      <p className="text-[11px] text-muted/60 mb-3 leading-snug">{isEmpty ? empty : subtitle}</p>
      {!isEmpty && <div>{children}</div>}
    </section>
  );
}

function Row({ date, amount, description, ctaLabel, ctaHref }: {
  date: string | null;
  amount: number | null;
  description: string;
  ctaLabel?: string | null;
  ctaHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-white/5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground/90 truncate">{description}</p>
        <p className="text-[10px] text-muted/40 mt-0.5">{date ? fmtDate(date) : "no date"}</p>
      </div>
      {amount !== null && (
        <p className={`text-xs font-mono font-bold shrink-0 ${amount < 0 ? "text-foreground" : "text-primary"}`}>
          {GBP.format(amount)}
        </p>
      )}
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="text-[10px] uppercase tracking-widest font-bold text-primary/70 hover:text-primary shrink-0">
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
