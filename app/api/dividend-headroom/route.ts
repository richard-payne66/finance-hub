import { NextResponse } from "next/server";
import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// "How much can I safely pay myself right now?"
//
// Conservative back-of-envelope. NOT a substitute for an accountant's
// view of retained earnings/reserves — just a quick gut check.
//
// safe_dividend = max(0, cash_in_bank − all_tax_owed − operating_buffer)
//
// operating_buffer defaults to 1 month's average operating spend (last
// 6 months) or £2,000 floor, whichever is higher.

type FaBank = {
  is_personal: boolean;
  status: string;
  current_balance: string;
  latest_activity_date?: string;
};
type FaVatPayment = { amount_due?: string; status?: string };
type FaVat = { payments?: FaVatPayment[] };
type FaCt = { amount_due?: string; payment_status?: string; filing_status?: string; period_ends_on?: string };
type FaTxn = { amount: string; dated_on: string };
type ManualLine = { amount: number; status: string };

const STALE_DAYS = 14;
const BUFFER_FLOOR = 2000;

const parseAmount = (s: string | undefined | null): number => {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export type DividendHeadroom = {
  cash_today: number;
  tax_owed: number;
  operating_buffer: number;
  safe_dividend: number;
  status: "comfortable" | "tight" | "negative";
  note: string;
  updated_at: string;
};

export async function GET() {
  try {
    if (!(await faConnected())) {
      return NextResponse.json<DividendHeadroom>({
        cash_today: 0, tax_owed: 0, operating_buffer: BUFFER_FLOOR, safe_dividend: 0,
        status: "negative", note: "Connect FreeAgent first.", updated_at: new Date().toISOString(),
      });
    }

    const banks = await faApi<{ bank_accounts: FaBank[] }>("/bank_accounts");
    const now = Date.now();
    const cash = banks.bank_accounts
      .filter((b) => !b.is_personal && b.status === "active")
      .filter((b) => {
        if (!b.latest_activity_date) return false;
        const days = (now - new Date(b.latest_activity_date).getTime()) / 86400000;
        return days <= STALE_DAYS;
      })
      .reduce((s, b) => s + parseAmount(b.current_balance), 0);

    // VAT + CT outstanding
    const vat = await faApi<{ vat_returns: FaVat[] }>("/vat_returns");
    const vatOwed = vat.vat_returns.flatMap((r) =>
      (r.payments ?? []).filter((p) => p.status !== "marked_as_paid")
    ).reduce((s, p) => s + Math.abs(parseAmount(p.amount_due)), 0);

    const ct = await faApi<{ corporation_tax_returns: FaCt[] }>("/corporation_tax_returns");
    const ctOwed = ct.corporation_tax_returns
      .filter((r) => r.payment_status !== "marked_as_paid")
      .filter((r) => {
        // Skip far-future draft estimates
        const isDraft = r.filing_status === "draft";
        const periodEnd = r.period_ends_on ? new Date(r.period_ends_on) : null;
        const isFuture = periodEnd ? periodEnd.getTime() > Date.now() - 30 * 86400000 : false;
        return !(isDraft && isFuture);
      })
      .reduce((s, r) => s + parseAmount(r.amount_due), 0);

    // Manual liabilities
    const manualRow = await db().from("kv").select("value").eq("key", "manual_tax_liabilities").maybeSingle();
    let manualOwed = 0;
    if (manualRow.data) {
      try {
        const lines = JSON.parse(manualRow.data.value) as ManualLine[];
        manualOwed = lines.filter((l) => l.status !== "paid").reduce((s, l) => s + l.amount, 0);
      } catch {}
    }

    const tax_owed = vatOwed + ctOwed + manualOwed;

    // Operating buffer: last 6 months' average monthly OUTGOINGS from primary account
    const primary = banks.bank_accounts.find((b) => !b.is_personal && b.status === "active");
    let avgMonthlyOut = 0;
    if (primary) {
      const cutoffISO = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const allOut: FaTxn[] = [];
      for (let page = 1; page <= 5; page++) {
        const r = await faApi<{ bank_transactions: FaTxn[] }>(
          `/bank_transactions?bank_account=${encodeURIComponent((primary as FaBank & { url: string }).url)}&per_page=50&page=${page}`
        );
        const txns = r.bank_transactions ?? [];
        for (const t of txns) {
          if (t.dated_on < cutoffISO) continue;
          const amt = parseAmount(t.amount);
          if (amt < 0) allOut.push(t);
        }
        if (txns.length < 50 || (txns[txns.length - 1]?.dated_on ?? "9999") < cutoffISO) break;
      }
      const totalOut = allOut.reduce((s, t) => s + Math.abs(parseAmount(t.amount)), 0);
      avgMonthlyOut = totalOut / 6;
    }
    const operating_buffer = Math.max(BUFFER_FLOOR, Math.round(avgMonthlyOut));

    const safe_dividend = Math.max(0, Math.round(cash - tax_owed - operating_buffer));

    const status: DividendHeadroom["status"] =
      safe_dividend >= 3000 ? "comfortable" :
      safe_dividend > 0     ? "tight" :
                              "negative";

    const note =
      status === "comfortable"
        ? `You could pay yourself a £${safe_dividend.toLocaleString("en-GB")} dividend now and still cover tax + a month's buffer.`
        : status === "tight"
          ? `Only £${safe_dividend.toLocaleString("en-GB")} of dividend headroom. Wait for the next invoice before drawing more.`
          : `No safe dividend right now — cash after tax + buffer is negative by £${Math.abs(cash - tax_owed - operating_buffer).toLocaleString("en-GB")}.`;

    return NextResponse.json<DividendHeadroom>({
      cash_today: Math.round(cash),
      tax_owed: Math.round(tax_owed),
      operating_buffer,
      safe_dividend,
      status,
      note,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
