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

export default function ActivityView() {
  const [filed, setFiled] = useState<AuditEntry[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/categorisation/activity")
      .then((r) => r.json())
      .then((j) => {
        setFiled(j.filed ?? []);
        setCategories(j.categories ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Optimistically update one row after a correction.
  function patchRow(id: string, patch: Partial<AuditEntry> | null) {
    setFiled((rows) =>
      patch === null
        ? rows.filter((r) => r.id !== id) // marked personal — drops out of "filed"
        : rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  const filtered = useMemo(() => {
    if (!filter.trim()) return filed;
    const f = filter.toLowerCase();
    return filed.filter(
      (e) =>
        e.txn_description.toLowerCase().includes(f) ||
        (e.category_name ?? "").toLowerCase().includes(f)
    );
  }, [filed, filter]);

  if (loading) return <p className="text-sm text-muted/60">Loading…</p>;

  if (filed.length === 0) {
    return (
      <div className="bg-surface border border-white/8 rounded-2xl p-8 text-center">
        <p className="text-3xl mb-2">🗂️</p>
        <p className="text-sm font-bold text-foreground">Nothing filed yet</p>
        <p className="text-xs text-muted/60 mt-2">
          Once the AI bookkeeper books transactions on its own, they&apos;ll show here for you to check.
        </p>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filter ${filed.length} filed item${filed.length !== 1 ? "s" : ""}…`}
        className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-white/30 mb-4"
        style={{ fontSize: "16px" }}
      />
      <div className="flex flex-col gap-3">
        {filtered.map((e) => (
          <FiledRow key={e.id} entry={e} categories={categories} onPatch={patchRow} />
        ))}
      </div>
    </div>
  );
}

function FiledRow({
  entry: e,
  categories,
  onPatch,
}: {
  entry: AuditEntry;
  categories: Cat[];
  onPatch: (id: string, patch: Partial<AuditEntry> | null) => void;
}) {
  const isOut = e.txn_amount < 0;
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(e.category_url ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const ranked = useMemo(() => {
    const freq = categories.filter((c) => (c.usage_count ?? 0) > 0).sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));
    const rest = categories.filter((c) => (c.usage_count ?? 0) === 0);
    const groups = new Map<string, Cat[]>();
    for (const c of rest) {
      const g = c.group ?? "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(c);
    }
    return { freq, restGroups: Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)) };
  }, [categories]);

  async function save() {
    if (!choice || choice === e.category_url) { setEditing(false); return; }
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/categorisation/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, category_url: choice }),
      });
      const j = await r.json();
      if (r.ok) {
        onPatch(e.id, { category_url: choice, category_name: j.category_name ?? null });
        setEditing(false);
      } else {
        setNote(j.error ?? "Failed");
      }
    } catch {
      setNote("Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markPersonal() {
    if (!confirm("Mark this as personal? It will be un-filed from FreeAgent and I'll stop auto-filing this supplier.")) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/categorisation/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, mark_personal: true }),
      });
      const j = await r.json();
      if (r.ok) onPatch(e.id, null);
      else setNote(j.error ?? "Failed");
    } catch {
      setNote("Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="bg-surface border border-white/8 rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{e.txn_description}</p>
          <p className="text-[10px] text-muted/50 mt-0.5">
            {fmtDate(e.txn_date)} · {isOut ? "out" : "in"} · filed as{" "}
            <span className="text-foreground/70">{e.category_name ?? "(uncategorised)"}</span>
          </p>
        </div>
        <p className={`text-base font-bold font-mono shrink-0 ${isOut ? "text-foreground" : "text-primary"}`}>
          {isOut ? "−" : "+"}{GBP.format(Math.abs(e.txn_amount))}
        </p>
      </div>

      {!editing ? (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/5 text-muted hover:bg-white/10 hover:text-foreground transition-colors"
          >
            Change category
          </button>
          <button
            onClick={markPersonal}
            disabled={busy}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full text-muted/60 hover:text-rose-400 transition-colors disabled:opacity-40"
          >
            Mark personal
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <select
            value={choice}
            onChange={(ev) => setChoice(ev.target.value)}
            disabled={busy}
            className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-white/30"
            style={{ fontSize: "16px" }}
          >
            <option value="">— choose —</option>
            {ranked.freq.length > 0 && (
              <optgroup label={`★ Frequently used (${ranked.freq.length})`}>
                {ranked.freq.map((c) => (
                  <option key={c.url} value={c.url}>
                    {c.description}{c.usage_count ? ` · used ${c.usage_count}×` : ""}{!c.allowable_for_tax ? " (not tax-deductible)" : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {ranked.restGroups.map(([group, cats]) => (
              <optgroup key={group} label={group}>
                {cats.map((c) => (
                  <option key={c.url} value={c.url}>
                    {c.description}{!c.allowable_for_tax ? " (not tax-deductible)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={save}
              disabled={busy}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save change"}
            </button>
            <button
              onClick={() => { setEditing(false); setChoice(e.category_url ?? ""); }}
              disabled={busy}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full text-muted/60 hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {note && <p className="text-[10px] text-rose-400 mt-2">{note}</p>}
    </article>
  );
}
