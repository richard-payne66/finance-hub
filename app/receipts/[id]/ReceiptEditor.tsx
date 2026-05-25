"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Receipt } from "@/app/lib/types";

type EditableState = {
  supplier: string;
  description: string;
  supply_date: string;
  currency: string;
  gross_total: string; // strings while editing, parsed on save
  net_total: string;
  vat_total: string;
  vat_rate: string;
  payment_method: "card" | "cash" | "bank_transfer" | "direct_debit" | "";
  category_name: string;
  is_business_card: "true" | "false" | "";
  notes: string;
};

function toState(r: Receipt): EditableState {
  return {
    supplier: r.supplier ?? "",
    description: r.description ?? "",
    supply_date: r.supply_date ?? "",
    currency: r.currency ?? "GBP",
    gross_total: r.gross_total != null ? String(r.gross_total) : "",
    net_total: r.net_total != null ? String(r.net_total) : "",
    vat_total: r.vat_total != null ? String(r.vat_total) : "",
    vat_rate: r.vat_rate ?? "",
    payment_method: (r.payment_method ?? "") as EditableState["payment_method"],
    category_name: r.category_name ?? "",
    is_business_card:
      r.is_business_card === true ? "true" : r.is_business_card === false ? "false" : "",
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

  function field<K extends keyof EditableState>(key: K) {
    return {
      value: state[key],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
      ) => setState((s) => ({ ...s, [key]: e.target.value as EditableState[K] })),
    };
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      const body = {
        supplier: state.supplier.trim() || null,
        description: state.description.trim() || null,
        supply_date: state.supply_date || null,
        currency: state.currency.trim() || null,
        gross_total: toNumber(state.gross_total),
        net_total: toNumber(state.net_total),
        vat_total: toNumber(state.vat_total),
        vat_rate: state.vat_rate.trim() || null,
        payment_method: state.payment_method || null,
        category_name: state.category_name.trim() || null,
        is_business_card:
          state.is_business_card === "true"
            ? true
            : state.is_business_card === "false"
            ? false
            : null,
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
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
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
      {/* Two-column grid for short fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Supplier</label>
          <input className={inputCls} {...field("supplier")} placeholder="e.g. Tesco" />
        </div>
        <div>
          <label className={labelCls}>Date (YYYY-MM-DD)</label>
          <input className={inputCls} {...field("supply_date")} placeholder="2026-05-25" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>What was this for?</label>
          <input
            className={inputCls}
            {...field("description")}
            placeholder="Concise expense label"
          />
        </div>
        <div>
          <label className={labelCls}>Gross total</label>
          <input
            className={inputCls}
            {...field("gross_total")}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <input className={inputCls} {...field("currency")} placeholder="GBP" />
        </div>
        <div>
          <label className={labelCls}>Net total</label>
          <input
            className={inputCls}
            {...field("net_total")}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls}>VAT total</label>
          <input
            className={inputCls}
            {...field("vat_total")}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls}>VAT rate</label>
          <input
            className={inputCls}
            {...field("vat_rate")}
            placeholder="20%, 0%, Exempt…"
          />
        </div>
        <div>
          <label className={labelCls}>Payment method</label>
          <select className={inputCls} {...field("payment_method")}>
            <option value="">—</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="direct_debit">Direct debit</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>FreeAgent category</label>
          <input
            className={inputCls}
            {...field("category_name")}
            placeholder="e.g. Travel"
          />
        </div>
        <div>
          <label className={labelCls}>Paid with business card?</label>
          <select className={inputCls} {...field("is_business_card")}>
            <option value="">—</option>
            <option value="true">Yes — business card</option>
            <option value="false">No — personal</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          className={inputCls + " resize-none"}
          rows={3}
          {...field("notes")}
          placeholder="Anything else you want to record"
        />
      </div>

      {err && (
        <div className="px-3 py-2 bg-red-500/8 border border-red-500/20 rounded-lg">
          <p className="text-[12px] text-red-400">{err}</p>
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
