import Link from "next/link";
import ReviewQueue from "./ReviewQueue";

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">
          ← Home
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-foreground mt-2">
          Review queue
        </h1>
        <p className="text-xs text-muted/60 mt-1">
          Transactions the AI wasn&apos;t confident enough to file on its own. Approve, edit, or mark as personal.
        </p>
      </header>
      <ReviewQueue />
    </main>
  );
}
