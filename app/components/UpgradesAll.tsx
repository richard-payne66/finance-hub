"use client";

import { useEffect, useState } from "react";
import { pageLabel } from "@/app/lib/upgrades";

type Upgrade = {
  id: string;
  page: string;
  text: string;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
};

// Global view of every UPGRADES idea across all pages, for the Setup page.
export default function UpgradesAll() {
  const [items, setItems] = useState<Upgrade[]>([]);
  const [loaded, setLoaded] = useState(false);

  function load() {
    fetch("/api/upgrades").then((r) => r.json()).then((d) => {
      setItems(Array.isArray(d) ? d : []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }
  useEffect(load, []);

  async function setStatus(id: string, status: "done" | "pending") {
    await fetch("/api/upgrades", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  const pending = items.filter((u) => u.status === "pending");
  const done = items.filter((u) => u.status === "done");

  // group pending by page
  const pages = Array.from(new Set(pending.map((u) => u.page))).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] text-muted uppercase tracking-widest font-bold">🚀 Upgrades — all pages</p>
        {loaded && (
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-amber-400/80 font-mono font-bold">{pending.length} to do</span>
            <span className="text-[9px] text-muted/30 font-mono">·</span>
            <span className="text-[9px] text-primary font-mono font-bold">{done.length} done</span>
          </div>
        )}
      </div>

      {loaded && pending.length === 0 && (
        <p className="text-xs text-muted/50 mb-3">Nothing queued. Add ideas in the UPGRADES box at the bottom of any page.</p>
      )}

      <div className="flex flex-col gap-3">
        {pages.map((page) => (
          <div key={page} className="bg-surface border border-white/8 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-white/3 border-b border-white/6">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted/70">{pageLabel(page)}</span>
            </div>
            <ul className="divide-y divide-white/4">
              {pending.filter((u) => u.page === page).map((u) => (
                <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-amber-400 text-[13px] shrink-0">•</span>
                  <span className="flex-1 text-[13px] text-foreground/85 leading-snug">{u.text}</span>
                  <button onClick={() => setStatus(u.id, "done")} className="text-[9px] font-bold uppercase tracking-widest text-muted/50 hover:text-primary shrink-0">Done</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

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
                <span className="flex-1 text-[12px] text-muted/55 leading-snug">
                  <span className="line-through">{u.text}</span>
                  <span className="text-muted/30"> · {pageLabel(u.page)}</span>
                </span>
                <button onClick={() => setStatus(u.id, "pending")} className="text-[9px] text-muted/30 hover:text-foreground shrink-0">undo</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
