import Link from "next/link";

const TILES = [
  { label: "Cash vs Tax", note: "Phase 4" },
  { label: "Next Deadline", note: "Phase 4" },
  { label: "YTD P&L", note: "Phase 4" },
  { label: "Outstanding Invoices", note: "Phase 4" },
  { label: "Salary & Dividend", note: "Phase 4" },
  { label: "Receipt Queue", note: "Phase 3" },
];

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/receipts", label: "Receipts" },
  { href: "/capture", label: "Capture" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/setup", label: "Setup" },
  { href: "/documents", label: "Documents" },
];

export default function Home() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-6xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">FINANCE HUB</h1>
          <p className="text-xs text-muted/70 mt-1">Richard Payne LTD — accounts, receipts, deadlines</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">v0.1.0 · scaffold</span>
      </header>

      <nav className="flex gap-1 flex-wrap mb-8">
        {NAV.map((n) => (
          <Link
            key={n.label}
            href={n.href}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border border-white/10 text-muted hover:border-white/20 hover:text-foreground transition-all"
          >
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TILES.map((t) => (
          <div key={t.label} className="bg-surface border border-white/8 rounded-xl p-5 hover:border-white/15 transition-all">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50 mb-2">{t.label}</p>
            <p className="text-sm text-foreground/40">— {t.note}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
