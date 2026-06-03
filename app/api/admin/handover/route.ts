import { NextResponse } from "next/server";
import { api as faApi, isConnected } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

// READ-ONLY "is FreeAgent ship-shape for handover?" health check.
// Lists every UNEXPLAINED bank transaction (the thing an accountant cares
// about), plus balances/feed freshness, money owed to the company (open
// invoices), and unpaid VAT/CT returns. Writes nothing.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

type FaBank = {
  url: string; name?: string; type?: string; is_personal: boolean; status: string;
  current_balance: string; latest_activity_date?: string; marked_for_review_count?: number; is_primary?: boolean;
};
type FaTxn = { url: string; amount: string; dated_on: string; description?: string; full_description?: string; unexplained_amount?: string };
type FaInvoice = { reference?: string; status?: string; due_value?: string; total_value?: string; due_on?: string; contact?: string };
type FaVatReturn = { status?: string; period_ends_on?: string; payments?: Array<{ amount_due?: string; due_on?: string; status?: string }> };
type FaCt = { amount_due?: string; payment_status?: string; payment_due_on?: string; period_ends_on?: string; filing_status?: string };

const num = (s?: string | null) => { const n = parseFloat(s ?? ""); return Number.isFinite(n) ? n : 0; };
const daysSince = (d?: string | null) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 86400000) : null);

export async function GET() {
  try {
    if (!(await isConnected())) return NextResponse.json({ connected: false });

    const banksRes = await faApi<{ bank_accounts: FaBank[] }>("/bank_accounts");
    const accountsAll = banksRes.bank_accounts.filter((b) => b.status === "active");

    const accounts = [];
    let totalUnexplained = 0;
    let totalMarkedForReview = 0;

    for (const b of accountsAll) {
      const unexplained: FaTxn[] = [];
      for (let page = 1; page <= 10; page++) {
        const r = await faApi<{ bank_transactions: FaTxn[] }>(
          `/bank_transactions?bank_account=${encodeURIComponent(b.url)}&view=unexplained&per_page=100&page=${page}`
        );
        const txns = r.bank_transactions ?? [];
        unexplained.push(...txns);
        if (txns.length < 100) break;
      }
      totalUnexplained += unexplained.length;
      totalMarkedForReview += b.marked_for_review_count ?? 0;
      const sortedDesc = [...unexplained].sort((a, b2) => (a.dated_on < b2.dated_on ? 1 : -1));
      accounts.push({
        name: b.name ?? b.url,
        is_personal: b.is_personal,
        balance: Math.round(num(b.current_balance)),
        last_activity: b.latest_activity_date ?? null,
        days_since_activity: daysSince(b.latest_activity_date),
        stale: (daysSince(b.latest_activity_date) ?? 999) > 14,
        marked_for_review: b.marked_for_review_count ?? 0,
        unexplained_count: unexplained.length,
        unexplained_total: Math.round(unexplained.reduce((s, t) => s + Math.abs(num(t.unexplained_amount ?? t.amount)), 0)),
        unexplained_oldest: sortedDesc.length ? sortedDesc[sortedDesc.length - 1].dated_on : null,
        unexplained_sample: sortedDesc.slice(0, 30).map((t) => ({
          date: t.dated_on,
          amount: num(t.amount),
          description: (t.full_description ?? t.description ?? "").slice(0, 90),
        })),
      });
    }

    // Money owed TO the company (open / overdue invoices)
    let invoices: FaInvoice[] = [];
    try {
      invoices = (await faApi<{ invoices: FaInvoice[] }>("/invoices?view=open_or_overdue&per_page=100")).invoices ?? [];
    } catch {
      try { invoices = (await faApi<{ invoices: FaInvoice[] }>("/invoices?view=open&per_page=100")).invoices ?? []; } catch {}
    }
    const today = new Date().toISOString().slice(0, 10);
    const invoiceSummary = {
      open_count: invoices.length,
      open_total: Math.round(invoices.reduce((s, i) => s + num(i.due_value ?? i.total_value), 0)),
      overdue_count: invoices.filter((i) => i.due_on && i.due_on < today).length,
    };

    // Unpaid tax returns (VAT + CT)
    const vat = await faApi<{ vat_returns: FaVatReturn[] }>("/vat_returns");
    const unpaidVat = vat.vat_returns.flatMap((r) =>
      (r.payments ?? []).filter((p) => p.status !== "marked_as_paid" && Math.abs(num(p.amount_due)) > 0.01)
        .map((p) => ({ period_ends: r.period_ends_on, amount: num(p.amount_due), due_on: p.due_on }))
    );
    const ct = await faApi<{ corporation_tax_returns: FaCt[] }>("/corporation_tax_returns");
    const unpaidCt = ct.corporation_tax_returns
      .filter((r) => r.payment_status !== "marked_as_paid" && num(r.amount_due) > 0.01)
      .map((r) => ({ period_ends: r.period_ends_on, amount: num(r.amount_due), due_on: r.payment_due_on, status: r.filing_status }));

    return NextResponse.json({
      connected: true,
      headline: {
        total_unexplained: totalUnexplained,
        total_marked_for_review: totalMarkedForReview,
        unpaid_vat_returns: unpaidVat.length,
        unpaid_ct_returns: unpaidCt.length,
        open_invoices: invoiceSummary.open_count,
      },
      accounts,
      invoices: invoiceSummary,
      unpaid_vat: unpaidVat,
      unpaid_ct: unpaidCt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
