import Link from "next/link";
import type { DigestData } from "@/app/api/digest/route";

export const dynamic = "force-dynamic";

async function fetchDigest(monthsBack: number): Promise<DigestData | null> {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/digest?monthsBack=${monthsBack}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

const GBP = (n: number) => `£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

export default async function DigestPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const params = await searchParams;
  const monthsBack = Math.max(0, parseInt(params.m ?? "1")); // default to last month
  const data = await fetchDigest(monthsBack);

  if (!data) {
    return (
      <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
        <p className="text-sm text-muted">Couldn&apos;t generate digest. Connect FreeAgent first.</p>
        <Link href="/" className="text-xs text-primary underline mt-3 inline-block">← Home</Link>
      </main>
    );
  }

  const allGood = data.things_to_do.length === 0;

  return (
    <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
      <header className="mb-8">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">
          ← Home
        </Link>
        <h1 className="text-3xl font-black tracking-tight text-foreground mt-2">
          {data.period.label}
        </h1>
        <p className="text-xs text-muted/60 mt-1">Monthly digest · {new Date(data.generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long" })}</p>
      </header>

      {/* The one-liner */}
      <section className="bg-surface border border-white/8 rounded-2xl p-6 sm:p-8 mb-6">
        <p className={`text-2xl sm:text-3xl font-bold leading-snug ${data.net >= 0 ? "text-primary" : "text-amber-300"}`}>
          {data.one_liner}
        </p>
      </section>

      {/* Headline numbers */}
      <section className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Money in" value={GBP(data.money_in)} color="emerald" />
        <Stat label="Money out" value={GBP(data.money_out)} color="muted" />
        <Stat label="Net" value={`${data.net >= 0 ? "+" : "−"}${GBP(data.net)}`} color={data.net >= 0 ? "emerald" : "amber"} />
      </section>

      {/* What needs you */}
      <section className="bg-surface border border-white/8 rounded-2xl p-6 mb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted/60 font-bold mb-3">
          {allGood ? "Nothing needs you 🎉" : "Things to do"}
        </p>
        {allGood ? (
          <p className="text-sm text-muted/80">Your accountant doesn&apos;t need anything from you. Have a great week.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.things_to_do.map((t, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-amber-400 shrink-0">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What went well */}
      {data.things_going_well.length > 0 && (
        <section className="bg-surface border border-primary/20 rounded-2xl p-6 mb-6">
          <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-3">
            What went well
          </p>
          <ul className="flex flex-col gap-2">
            {data.things_going_well.map((t, i) => (
              <li key={i} className="text-sm text-muted/80 flex items-start gap-2">
                <span className="text-primary shrink-0">✓</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Activity quick stats */}
      <section className="bg-surface border border-white/8 rounded-2xl p-6 mb-6">
        <p className="text-[10px] uppercase tracking-widest text-muted/60 font-bold mb-3">
          Behind the scenes
        </p>
        <ul className="text-xs text-muted/70 space-y-2">
          <li>{data.txn_count} bank transaction{data.txn_count !== 1 ? "s" : ""} this period</li>
          <li>{data.auto_categorised} categorised by the AI bookkeeper</li>
          <li>{data.reviewed_personal} flagged as personal (not added to books)</li>
        </ul>
      </section>

      {/* Period navigation */}
      <nav className="flex justify-between items-center text-xs text-muted/50">
        <Link href={`/digest?m=${monthsBack + 1}`} className="hover:text-foreground transition-colors">
          ← {(() => { const d = new Date(); d.setMonth(d.getMonth() - monthsBack - 1); return d.toLocaleString("en-GB", { month: "long" }); })()}
        </Link>
        {monthsBack > 0 && (
          <Link href={`/digest?m=${monthsBack - 1}`} className="hover:text-foreground transition-colors">
            {(() => { const d = new Date(); d.setMonth(d.getMonth() - monthsBack + 1); return d.toLocaleString("en-GB", { month: "long" }); })()} →
          </Link>
        )}
      </nav>

      <p className="text-[9px] text-muted/30 mt-12 text-center">
        Generated by Finance Hub · sent on the first of each month (once email send is wired)
      </p>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: "emerald" | "amber" | "muted" }) {
  const cls = color === "emerald" ? "text-primary"
            : color === "amber"   ? "text-amber-300"
            :                       "text-foreground";
  return (
    <div className="bg-surface border border-white/8 rounded-xl p-4 text-center">
      <p className="text-[9px] text-muted/60 uppercase tracking-widest font-bold">{label}</p>
      <p className={`text-xl font-black mt-1 ${cls}`}>{value}</p>
    </div>
  );
}
