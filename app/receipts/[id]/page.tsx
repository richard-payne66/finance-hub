import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/app/lib/db";
import type { Receipt } from "@/app/lib/types";
import ReceiptEditor from "./ReceiptEditor";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL = 3600;

async function getReceipt(
  id: string
): Promise<(Receipt & { fullImageUrl: string | null }) | null> {
  if (!/^[0-9a-f-]{20,40}$/i.test(id)) return null;
  const { data, error } = await db()
    .from("receipts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Receipt;

  let fullImageUrl: string | null = null;
  if (r.receipt_image_url) {
    if (r.receipt_image_url.startsWith("http")) {
      fullImageUrl = r.receipt_image_url;
    } else {
      const { data: signed } = await db()
        .storage.from("receipts")
        .createSignedUrl(r.receipt_image_url, SIGNED_URL_TTL);
      fullImageUrl = signed?.signedUrl ?? null;
    }
  }
  return { ...r, fullImageUrl };
}

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getReceipt(id);
  if (!r) notFound();

  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/receipts"
        className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors"
      >
        ← All receipts
      </Link>

      <header className="mt-3 mb-5 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          {r.supplier ?? <span className="text-muted/40 italic">Untitled receipt</span>}
        </h1>
        <span
          className={
            "shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border " +
            (r.status === "processing"
              ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
              : r.status === "approved"
              ? "bg-primary/15 text-primary border-primary/30"
              : r.status === "rejected"
              ? "bg-red-500/15 text-red-400 border-red-500/30"
              : r.status === "extraction_failed"
              ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
              : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30")
          }
        >
          {r.status}
        </span>
      </header>

      {r.status === "processing" && (
        <p className="text-[12px] text-blue-300/80 mb-4 leading-relaxed">
          Claude is still reading this receipt. The fields below will fill in within a minute or two — refresh the page to see them.
        </p>
      )}

      {r.status === "extraction_failed" && (
        <div className="mb-4 px-4 py-3 bg-orange-500/8 border border-orange-500/20 rounded-lg">
          <p className="text-[12px] text-orange-300 font-bold mb-1">Extraction failed</p>
          <p className="text-[11px] text-muted/70 leading-relaxed break-words">
            {r.extraction_error ?? "Unknown error"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Image */}
        <div>
          {r.fullImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.fullImageUrl}
              alt={r.supplier ?? "Receipt"}
              className="w-full rounded-xl border border-white/8 bg-surface-light"
            />
          ) : (
            <div className="aspect-[3/4] rounded-xl border border-white/8 bg-surface-light flex items-center justify-center text-4xl text-muted/40">
              🧾
            </div>
          )}
          {r.fullImageUrl && (
            <a
              href={r.fullImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-[10px] uppercase tracking-widest text-muted/60 hover:text-foreground transition-colors"
            >
              Open full size ↗
            </a>
          )}
        </div>

        {/* Editor */}
        <ReceiptEditor receipt={r} />
      </div>
    </main>
  );
}
