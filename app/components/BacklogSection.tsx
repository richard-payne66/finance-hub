"use client";

import { useEffect, useRef, useState } from "react";
import type { BacklogItem } from "@/app/api/backlog/route";

export default function BacklogSection() {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/backlog")
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  async function addItem() {
    const text = input.trim();
    if (!text || adding) return;
    setAdding(true);
    const res = await fetch("/api/backlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const item: BacklogItem = await res.json();
    setItems((prev) => [item, ...prev]);
    setInput("");
    setAdding(false);
    inputRef.current?.focus();
  }

  async function toggleDone(id: string) {
    const res = await fetch("/api/backlog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const updated: BacklogItem = await res.json();
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/backlog?id=${id}`, { method: "DELETE" });
  }

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <section className="mt-10">
      <p className="text-[9px] text-muted uppercase tracking-widest font-bold mb-3">
        Backlog
      </p>

      {/* Add input */}
      <div className="bg-surface border border-white/10 rounded-xl flex items-center gap-2 px-4 py-2.5 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Add a feature request or task…"
          style={{ fontSize: "16px" }}
          className="flex-1 text-sm text-foreground placeholder-muted/40 bg-transparent outline-none"
        />
        <button
          onClick={addItem}
          disabled={!input.trim() || adding}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-muted hover:bg-primary hover:text-background hover:border-primary transition-all disabled:opacity-30 disabled:cursor-default"
        >
          Add
        </button>
      </div>

      {/* Open items */}
      {loading && (
        <p className="text-xs text-muted/40 py-4 text-center">Loading…</p>
      )}

      {!loading && open.length === 0 && done.length === 0 && (
        <p className="text-xs text-muted/30 py-4 text-center">
          Nothing in the backlog yet.
        </p>
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-4">
          {open.map((item) => (
            <BacklogRow key={item.id} item={item} onToggle={toggleDone} onDelete={deleteItem} />
          ))}
        </ul>
      )}

      {/* Done items (collapsed) */}
      {done.length > 0 && (
        <details className="group">
          <summary className="text-[9px] text-muted/40 uppercase tracking-widest font-bold cursor-pointer select-none mb-2 list-none flex items-center gap-1.5">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            Done ({done.length})
          </summary>
          <ul className="flex flex-col gap-1.5 mt-2">
            {done.map((item) => (
              <BacklogRow key={item.id} item={item} onToggle={toggleDone} onDelete={deleteItem} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function BacklogRow({
  item,
  onToggle,
  onDelete,
}: {
  item: BacklogItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="group flex items-center gap-3 bg-surface border border-white/8 rounded-xl px-4 py-3 hover:border-white/15 transition-all">
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? "Mark open" : "Mark done"}
        className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
          item.done
            ? "bg-primary border-primary text-background"
            : "border-white/20 hover:border-white/40"
        }`}
      >
        {item.done && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Text */}
      <span
        className={`flex-1 text-sm leading-snug ${
          item.done ? "line-through text-muted/40" : "text-foreground"
        }`}
      >
        {item.text}
      </span>

      {/* Delete — appears on hover */}
      <button
        onClick={() => onDelete(item.id)}
        aria-label="Delete"
        className="opacity-0 group-hover:opacity-100 text-muted/40 hover:text-red-400 transition-all text-xs shrink-0"
      >
        ✕
      </button>
    </li>
  );
}
