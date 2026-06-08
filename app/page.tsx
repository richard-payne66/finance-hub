import Link from "next/link";
import ButlerBriefing from "./components/ButlerBriefing";
import ForecastPanel from "./components/ForecastPanel";
import DividendTracker from "./components/DividendTracker";
import AllowancesCard from "./components/AllowancesCard";
import HMRCLinksCard from "./components/HMRCLinksCard";
import AccountantInbox from "./components/AccountantInbox";
import ReviewQueue from "./review/ReviewQueue";

export default function Home() {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">FINANCE HUB</h1>
          <p className="text-xs text-muted/70 mt-1 max-w-md leading-relaxed">
            Your safety net. Anything that needs you sits up top — everything else
            I&apos;m already handling.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono shrink-0">v0.11.0</span>
          <Link href="/year" className="text-[10px] text-primary hover:text-primary/70 transition-colors uppercase tracking-widest font-bold">
            Year by year →
          </Link>
          <Link href="/how-it-works" className="text-[10px] text-primary hover:text-primary/70 transition-colors uppercase tracking-widest font-bold">
            What I pay →
          </Link>
          <Link href="/digest" className="text-[10px] text-primary hover:text-primary/70 transition-colors uppercase tracking-widest font-bold">
            Monthly digest →
          </Link>
          <Link href="/receipts" className="text-[10px] text-muted/50 hover:text-foreground transition-colors uppercase tracking-widest font-bold">
            Receipts →
          </Link>
        </div>
      </header>

      {/* TOP: dividends taken this year + room before higher-rate tax */}
      <DividendTracker />

      {/* The butler's safety-net line: just what needs you (if anything). */}
      <ButlerBriefing />

      {/* Bookkeeping that needs a decision — surfaced here, hidden when empty. */}
      <div id="review-queue">
        <ReviewQueue hideWhenEmpty heading="📒 Bookkeeping — needs a quick look" />
      </div>

      {/* Anything the accountant has asked Richard to do (AI-extracted from Gmail) */}
      <AccountantInbox />

      {/* Tax-free extras: trivial benefits + mileage trackers (moved higher) */}
      <AllowancesCard />

      {/* Upcoming bills (moved lower) */}
      <div className="mb-6">
        <ForecastPanel />
      </div>

      {/* Saved HMRC + Companies House links — pay / view without hunting around */}
      <HMRCLinksCard />
    </main>
  );
}
