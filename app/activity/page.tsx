import Link from "next/link";
import ActivityView from "./ActivityView";

export const dynamic = "force-dynamic";

export default function ActivityPage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">
          ← Home
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-foreground mt-2">
          What I filed for you
        </h1>
        <p className="text-xs text-muted/60 mt-1 max-w-lg leading-relaxed">
          Everything the AI bookkeeper booked to FreeAgent on its own, newest first.
          If anything&apos;s wrong, change the category or mark it personal — it&apos;ll fix
          FreeAgent and learn from the correction.
        </p>
      </header>
      <ActivityView />
    </main>
  );
}
