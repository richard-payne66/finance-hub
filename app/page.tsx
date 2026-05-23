import Link from "next/link";
import BacklogSection from "./components/BacklogSection";
import HMRCPanel from "./components/HMRCPanel";
import StatsTiles from "./components/StatsTiles";
import DataHealthPanel from "./components/DataHealthPanel";
import MonzoPotsPanel from "./components/MonzoPotsPanel";

export default function Home() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">FINANCE HUB</h1>
          <p className="text-xs text-muted/70 mt-1 max-w-md leading-relaxed">
            Your safety net. So you don&apos;t have to <em>hope</em> your accountant got it
            right — see for yourself everything is filed, paid, and on track.
          </p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono shrink-0">v0.5.0</span>
      </header>

      {/* Headline: what you owe HMRC + quick capture */}
      <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HMRCPanel />
        </div>
        <Link
          href="/capture"
          className="bg-surface border border-white/8 rounded-2xl p-6 hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center text-center gap-2"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-bold uppercase tracking-widest text-foreground">
            Capture Receipt
          </span>
          <span className="text-[10px] text-muted/50">
            Tap to snap &amp; log
          </span>
        </Link>
      </div>

      {/* Live stat tiles */}
      <div className="mb-4">
        <StatsTiles />
      </div>

      {/* Tax saved in Monzo pots — live coverage vs what's owed */}
      <div className="mb-4">
        <MonzoPotsPanel />
      </div>

      {/* Data accuracy / freshness — answers "do I trust these numbers?" */}
      <div className="mb-8">
        <DataHealthPanel />
      </div>

      <BacklogSection />
    </main>
  );
}
