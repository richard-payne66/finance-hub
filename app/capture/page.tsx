import CaptureWidget from "@/app/components/CaptureWidget";
import { db } from "@/app/lib/db";
import type { Receipt } from "@/app/lib/types";
import Link from "next/link";

// Minimal mobile-first capture view. Just the camera + note field +
// last few receipts as a confirmation strip.
export const revalidate = 30;

async function recentReceipts(): Promise<Receipt[]> {
  const { data } = await db()
    .from("receipts")
    .select("id, supplier, gross_total, currency, created_at, status")
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as Receipt[];
}

function fmt(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${sym}${amount.toFixed(2)}`;
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function CapturePage() {
  const recents = await recentReceipts();

  return (
    <main className="min-h-screen px-4 py-6 max-w-md mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-black tracking-tight text-foreground">CAPTURE</h1>
        <Link
          href="/"
          className="text-[9px] font-bold uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors"
        >
          Home
        </Link>
      </header>

      <CaptureWidget compact />

      {recents.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] text-muted uppercase tracking-widest font-bold">
              Last captured
            </p>
            <Link
              href="/receipts"
              className="text-[9px] font-bold uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors"
            >
              All ↗
            </Link>
          </div>
          <div className="bg-surface border border-white/8 rounded-xl divide-y divide-white/5">
            {recents.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    {r.supplier ?? <span className="text-muted/40 italic">Processing…</span>}
                  </p>
                  <p className="text-[10px] text-muted/50 mt-0.5">
                    {ago(r.created_at)}
                  </p>
                </div>
                <p className="text-sm font-bold font-mono shrink-0">
                  {fmt(r.gross_total, r.currency)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-[9px] text-muted/30 mt-8 text-center leading-relaxed">
        📸 Camera works on mobile<br />
        🔁 Forward emails to receipts@richard-payne.com (coming soon)
      </p>
    </main>
  );
}
