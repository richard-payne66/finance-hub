import { NextResponse } from "next/server";
import { api, isConnected } from "@/app/lib/freeagent";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// One endpoint, all the home-page numbers. Plain English, no jargon.

type FaBank = {
  url: string;
  is_personal: boolean;
  status: string;
  current_balance: string;
  bank_name: string;
  name: string;
};
type FaInvoice = {
  url: string;
  total_value: string;
  status: string; // 'Open' | 'Overdue' | 'Paid' | ...
  due_on?: string;
};

type FaVatPayment = { amount_due?: string; status?: string };
type FaVatReturn = { payments?: FaVatPayment[] };
type FaCtReturn = { amount_due?: string; payment_status?: string; filing_status?: string; period_ends_on?: string };

type ManualLine = { amount: number; status: string };

export type DashboardStats = {
  connected: boolean;

  // Cash position
  cash_total: number;
  cash_after_tax: number; // bank total minus owed_now
  owed_now: number;

  // Invoices (money OWED TO YOU)
  invoices_total_owed_to_you: number;
  invoices_overdue_count: number;
  invoices_overdue_total: number;

  // Receipts queue
  receipts_pending_count: number;

  // Documents completeness — these are computed against the checklist
  // definitions in the client, but we surface the raw doc count here.
  documents_total: number;

  updated_at: string;
};

function parseAmount(s: string | undefined | null): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    // -- Always-available stats (Supabase) --
    const pendingReceiptsP = db()
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const documentsCountP = db()
      .from("documents")
      .select("id", { count: "exact", head: true });

    const [pendingReceipts, documentsCount] = await Promise.all([
      pendingReceiptsP,
      documentsCountP,
    ]);

    const receipts_pending_count = pendingReceipts.count ?? 0;
    const documents_total = documentsCount.count ?? 0;

    // -- FA-dependent stats --
    if (!(await isConnected())) {
      return NextResponse.json<DashboardStats>({
        connected: false,
        cash_total: 0,
        cash_after_tax: 0,
        owed_now: 0,
        invoices_total_owed_to_you: 0,
        invoices_overdue_count: 0,
        invoices_overdue_total: 0,
        receipts_pending_count,
        documents_total,
        updated_at: new Date().toISOString(),
      });
    }

    const [banksRes, openInvoicesRes, overdueInvoicesRes, vatRes, ctRes, manualRow] = await Promise.all([
      api<{ bank_accounts: FaBank[] }>("/bank_accounts"),
      api<{ invoices: FaInvoice[] }>("/invoices?view=open"),
      api<{ invoices: FaInvoice[] }>("/invoices?view=overdue"),
      api<{ vat_returns: FaVatReturn[] }>("/vat_returns"),
      api<{ corporation_tax_returns: FaCtReturn[] }>("/corporation_tax_returns"),
      db().from("kv").select("value").eq("key", "manual_tax_liabilities").maybeSingle(),
    ]);

    // Cash: business accounts only, active status
    const cash_total = banksRes.bank_accounts
      .filter((b) => !b.is_personal && b.status === "active")
      .reduce((s, b) => s + parseAmount(b.current_balance), 0);

    // owed_now = unpaid VAT payments + unpaid finalised CT + unpaid manual lines
    const vatUnpaid = (vatRes.vat_returns ?? []).flatMap((r) =>
      (r.payments ?? []).filter((p) => p.status !== "marked_as_paid").map((p) => Math.abs(parseAmount(p.amount_due)))
    ).reduce((s, n) => s + n, 0);

    const ctUnpaid = (ctRes.corporation_tax_returns ?? [])
      .filter((r) => r.payment_status !== "marked_as_paid")
      .filter((r) => {
        // Exclude FA draft estimates for current/future years from "owed now"
        const isDraft = r.filing_status === "draft";
        const periodEnd = r.period_ends_on ? new Date(r.period_ends_on) : null;
        const isCurrentOrFuture = periodEnd ? periodEnd.getTime() > Date.now() - 30 * 86400000 : false;
        return !(isDraft && isCurrentOrFuture);
      })
      .reduce((s, r) => s + parseAmount(r.amount_due), 0);

    let manualUnpaid = 0;
    if (manualRow.data) {
      try {
        const lines = JSON.parse(manualRow.data.value) as ManualLine[];
        manualUnpaid = lines.filter((m) => m.status !== "paid").reduce((s, m) => s + m.amount, 0);
      } catch {}
    }

    const owed_now = vatUnpaid + ctUnpaid + manualUnpaid;
    const cash_after_tax = cash_total - owed_now;

    const openInvoices = openInvoicesRes.invoices ?? [];
    const overdueInvoices = overdueInvoicesRes.invoices ?? [];

    const invoices_total_owed_to_you = openInvoices.reduce(
      (s, i) => s + parseAmount(i.total_value),
      0
    ) + overdueInvoices.reduce((s, i) => s + parseAmount(i.total_value), 0);

    const invoices_overdue_count = overdueInvoices.length;
    const invoices_overdue_total = overdueInvoices.reduce(
      (s, i) => s + parseAmount(i.total_value),
      0
    );

    return NextResponse.json<DashboardStats>({
      connected: true,
      cash_total,
      cash_after_tax,
      owed_now,
      invoices_total_owed_to_you,
      invoices_overdue_count,
      invoices_overdue_total,
      receipts_pending_count,
      documents_total,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err, 500, "Could not load dashboard stats.");
  }
}
