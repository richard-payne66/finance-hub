import { NextResponse } from "next/server";
import { api as faApi, isConnected } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

// READ-ONLY diagnostic. Lists every VAT + Corporation Tax return FreeAgent
// shows as NOT paid, alongside the actual HMRC payments found in the bank
// feed (the Monzo business account), and tries to match them up. Nothing is
// written. Used to decide what can safely be marked paid for the accountant
// handover.

export const maxDuration = 120;
export const dynamic = "force-dynamic";

type FaBank = { url: string; is_personal: boolean; status: string };
type FaVatPayment = { amount_due?: string; due_on?: string; status?: string };
type FaVatReturn = { url?: string; status?: string; period_starts_on?: string; period_ends_on?: string; payments?: FaVatPayment[] };
type FaCt = { url?: string; amount_due?: string; payment_status?: string; payment_due_on?: string; period_ends_on?: string; filing_status?: string };
type FaTxn = { url: string; amount: string; dated_on: string; description?: string; full_description?: string; is_manual?: boolean; bank_account?: string };

const num = (s?: string | null) => { const n = parseFloat(s ?? ""); return Number.isFinite(n) ? n : 0; };
const daysApart = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

export async function GET() {
  try {
    if (!(await isConnected())) return NextResponse.json({ connected: false });

    const banks = await faApi<{ bank_accounts: FaBank[] }>("/bank_accounts");
    const business = banks.bank_accounts.filter((b) => !b.is_personal && b.status === "active");

    // --- Unpaid VAT ---
    const vat = await faApi<{ vat_returns: FaVatReturn[] }>("/vat_returns");
    const unpaidVat = vat.vat_returns.flatMap((r) =>
      (r.payments ?? [])
        .filter((p) => p.status !== "marked_as_paid")
        .map((p) => ({
          kind: "VAT" as const,
          period: `${r.period_starts_on ?? "?"} → ${r.period_ends_on ?? "?"}`,
          amount: num(p.amount_due),
          due_on: p.due_on ?? null,
          status: p.status ?? null,
          return_status: r.status ?? null,
          ref: r.url ?? null,
        }))
        .filter((x) => Math.abs(x.amount) > 0.01)
    );

    // --- Unpaid Corporation Tax ---
    const ct = await faApi<{ corporation_tax_returns: FaCt[] }>("/corporation_tax_returns");
    const unpaidCt = ct.corporation_tax_returns
      .filter((r) => r.payment_status !== "marked_as_paid" && num(r.amount_due) > 0.01)
      .map((r) => ({
        kind: "CT" as const,
        period: `→ ${r.period_ends_on ?? "?"}`,
        amount: num(r.amount_due),
        due_on: r.payment_due_on ?? null,
        status: r.payment_status ?? null,
        return_status: r.filing_status ?? null,
        ref: r.url ?? null,
      }));

    // --- HMRC payments in the bank feed (last ~3y) ---
    const hmrcRe = /hmrc|cumbernauld|shipley|gov\.?uk|revenue|vat|paye|corporation tax|self assessment/i;
    const payments: Array<{ date: string; amount: number; description: string; bank: string; explained: boolean; url: string }> = [];
    for (const b of business) {
      for (let page = 1; page <= 12; page++) {
        const r = await faApi<{ bank_transactions: FaTxn[] }>(
          `/bank_transactions?bank_account=${encodeURIComponent(b.url)}&per_page=100&page=${page}`
        );
        const txns = r.bank_transactions ?? [];
        for (const t of txns) {
          const desc = `${t.description ?? ""} ${t.full_description ?? ""}`.trim();
          if (hmrcRe.test(desc)) {
            payments.push({
              date: t.dated_on,
              amount: num(t.amount),
              description: desc.slice(0, 120),
              bank: b.url,
              explained: false, // explanation status filled below if cheap; left false here
              url: t.url,
            });
          }
        }
        if (txns.length < 100) break;
      }
    }
    payments.sort((a, b) => (a.date < b.date ? 1 : -1));

    // --- Naive match: for each unpaid item, candidate payments within £1 and 60 days of due ---
    const unpaid = [...unpaidVat, ...unpaidCt];
    const matches = unpaid.map((u) => {
      const cands = payments.filter(
        (p) => Math.abs(Math.abs(p.amount) - Math.abs(u.amount)) <= 1 && (!u.due_on || daysApart(p.date, u.due_on) <= 75)
      );
      return { ...u, candidate_payments: cands };
    });

    return NextResponse.json({
      connected: true,
      summary: {
        unpaid_count: unpaid.length,
        unpaid_total: Math.round(unpaid.reduce((s, u) => s + Math.abs(u.amount), 0)),
        hmrc_payments_found: payments.length,
        matched: matches.filter((m) => m.candidate_payments.length > 0).length,
        unmatched: matches.filter((m) => m.candidate_payments.length === 0).length,
      },
      matches,
      all_hmrc_payments: payments,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
