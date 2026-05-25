"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Action buttons for a single receipt card on /receipts. Lives client-side
// so we can show "Approving…", "✓ Approved", error states inline.
export default function ReceiptActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/receipts/${id}/approve`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.reason ?? j.error ?? `HTTP ${res.status}`);
      } else {
        setMsg(j.pushed ? "✓ Approved + pushed to FreeAgent" : j.skipped ?? "✓ Approved");
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!confirm("Mark this receipt as rejected? It'll be hidden from the queue.")) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/receipts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
      }
      setMsg("Rejected");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function repush() {
    if (!confirm("Push this receipt to FreeAgent again? Use this only if you've deleted the FA-side expense or want to refresh it with the latest code.")) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/receipts/${id}/approve?force=true`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setErr(j.reason ?? j.error ?? `HTTP ${res.status}`);
      } else {
        setMsg(j.pushed ? "✓ Re-pushed to FreeAgent" : j.skipped ?? "✓ Done");
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isPending = status === "pending";
  const isApproved = status === "approved";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPending && (
        <>
          <button
            onClick={approve}
            disabled={busy}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            {busy ? "…" : "Approve"}
          </button>
          <button
            onClick={reject}
            disabled={busy}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/10 text-muted hover:border-white/30 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            Reject
          </button>
        </>
      )}
      {isApproved && (
        <button
          onClick={repush}
          disabled={busy}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-muted hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-default"
        >
          {busy ? "…" : "Push again to FA"}
        </button>
      )}
      {msg && (
        <span className="text-[10px] text-primary font-bold uppercase tracking-widest">
          {msg}
        </span>
      )}
      {err && (
        <span className="text-[10px] text-rose-400 font-mono break-words">{err}</span>
      )}
    </div>
  );
}
