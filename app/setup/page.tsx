import Link from "next/link";
import BankStatementsChecklist from "@/app/components/BankStatementsChecklist";
import DocumentChecklist from "@/app/components/DocumentChecklist";
import ShareLink from "@/app/components/ShareLink";
import SmartDocumentUpload from "@/app/components/SmartDocumentUpload";
import UpgradesAll from "@/app/components/UpgradesAll";
import { ACCOUNTANT_GUIDE } from "@/app/lib/accountant-rules";

export default function SetupPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">SETUP</h1>
          <p className="text-xs text-muted/70 mt-1">Documents and records for Richard Payne LTD</p>
        </div>
      </header>

      <div className="flex flex-col gap-10">
        <UpgradesAll />

        {/* ── Bookkeeping guide from accountant ── */}
        <div className="bg-surface border border-white/8 rounded-2xl p-5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80 mb-1">📋 Bookkeeping guide</p>
          <p className="text-xs text-muted/50 mb-4">From Sukh Kooner (AccKent) — how to categorise common transactions in FreeAgent. The review queue pre-selects these automatically.</p>
          <div className="flex flex-col divide-y divide-white/5">
            {ACCOUNTANT_GUIDE.map((item, i) => (
              <div key={i} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-foreground/80 font-medium leading-snug">{item.heading}</p>
                <p className="text-[11px] font-mono text-primary/70 mt-0.5">{item.category}</p>
                {item.notes && (
                  <p className="text-[11px] text-muted/45 mt-0.5 italic">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <SmartDocumentUpload />
        <ShareLink />

        {/* Live Monzo statements — the Google Sheet Monzo exports to */}
        <a
          href="https://docs.google.com/spreadsheets/d/1p_lbpBf3HkAl7F03jvkTGsUMNfZ-K-_66sqBcN34bO8/edit"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-surface border border-white/8 rounded-2xl p-5 hover:border-white/25 transition-colors"
        >
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50 mb-2">
            🏦 Monzo statements (live) ↗
          </p>
          <p className="text-sm text-foreground/85 leading-snug">
            Your Monzo business account transactions, exported live to Google Sheets. Opens in a new tab.
          </p>
        </a>

        <BankStatementsChecklist />
        <DocumentChecklist />
      </div>
    </main>
  );
}
