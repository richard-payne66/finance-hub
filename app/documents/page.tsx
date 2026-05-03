export default function DocumentsPage() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted/60">Documents</p>
        <h1 className="text-xl font-black tracking-tight">Filed paperwork</h1>
      </header>
      <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
        <p className="text-[10px] text-muted uppercase tracking-widest">Phase 5 — uploads via Supabase Storage</p>
      </div>
    </main>
  );
}
