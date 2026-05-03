export default function SetupPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-3xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">SETUP</h1>
          <p className="text-xs text-muted/70 mt-1">Onboarding checklist — tick items as you go, they save automatically</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">Phase 5</span>
      </header>

      <div className="border border-dashed border-white/8 rounded-xl p-12 text-center">
        <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
          Checklist + Claude explainer — coming in Phase 5
        </p>
      </div>
    </main>
  );
}
