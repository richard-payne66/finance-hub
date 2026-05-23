import Link from "next/link";
import BacklogSection from "./components/BacklogSection";
import HMRCPanel from "./components/HMRCPanel";
import DataHealthPanel from "./components/DataHealthPanel";
import MonzoPotsPanel from "./components/MonzoPotsPanel";
import ForecastPanel from "./components/ForecastPanel";
import ConfidenceCard from "./components/ConfidenceCard";
import AutoCategoriseCard from "./components/AutoCategoriseCard";
import AnomaliesCard from "./components/AnomaliesCard";
import CanIExpenseWidget from "./components/CanIExpenseWidget";
import DividendCard from "./components/DividendCard";

export default function Home() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">FINANCE HUB</h1>
          <p className="text-xs text-muted/70 mt-1 max-w-md leading-relaxed">
            Your safety net. So you don&apos;t have to <em>hope</em> your accountant got it
            right — see for yourself everything is filed, paid, and on track.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono shrink-0">v0.7.0</span>
          <Link href="/digest" className="text-[10px] text-muted/50 hover:text-foreground transition-colors uppercase tracking-widest font-bold">
            Monthly digest →
          </Link>
        </div>
      </header>

      {/* HERO: the forecast */}
      <div className="mb-4">
        <ForecastPanel />
      </div>

      {/* Confidence + quick capture */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <ConfidenceCard />
        </div>
        <Link
          href="/capture"
          className="bg-surface border border-white/8 rounded-2xl p-6 hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center text-center gap-2 h-full min-h-[140px]"
        >
          <span className="text-4xl">📷</span>
          <span className="text-sm font-bold uppercase tracking-widest text-foreground">
            Capture Receipt
          </span>
          <span className="text-[10px] text-muted/50">Tap to snap &amp; log</span>
        </Link>
      </div>

      {/* Pay yourself + Ask anything */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <DividendCard />
        <CanIExpenseWidget />
      </div>

      {/* Anomalies — only renders if relevant */}
      <div className="mb-4">
        <AnomaliesCard />
      </div>

      {/* Auto-categorisation activity */}
      <div className="mb-4">
        <AutoCategoriseCard />
      </div>

      {/* Details — collapsed by default */}
      <details className="mb-4 group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-5 py-3 bg-surface border border-white/8 rounded-2xl hover:border-white/15 transition-colors">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Detailed breakdown
          </span>
          <span className="text-[10px] text-muted/40 font-mono group-open:hidden">Show ▾</span>
          <span className="text-[10px] text-muted/40 font-mono hidden group-open:inline">Hide ▴</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <HMRCPanel />
          <MonzoPotsPanel />
          <DataHealthPanel />
        </div>
      </details>

      <BacklogSection />
    </main>
  );
}
