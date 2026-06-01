import Link from "next/link";
import BookkeepingTabs from "./BookkeepingTabs";

export const dynamic = "force-dynamic";

export default function BookkeepingPage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">
          ← Home
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-foreground mt-2">
          Bookkeeping
        </h1>
        <p className="text-xs text-muted/60 mt-1 max-w-lg leading-relaxed">
          One place for your transactions. <strong className="text-foreground/80">Needs you</strong> is the short
          list only you can decide; <strong className="text-foreground/80">Done for you</strong> is everything I&apos;ve
          already filed; <strong className="text-foreground/80">Cross-check</strong> compares Monzo, FreeAgent and your
          receipt emails to catch anything that doesn&apos;t line up.
        </p>
      </header>
      <BookkeepingTabs />
    </main>
  );
}
