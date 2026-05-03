export default function DeadlinesPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">DEADLINES</h1>
          <p className="text-xs text-muted/70 mt-1">Tax calendar — PAYE, VAT, Corporation Tax, Self Assessment</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">Phase 4</span>
      </header>

      <div className="border border-dashed border-white/8 rounded-xl p-12 text-center">
        <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
          Pulled from FreeAgent + computed rules — coming in Phase 4
        </p>
      </div>
    </main>
  );
}
