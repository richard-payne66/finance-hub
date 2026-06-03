"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Dividend = { id: string; date: string; amount: number; note?: string; created_at: string };
type ApiShape = { dividends: Dividend[]; this_tax_year: string; this_tax_year_total: number };

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// Company facts for the voucher (public register info).
const COMPANY = "Richard Payne Ltd";
const COMPANY_NO = "11954006";
const SHAREHOLDER = "Richard Payne";

export default function DividendsPage() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);

  function load() {
    fetch("/api/dividends").then((r) => r.json()).then(setData).catch(() => {});
  }
  useEffect(() => {
    load();
    setDate(new Date().toISOString().slice(0, 10));
  }, []);

  async function add() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setErr("Enter an amount."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, date: date || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setAmount("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this dividend record?")) return;
    await fetch(`/api/dividends?id=${id}`, { method: "DELETE" });
    load();
  }

  function printVoucher(id: string) {
    setPrintId(id);
    setTimeout(() => { window.print(); }, 60);
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      {/* Print CSS: when printing, show only the active voucher */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .voucher-print, .voucher-print * { visibility: visible !important; }
        .voucher-print { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      <header className="mb-6 no-print">
        <Link href="/" className="text-[10px] uppercase tracking-widest text-muted/50 hover:text-foreground transition-colors">← Home</Link>
        <h1 className="text-2xl font-black tracking-tight text-foreground mt-2">Pay yourself a dividend</h1>
        <p className="text-xs text-muted/60 mt-1 max-w-lg leading-relaxed">
          Records the dividend and generates the <strong className="text-foreground/80">voucher</strong> you need to keep
          for each one. This is the paperwork that keeps your director&apos;s loan clean. Your accountant still records the
          formal entry — this is your evidence and running log.
        </p>
      </header>

      {/* Add form */}
      <section className="no-print bg-surface border border-white/10 rounded-2xl p-5 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted/50 font-bold">Amount (£)</span>
            <input
              type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="3000" className="w-32 bg-background border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-white/30"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-widest text-muted/50 font-bold">Date</span>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-background border border-white/10 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-white/30"
            />
          </label>
          <button
            onClick={add} disabled={busy}
            className="text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-full bg-primary text-background hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Record & make voucher"}
          </button>
        </div>
        {err && <p className="text-[11px] text-rose-400 mt-2">{err}</p>}
        {data && (
          <p className="text-[11px] text-muted/60 mt-3">
            Declared in {data.this_tax_year}: <strong className="text-foreground/80">{GBP.format(data.this_tax_year_total)}</strong>
          </p>
        )}
      </section>

      {/* Vouchers / log */}
      <section className="flex flex-col gap-4">
        {data?.dividends.length === 0 && (
          <p className="text-sm text-muted/50 no-print">No dividends recorded yet.</p>
        )}
        {data?.dividends.map((d) => (
          <div
            key={d.id}
            className={`rounded-2xl border p-6 bg-surface ${printId === d.id ? "voucher-print" : ""} ${printId && printId !== d.id ? "no-print" : ""}`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-primary/70 font-bold">Dividend voucher</p>
                <p className="text-lg font-black text-foreground mt-0.5">{COMPANY}</p>
                <p className="text-[11px] text-muted/60">Company No. {COMPANY_NO}</p>
              </div>
              <p className="text-2xl font-black text-primary">{GBP.format(d.amount)}</p>
            </div>
            <dl className="text-[13px] text-foreground/85 space-y-1.5">
              <div className="flex gap-2"><dt className="text-muted/60 w-40 shrink-0">Date of dividend</dt><dd>{fmtLong(d.date)}</dd></div>
              <div className="flex gap-2"><dt className="text-muted/60 w-40 shrink-0">Shareholder</dt><dd>{SHAREHOLDER} (ordinary shares — 100% holding)</dd></div>
              <div className="flex gap-2"><dt className="text-muted/60 w-40 shrink-0">Dividend</dt><dd>Interim dividend on the ordinary shares of the company</dd></div>
              <div className="flex gap-2"><dt className="text-muted/60 w-40 shrink-0">Amount payable</dt><dd className="font-bold">{GBP.format(d.amount)}</dd></div>
            </dl>
            <p className="text-[11px] text-muted/50 mt-3 leading-relaxed">
              Paid out of the company&apos;s available profits. No tax credit attaches to this dividend (dividends are paid gross).
            </p>
            <div className="mt-4 pt-3 border-t border-white/10 text-[12px] text-muted/70">
              Signed: ______________________________ &nbsp; Director, {COMPANY}
            </div>
            <div className="mt-4 flex gap-2 no-print">
              <button onClick={() => printVoucher(d.id)} className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-foreground hover:border-white/30">
                Print / save PDF
              </button>
              <button onClick={() => remove(d.id)} className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-rose-500/30 text-rose-300/80 hover:border-rose-500/50">
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>

      <p className="text-[10px] text-muted/40 mt-8 leading-relaxed no-print">
        Tip: take a regular monthly dividend and record it here each time — that keeps your director&apos;s loan from going
        overdrawn. Declare dividends only from available profit; your accountant confirms this and records the formal entry.
      </p>
    </main>
  );
}
