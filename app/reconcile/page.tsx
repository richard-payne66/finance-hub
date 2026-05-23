import Link from "next/link";
import ReconcileView from "./ReconcileView";

export const dynamic = "force-dynamic";

export default function ReconcilePage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">
          ← Home
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-foreground mt-2">
          Reconciliation
        </h1>
        <p className="text-xs text-muted/60 mt-1 max-w-lg leading-relaxed">
          Cross-check every transaction across Monzo, FreeAgent, and your receipt emails.
          Surfaces what doesn&apos;t line up.
        </p>
      </header>
      <ReconcileView />
    </main>
  );
}
