import Link from "next/link";
import DdSettings from "./DdSettings";

export const dynamic = "force-dynamic";

export default function DdSettingsPage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-xl mx-auto">
      <header className="mb-6">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">
          ← Home
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-foreground mt-2">
          Direct debit setup
        </h1>
        <p className="text-xs text-muted/60 mt-1 leading-relaxed">
          Tick the taxes you&apos;ve set up to be paid by HMRC direct debit.
          The forecast uses this to show 🔒 next to upcoming bills you don&apos;t need to remember to pay.
        </p>
      </header>
      <DdSettings />
    </main>
  );
}
