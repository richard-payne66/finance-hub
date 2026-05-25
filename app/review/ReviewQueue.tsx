"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditEntry } from "@/app/lib/audit-log";

type Cat = {
  url: string;
  description: string;
  group: string | undefined;
  allowable_for_tax?: boolean;
  usage_count?: number;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });

export default function ReviewQueue() {
  const [queue, setQueue] = useState<AuditEntry[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/categorisation/list")
      .then((r) => r.json())
      .then((j) => {
        setQueue(j.queue ?? []);
        setCategories(j.categories ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string, override?: string) {
    setBusyId(id);
    try {
      const body: { id: string; category_url?: string } = { id };
      if (override) body.category_url = override;
      const r = await fetch("/api/categorisation/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) setQueue((q) => q.filter((e) => e.id !== id));
      else {
        const j = await r.json().catch(() => ({}));
        alert(`Failed: ${j.error ?? "unknown"}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function skip(id: string) {
    setBusyId(id);
    try {
      const r = await fetch("/api/categorisation/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (r.ok) setQueue((q) => q.filter((e) => e.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  async function approveAllHighConfidence() {
    const highConf = queue.filter((e) => e.confidence >= 0.7 && e.category_url);
    if (highConf.length === 0) return;
    if (!confirm(`Approve all ${highConf.length} suggestions with ≥70% confidence?`)) return;
    for (const e of highConf) {
      await approve(e.id);
    }
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return queue;
    const f = filter.toLowerCase();
    return queue.filter((e) =>
      e.txn_description.toLowerCase().includes(f) ||
      (e.category_name ?? "").toLowerCase().includes(f)
    );
  }, [queue, filter]);

  if (loading) {
    return <p className="text-sm text-muted/60">Loading…</p>;
  }
  if (queue.length === 0) {
    return (
      <div className="bg-surface border border-primary/20 rounded-2xl p-8 text-center">
        <p className="text-3xl mb-2">✓</p>
        <p className="text-sm font-bold text-primary">Queue empty</p>
        <p className="text-xs text-muted/60 mt-2">
          Nothing waiting for review. The AI bookkeeper is up to date.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${queue.length} item${queue.length !== 1 ? "s" : ""}…`}
          className="flex-1 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-white/30"
          style={{ fontSize: "16px" }}
        />
        <button
          onClick={approveAllHighConfidence}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-full bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors shrink-0"
        >
          Approve all ≥70%
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((e) => (
          <ReviewCard
            key={e.id}
            entry={e}
            categories={categories}
            override={overrides[e.id]}
            onOverrideChange={(v) => setOverrides((o) => ({ ...o, [e.id]: v }))}
            onApprove={() => approve(e.id, overrides[e.id] || undefined)}
            onSkip={() => skip(e.id)}
            busy={busyId === e.id}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  entry: e,
  categories,
  override,
  onOverrideChange,
  onApprove,
  onSkip,
  busy,
}: {
  entry: AuditEntry;
  categories: Cat[];
  override: string | undefined;
  onOverrideChange: (v: string) => void;
  onApprove: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const isOut = e.txn_amount < 0;
  const selectedCategory = override || e.category_url || "";
  const [showAll, setShowAll] = useState(false);

  // Split categories into "frequently used" (any usage_count > 0) and the rest.
  // Each section grouped by FA group_description.
  const { frequentByGroup, restByGroup, frequentCount } = useMemo(() => {
    const freq: Cat[] = [];
    const rest: Cat[] = [];
    for (const c of categories) {
      if ((c.usage_count ?? 0) > 0) freq.push(c);
      else rest.push(c);
    }
    // Sort frequently-used by usage descending (most-used first)
    freq.sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));

    const groupBy = (list: Cat[]) => {
      const m = new Map<string, Cat[]>();
      for (const c of list) {
        const g = c.group ?? "Other";
        if (!m.has(g)) m.set(g, []);
        m.get(g)!.push(c);
      }
      return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    };

    return {
      frequentByGroup: freq, // flat — already ranked by usage
      restByGroup: groupBy(rest),
      frequentCount: freq.length,
    };
  }, [categories]);

  return (
    <article className="bg-surface border border-white/8 rounded-2xl p-4 sm:p-5">
      {/* Top row: description + amount */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{e.txn_description}</p>
          <p className="text-[10px] text-muted/50 mt-0.5">
            {fmtDate(e.txn_date)} · {isOut ? "out" : "in"}
          </p>
        </div>
        <p className={`text-base font-bold font-mono shrink-0 ${isOut ? "text-foreground" : "text-primary"}`}>
          {isOut ? "−" : "+"}{GBP.format(Math.abs(e.txn_amount))}
        </p>
      </div>

      {/* Claude's suggestion */}
      <div className="bg-white/3 rounded-lg p-3 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-widest font-bold text-muted/60">AI suggests</span>
          <span className="text-[9px] text-muted/50 font-mono">{Math.round(e.confidence * 100)}% confident</span>
        </div>
        <p className="text-sm text-foreground">{e.category_name ?? "(no suggestion)"}</p>
        {e.reasoning && (
          <p className="text-[11px] text-muted/60 mt-1 leading-snug">{e.reasoning}</p>
        )}
        {e.tax_note && (
          <p className="text-[11px] text-primary/70 mt-1 italic">💰 {e.tax_note}</p>
        )}
      </div>

      {/* Override picker — defaults to frequently-used; toggle for all */}
      <label className="block">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-widest font-bold text-muted/60">Category to apply</span>
          {frequentCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-[9px] uppercase tracking-widest font-bold text-muted/50 hover:text-foreground"
            >
              {showAll ? `Show frequent (${frequentCount}) ▴` : `Show all (${categories.length}) ▾`}
            </button>
          )}
        </div>
        <select
          value={selectedCategory}
          onChange={(ev) => onOverrideChange(ev.target.value)}
          disabled={busy}
          className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30"
          style={{ fontSize: "16px" }}
        >
          <option value="">— choose —</option>
          {frequentCount > 0 && (
            <optgroup label={`★ Frequently used (${frequentCount})`}>
              {frequentByGroup.map((c) => (
                <option key={c.url} value={c.url}>
                  {c.description}
                  {c.usage_count ? ` · used ${c.usage_count}×` : ""}
                  {!c.allowable_for_tax ? " (not tax-deductible)" : ""}
                </option>
              ))}
            </optgroup>
          )}
          {(showAll || frequentCount === 0) && restByGroup.map(([group, cats]) => (
            <optgroup key={group} label={group}>
              {cats.map((c) => (
                <option key={c.url} value={c.url}>
                  {c.description}{!c.allowable_for_tax ? " (not tax-deductible)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onApprove}
          disabled={busy || !selectedCategory}
          className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {busy ? "…" : override && override !== e.category_url ? "✓ Apply override" : "✓ Approve"}
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-white/15 text-muted hover:border-white/30 hover:text-foreground transition-colors disabled:opacity-40"
        >
          Mark personal / skip
        </button>
      </div>
    </article>
  );
}
