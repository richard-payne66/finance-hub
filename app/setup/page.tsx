import BankStatementsChecklist from "@/app/components/BankStatementsChecklist";

export default function SetupPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">SETUP</h1>
          <p className="text-xs text-muted/70 mt-1">Onboarding checklist and filed documents</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">Phase 5</span>
      </header>

      <section className="mb-8">
        <BankStatementsChecklist />
      </section>

      <section className="mb-8">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">Onboarding Checklist</p>
        <div className="border border-dashed border-white/8 rounded-xl p-10 text-center">
          <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
            Step-by-step onboarding with Claude explainer — Phase 5
          </p>
        </div>
      </section>

      <section>
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">Documents</p>
        <div className="border border-dashed border-white/8 rounded-xl p-10 text-center">
          <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
            CT600s, P60s, statutory accounts, VAT returns — Phase 5
          </p>
        </div>
      </section>
    </main>
  );
}
