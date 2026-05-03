export default function CapturePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted/60 mb-2">Capture</p>
      <h1 className="text-3xl font-black tracking-tight mb-1">Snap a receipt</h1>
      <p className="text-xs text-muted/60 mb-10">Phase 3 — camera + upload coming soon</p>
      <div className="w-full max-w-sm flex flex-col gap-3">
        <button disabled className="w-full bg-primary/20 border border-primary/40 text-primary/60 rounded-2xl py-8 text-sm font-bold uppercase tracking-widest cursor-not-allowed">
          📷 Take Photo
        </button>
        <button disabled className="w-full border border-white/10 text-muted/50 rounded-2xl py-8 text-sm font-bold uppercase tracking-widest cursor-not-allowed">
          Upload File
        </button>
      </div>
    </main>
  );
}
