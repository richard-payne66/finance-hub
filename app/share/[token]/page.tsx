import { db } from "@/app/lib/db";
import { notFound } from "next/navigation";
import type { Document } from "@/app/lib/types";

export const dynamic = "force-dynamic";

async function validateToken(token: string): Promise<boolean> {
  const { data } = await db()
    .from("kv")
    .select("value")
    .eq("key", `share_token_${token}`)
    .maybeSingle();

  if (!data) return false;
  try {
    const meta = JSON.parse(data.value);
    return new Date(meta.expires_at) > new Date();
  } catch { return false; }
}

async function getDocuments(): Promise<Document[]> {
  const { data } = await db()
    .from("documents")
    .select("*")
    .order("category")
    .order("year");
  return (data ?? []) as Document[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await validateToken(token);
  if (!valid) notFound();

  const docs = await getDocuments();

  // Group by category
  const groups = docs.reduce<Record<string, Document[]>>((acc, d) => {
    const key = d.category ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  return (
    <main className="min-h-screen px-4 sm:px-8 py-10 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-2xl font-black tracking-tight text-foreground">RICHARD PAYNE LTD</h1>
        <p className="text-xs text-muted/60 mt-1">Shared documents — view and download only</p>
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Secure read-only link
          </span>
        </div>
      </header>

      {docs.length === 0 ? (
        <div className="border border-dashed border-white/8 rounded-xl p-12 text-center">
          <p className="text-[9px] text-muted/50 uppercase tracking-widest font-bold">
            No documents uploaded yet
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(groups).map(([category, items]) => (
            <section key={category}>
              <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-2">
                {category}
              </p>
              <div className="bg-surface border border-white/8 rounded-xl divide-y divide-white/6">
                {items.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground font-medium truncate">{doc.filename}</p>
                      <p className="text-[10px] text-muted/50 mt-0.5">
                        {doc.year && <span>{doc.year} · </span>}
                        Uploaded {fmtDate(doc.uploaded_at)}
                      </p>
                    </div>
                    <a
                      href={`/share/${token}/file/${doc.id}`}
                      className="shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-muted hover:border-white/30 hover:text-foreground transition-all"
                    >
                      Download ↓
                    </a>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-12 text-[9px] text-muted/30 text-center">
        This link expires after 30 days · Richard Payne LTD
      </footer>
    </main>
  );
}
