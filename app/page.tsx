import BacklogSection from "./components/BacklogSection";

const TILES = [
  { label: "Cash vs Tax", note: "Phase 4" },
  { label: "Next Deadline", note: "Phase 4" },
  { label: "YTD P&L", note: "Phase 4" },
  { label: "Outstanding Invoices", note: "Phase 4" },
  { label: "Salary & Dividend", note: "Phase 4" },
  { label: "Receipt Queue", note: "Phase 3" },
];

export default function Home() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-6xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">FINANCE HUB</h1>
          <p className="text-xs text-muted/70 mt-1">Richard Payne LTD — accounts, receipts, deadlines</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">v0.3.0</span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TILES.map((t) => (
          <div
            key={t.label}
            className="bg-surface border border-white/8 rounded-xl p-4 sm:p-5 hover:border-white/15 transition-all"
          >
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50 mb-2">{t.label}</p>
            <p className="text-sm text-foreground/40">— {t.note}</p>
          </div>
        ))}
      </div>

      <BacklogSection />
    </main>
  );
}
