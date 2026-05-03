export default function DocumentsPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">DOCUMENTS</h1>
          <p className="text-xs text-muted/70 mt-1">Filed paperwork — CT600s, P60s, statutory accounts, VAT returns</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">Phase 5</span>
      </header>

      <div className="border border-dashed border-white/8 rounded-xl p-12 text-center">
        <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
          Uploads via Supabase Storage — coming in Phase 5
        </p>
      </div>
    </main>
  );
}
