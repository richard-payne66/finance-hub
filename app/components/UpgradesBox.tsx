"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Upgrade = {
  id: string;
  page: string;
  text: string;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
  note?: string | null;
};

// Hidden on the login screen, the public accountant share view, auth pages, and
// the single-purpose mobile capture tool (keep that focused).
function hiddenOn(path: string): boolean {
  return path === "/login" || path === "/capture" || path.startsWith("/auth") || path.startsWith("/share");
}

export default function UpgradesBox() {
  const path = usePathname();
  const [items, setItems] = useState<Upgrade[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!path || hiddenOn(path)) return;
    fetch(`/api/upgrades?page=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [path]);

  useEffect(() => { setLoaded(false); load(); }, [load]);

  if (!path || hiddenOn(path)) return null;

  async function add() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await fetch("/api/upgrades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: path, text: t }),
      });
      if (r.ok) { setText(""); load(); }
    } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: "done" | "pending") {
    await fetch("/api/upgrades", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/upgrades?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  const pending = items.filter((u) => u.status === "pending");
  const done = items.filter((u) => u.status === "done");

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-8 mt-10 mb-12">
      <div className="bg-surface border border-white/8 rounded-2xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">🚀 Upgrades</p>
        <p className="text-[11px] text-muted/45 mt-0.5 mb-3">
          Ideas for this page. Jot them here and I&apos;ll work through them each evening.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add an idea for this page…"
            className="flex-1 bg-background border border-white/10 rounded-lg px-3 py-2 text-[13px] text-foreground placeholder:text-muted/40 focus:outline-none focus:border-white/30"
            style={{ fontSize: "16px" }}
          />
          <button
            onClick={add}
            disabled={busy || !text.trim()}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-primary text-background hover:opacity-90 disabled:opacity-40 shrink-0"
          >
            Add
          </button>
        </div>

        {loaded && pending.length === 0 && (
          <p className="text-[12px] text-muted/40">No upgrades queued for this page.</p>
        )}

        {pending.length > 0 && (
          <ul className="flex flex-col gap-2">
            {pending.map((u) => (
              <li key={u.id} className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3.5 py-2.5">
                <span className="text-amber-400 text-[13px] shrink-0 leading-snug">•</span>
                <span className="flex-1 text-[13px] text-foreground/85 leading-snug">{u.text}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setStatus(u.id, "done")} title="Mark done" className="text-[9px] font-bold uppercase tracking-widest text-muted/50 hover:text-primary">Done</button>
                  <button onClick={() => remove(u.id)} title="Remove" className="text-[9px] text-muted/30 hover:text-rose-400">✕</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-widest text-muted/40 hover:text-foreground">
              <span className="group-open:hidden">Completed ({done.length}) ▾</span>
              <span className="hidden group-open:inline">Completed ({done.length}) ▴</span>
            </summary>
            <ul className="flex flex-col gap-1.5 mt-2">
              {done.map((u) => (
                <li key={u.id} className="flex items-start gap-2 px-1">
                  <span className="text-primary text-[12px] shrink-0">✓</span>
                  <span className="flex-1 text-[12px] text-muted/50 line-through leading-snug">{u.text}</span>
                  <button onClick={() => setStatus(u.id, "pending")} title="Reopen" className="text-[9px] text-muted/30 hover:text-foreground shrink-0">undo</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
