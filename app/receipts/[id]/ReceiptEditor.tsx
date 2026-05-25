"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Receipt } from "@/app/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type EditableState = {
  supplier: string;
  description: string;
  supply_date: string;
  gross_total: string;
  vat_rate: string;
  payment_method: "card" | "cash" | "bank_transfer" | "direct_debit" | "";
  category_url: string;
  notes: string;
};

type Cat = {
  url: string;
  description: string;
  group?: string;
  allowable_for_tax?: boolean;
  usage_count: number;
};

// Common UK VAT rates — covers ~all cases. "Auto" lets the system stay
// with whatever Claude inferred.
const VAT_RATES = ["Auto", "20%", "5%", "0%", "Exempt", "Out of Scope"] as const;

function toState(r: Receipt): EditableState {
  return {
    supplier: r.supplier ?? "",
    description: r.description ?? "",
    supply_date: r.supply_date ?? "",
    gross_total: r.gross_total != null ? String(r.gross_total) : "",
    vat_rate: r.vat_rate ?? "",
    payment_method: (r.payment_method ?? "") as EditableState["payment_method"],
    category_url: r.category_url ?? "",
    notes: r.notes ?? "",
  };
}

function toNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function ReceiptEditor({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const [state, setState] = useState<EditableState>(() => toState(receipt));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<Cat[]>([]);
  const [showAllCats, setShowAllCats] = useState(false);

  // Fetch categories once on mount.
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((j) => setCategories((j.categories as Cat[]) ?? []))
      .catch(() => setCategories([]));
  }, []);

  // Split into frequently-used vs the rest, mirror /review picker.
  const { frequent, restByGroup } = useMemo(() => {
    const freq: Cat[] = [];
    const rest: Cat[] = [];
    for (const c of categories) {
      if (c.usage_count > 0) freq.push(c);
      else rest.push(c);
    }
    freq.sort((a, b) => b.usage_count - a.usage_count);
    const m = new Map<string, Cat[]>();
    for (const c of rest) {
      const g = c.group ?? "Other";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c);
    }
    return {
      frequent: freq,
      restByGroup: Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [categories]);

  // If the currently-saved category isn't in the frequently-used list,
  // make sure we expand the dropdown to include it.
  const currentCatInFrequent = useMemo(
    () => frequent.some((c) => c.url === state.category_url),
    [frequent, state.category_url],
  );
  const effectiveShowAll = showAllCats || (state.category_url !== "" && !currentCatInFrequent);

  function setField<K extends keyof EditableState>(key: K, value: EditableState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      // Find category name for the picked URL so it stays denormalised.
      const cat = categories.find((c) => c.url === state.category_url);
      const body = {
        supplier: state.supplier.trim() || null,
        description: state.description.trim() || null,
        supply_date: state.supply_date || null,
        gross_total: toNumber(state.gross_total),
        vat_rate: state.vat_rate.trim() || null,
        payment_method: state.payment_method || null,
        category_url: state.category_url || null,
        category_name: cat?.description ?? null,
        notes: state.notes.trim() || null,
      };
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      // Bounce back to the list once the save lands — the brief "✓ Saved"
      // flash gives just enough confirmation before the route changes.
      setTimeout(() => router.push("/receipts"), 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this receipt? This can't be undone.")) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/receipts/${receipt.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/receipts");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const inputCls =
    "w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/30 focus:outline-none focus:border-white/30 transition-colors";
  const labelCls =
    "block text-[10px] font-bold uppercase tracking-widest text-muted/60 mb-1.5";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Supplier</label>
          <input
            className={inputCls}
            value={state.supplier}
            onChange={(e) => setField("supplier", e.target.value)}
            placeholder="e.g. Tesco"
          />
        </div>
        <div>
          <label className={labelCls}>Date (YYYY-MM-DD)</label>
          <input
            className={inputCls}
            value={state.supply_date}
            onChange={(e) => setField("supply_date", e.target.value)}
            placeholder="2026-05-25"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>What was this for?</label>
          <input
            className={inputCls}
            value={state.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Concise expense label"
          />
        </div>
        <div>
          <label className={labelCls}>Total</label>
          <input
            className={inputCls}
            value={state.gross_total}
            onChange={(e) => setField("gross_total", e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls}>VAT rate</label>
          <select
            className={inputCls}
            value={state.vat_rate}
            onChange={(e) => setField("vat_rate", e.target.value)}
          >
            <option value="">—</option>
            {VAT_RATES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Paid by</label>
          <select
            className={inputCls}
            value={state.payment_method}
            onChange={(e) =>
              setField("payment_method", e.target.value as EditableState["payment_method"])
            }
          >
            <option value="">—</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="direct_debit">Direct debit</option>
          </select>
        </div>
        <div className="sm:col-span-1">
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls + " mb-0"}>FreeAgent category</label>
            {frequent.length > 0 && categories.length > frequent.length && (
              <button
                type="button"
                onClick={() => setShowAllCats((v) => !v)}
                className="text-[9px] uppercase tracking-widest font-bold text-muted/50 hover:text-foreground transition-colors"
              >
                {effectiveShowAll
                  ? `Show frequent (${frequent.length}) ▴`
                  : `Show all (${categories.length}) ▾`}
              </button>
            )}
          </div>
          <select
            className={inputCls}
            value={state.category_url}
            onChange={(e) => setField("category_url", e.target.value)}
          >
            <option value="">— choose —</option>
            {frequent.length > 0 && (
              <optgroup label={`★ Frequently used (${frequent.length})`}>
                {frequent.map((c) => (
                  <option key={c.url} value={c.url}>
                    {c.description}
                    {c.usage_count ? ` · used ${c.usage_count}×` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            {(effectiveShowAll || frequent.length === 0) &&
              restByGroup.map(([group, cats]) => (
                <optgroup key={group} label={group}>
                  {cats.map((c) => (
                    <option key={c.url} value={c.url}>
                      {c.description}
                      {!c.allowable_for_tax ? " (not tax-deductible)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          className={inputCls + " resize-none"}
          rows={3}
          value={state.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Anything else you want to record"
        />
      </div>

      {err && (
        <div className="px-3 py-2 bg-red-500/8 border border-red-500/20 rounded-lg">
          <p className="text-[12px] text-red-400 break-words">{err}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={save}
          disabled={saving}
          className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-primary text-background hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
        </button>
        <button
          onClick={remove}
          disabled={saving}
          className="text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
