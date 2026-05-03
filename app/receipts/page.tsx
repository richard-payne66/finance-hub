import { db } from "@/app/lib/db";
import type { Receipt } from "@/app/lib/types";
import CaptureWidget from "@/app/components/CaptureWidget";

const SIGNED_URL_TTL = 3600;

async function getReceipts(): Promise<Array<Receipt & { thumbUrl: string | null }>> {
  const { data, error } = await db()
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch receipts:", error.message);
    return [];
  }

  const receipts = (data ?? []) as Receipt[];

  const keys = receipts
    .map((r) => r.receipt_image_url)
    .filter((k): k is string => !!k && !k.startsWith("http"));

  let signedMap: Record<string, string> = {};
  if (keys.length > 0) {
    const { data: signed } = await db()
      .storage.from("receipts")
      .createSignedUrls(keys, SIGNED_URL_TTL);
    signedMap = Object.fromEntries(
      (signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
    );
  }

  return receipts.map((r) => ({
    ...r,
    thumbUrl:
      r.receipt_image_url && r.receipt_image_url.startsWith("http")
        ? r.receipt_image_url
        : (signedMap[r.receipt_image_url ?? ""] ?? null),
  }));
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    rejected: "bg-red-500/15 text-red-400 border-red-500/30",
    failed: "bg-red-900/30 text-red-300 border-red-700/30",
  };
  return map[status] ?? "bg-white/5 text-muted border-white/10";
}

function fmtAmount(val: number | null, currency: string | null) {
  if (val == null) return "—";
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "£";
  return `${sym}${val.toFixed(2)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function ReceiptsPage() {
  const receipts = await getReceipts();
  const pending = receipts.filter((r) => r.status === "pending");
  const rest = receipts.filter((r) => r.status !== "pending");

  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">RECEIPTS</h1>
          <p className="text-xs text-muted/70 mt-1">Capture and review — push approved receipts to FreeAgent</p>
        </div>
        <span className="text-[9px] text-muted/40 uppercase tracking-widest font-mono">Phase 3</span>
      </header>

      <CaptureWidget />

      {receipts.length === 0 && (
        <div className="border border-dashed border-white/8 rounded-xl p-12 text-center">
          <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
            No receipts yet — capture one above
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
            Needs review ({pending.length})
          </p>
          <div className="flex flex-col gap-3">
            {pending.map((r) => <ReceiptCard key={r.id} receipt={r} />)}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
            History
          </p>
          <div className="flex flex-col gap-3">
            {rest.map((r) => <ReceiptCard key={r.id} receipt={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}

function ReceiptCard({ receipt: r }: { receipt: Receipt & { thumbUrl: string | null } }) {
  const lowConf = (r.model_confidence ?? 1) < 0.75;
  const hasDupeNote =
    r.notes?.toLowerCase().includes("duplicate") ||
    r.notes?.toLowerCase().includes("dupe");

  return (
    <article className="bg-surface border border-white/8 rounded-xl p-4 sm:p-5 flex gap-4 items-start hover:border-white/15 transition-all">
      <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-light border border-white/8 flex items-center justify-center">
        {r.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumbUrl} alt={r.supplier ?? "Receipt"} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl">🧾</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-sm truncate">
            {r.supplier ?? <span className="text-muted/40 italic font-normal">Unknown supplier</span>}
          </p>
          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusPill(r.status)}`}>
            {r.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted/60 mb-2">
          <span>{fmtDate(r.supply_date)}</span>
          {r.vat_rate && <><span className="text-white/10">·</span><span>VAT {r.vat_rate}</span></>}
          {r.category_name && <><span className="text-white/10">·</span><span className="truncate">{r.category_name}</span></>}
        </div>

        <div className="flex items-center gap-2 text-sm font-bold">
          <span>{fmtAmount(r.gross_total, r.currency)}</span>
          {r.net_total != null && (
            <span className="text-[11px] text-muted/40 font-normal">
              net {fmtAmount(r.net_total, r.currency)} · VAT {fmtAmount(r.vat_total, r.currency)}
            </span>
          )}
        </div>

        {lowConf && (
          <p className="mt-1.5 text-[10px] text-yellow-400 font-bold uppercase tracking-widest">
            ⚠ Low confidence — check fields
          </p>
        )}
        {hasDupeNote && (
          <p className="mt-1 text-[10px] text-orange-400 font-bold uppercase tracking-widest">
            ⚠ Possible duplicate
          </p>
        )}

        {r.status === "pending" && (
          <div className="flex gap-2 mt-3">
            <button disabled title="FreeAgent push — Phase 4"
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-default">
              Approve
            </button>
            <button disabled title="Phase 4"
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/10 text-muted disabled:opacity-40 disabled:cursor-default">
              Reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
