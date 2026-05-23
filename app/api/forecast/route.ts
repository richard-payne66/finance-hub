import { NextResponse } from "next/server";
import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { api as mzApi, isConnected as mzConnected, type MonzoApiError } from "@/app/lib/monzo";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// One simple question: 12 months from now, will I be OK?
// Forecast = current cash + invoices due to land - HMRC bills due to leave.
// Doesn't predict future revenue or spend — only what we already know is
// coming. Honest, simple, useful.

export type ForecastEvent = {
  date: string;          // ISO date
  label: string;
  amount: number;        // positive = money in, negative = money out
  kind: "vat" | "corp_tax" | "self_assessment" | "invoice" | "other";
};

export type Forecast = {
  cash_today: number;
  cash_in_3mo: number;
  cash_in_6mo: number;
  cash_in_12mo: number;
  total_payments_out_12mo: number;
  total_payments_in_12mo: number;
  events: ForecastEvent[];   // upcoming, chronological
  status: "comfortable" | "tight" | "at_risk";
  status_note: string;
  data_sources: {
    freeagent: boolean;
    monzo: boolean;
  };
  updated_at: string;
};

const parseAmount = (s: string | undefined | null): number => {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const STALE_DAYS = 14;

export async function GET() {
  try {
    const events: ForecastEvent[] = [];
    let cashToday = 0;
    const sources = { freeagent: false, monzo: false };

    // -- Cash today: FA banks (fresh) + Monzo accounts/pots --
    if (await faConnected()) {
      sources.freeagent = true;
      try {
        const banks = await faApi<{ bank_accounts: Array<{
          is_personal: boolean;
          status: string;
          current_balance: string;
          latest_activity_date?: string;
        }> }>("/bank_accounts");

        const now = Date.now();
        cashToday += banks.bank_accounts
          .filter((b) => !b.is_personal && b.status === "active")
          .filter((b) => {
            // Only fresh accounts in the forecast — stale numbers are worse than no number
            if (!b.latest_activity_date) return false;
            const days = (now - new Date(b.latest_activity_date).getTime()) / 86400000;
            return days <= STALE_DAYS;
          })
          .reduce((s, b) => s + parseAmount(b.current_balance), 0);

        // -- Upcoming HMRC payments --
        const vat = await faApi<{ vat_returns: Array<{
          period_starts_on?: string;
          period_ends_on?: string;
          payments?: Array<{ amount_due?: string; due_on?: string; status?: string }>;
        }> }>("/vat_returns");
        for (const r of vat.vat_returns) {
          for (const p of r.payments ?? []) {
            const amt = parseAmount(p.amount_due);
            if (Math.abs(amt) < 0.01) continue;
            if (p.status === "marked_as_paid") continue;
            if (!p.due_on) continue;
            // Only future bills
            if (new Date(p.due_on).getTime() < now - 86400000) continue;
            events.push({
              date: p.due_on,
              label: `VAT — ${r.period_ends_on ?? "outstanding"}`,
              amount: -Math.abs(amt),
              kind: "vat",
            });
          }
        }

        const ct = await faApi<{ corporation_tax_returns: Array<{
          amount_due?: string;
          payment_status?: string;
          filing_status?: string;
          payment_due_on?: string;
          period_ends_on?: string;
        }> }>("/corporation_tax_returns");
        for (const r of ct.corporation_tax_returns) {
          const amt = parseAmount(r.amount_due);
          if (amt < 0.01) continue;
          if (r.payment_status === "marked_as_paid") continue;
          if (!r.payment_due_on) continue;
          if (new Date(r.payment_due_on).getTime() < now - 86400000) continue;
          // Skip far-future draft estimates (>14 months out)
          if (new Date(r.payment_due_on).getTime() > now + 14 * 30 * 86400000) continue;
          events.push({
            date: r.payment_due_on,
            label: `Corp Tax — YE ${r.period_ends_on ?? ""}` + (r.filing_status === "draft" ? " (est.)" : ""),
            amount: -amt,
            kind: "corp_tax",
          });
        }

        // -- Upcoming invoice receipts --
        const openInv = await faApi<{ invoices: Array<{ total_value: string; due_on?: string }> }>("/invoices?view=open");
        const overdueInv = await faApi<{ invoices: Array<{ total_value: string; due_on?: string }> }>("/invoices?view=overdue");
        for (const i of [...openInv.invoices, ...overdueInv.invoices]) {
          const amt = parseAmount(i.total_value);
          if (amt < 0.01 || !i.due_on) continue;
          events.push({
            date: i.due_on,
            label: "Invoice payment due",
            amount: amt,
            kind: "invoice",
          });
        }
      } catch (e) {
        // FA error — just degrade gracefully
        console.error("Forecast FA error:", e);
      }
    }

    // Monzo pots (additive to cashToday — but DON'T double-count if FA also
    // tracks them; we already filter FA pots that are stale, so live Monzo
    // pots become the source of truth.)
    if (await mzConnected()) {
      try {
        const accounts = await mzApi<{ accounts: Array<{ id: string; closed: boolean }> }>("/accounts");
        for (const a of accounts.accounts.filter((a) => !a.closed)) {
          const bal = await mzApi<{ total_balance: number }>(`/balance?account_id=${a.id}`);
          // total_balance includes pots
          // Replace FA contribution for Monzo accounts: simplest is to NOT add
          // again (Monzo is reflected in FA's Monzo Main bank account balance,
          // which we already added). But Monzo POTS specifically aren't in FA
          // current_balance — they're separate FA accounts that may be stale.
          // For v1, just trust the FA bank totals and use Monzo only for the
          // pots tile elsewhere. Skipping additive logic here to avoid double-counting.
          void bal;
        }
        sources.monzo = true;
      } catch (e) {
        if ((e as MonzoApiError)?.code !== "sca_required") {
          console.error("Forecast Monzo error:", e);
        }
      }
    }

    // -- Manual tax liabilities (Self Assessment, etc.) --
    const manualRow = await db().from("kv").select("value").eq("key", "manual_tax_liabilities").maybeSingle();
    if (manualRow.data) {
      try {
        const lines = JSON.parse(manualRow.data.value) as Array<{
          kind: string; amount: number; due_on: string | null; status: string; period_label: string;
        }>;
        const now = Date.now();
        for (const l of lines) {
          if (l.status === "paid") continue;
          if (!l.due_on) continue;
          if (new Date(l.due_on).getTime() < now - 86400000) continue;
          events.push({
            date: l.due_on,
            label: `${l.kind} — ${l.period_label}`,
            amount: -l.amount,
            kind: l.kind.toLowerCase().includes("self") ? "self_assessment" : "other",
          });
        }
      } catch {}
    }

    // Sort chronologically
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Project cash position at 3/6/12 months
    const now = Date.now();
    const cumAt = (months: number) => {
      const cutoff = now + months * 30 * 86400000;
      return cashToday + events
        .filter((e) => new Date(e.date).getTime() <= cutoff)
        .reduce((s, e) => s + e.amount, 0);
    };

    const cash_in_3mo  = cumAt(3);
    const cash_in_6mo  = cumAt(6);
    const cash_in_12mo = cumAt(12);

    const total_payments_out_12mo = events
      .filter((e) => e.amount < 0 && new Date(e.date).getTime() <= now + 365 * 86400000)
      .reduce((s, e) => s - e.amount, 0);
    const total_payments_in_12mo = events
      .filter((e) => e.amount > 0 && new Date(e.date).getTime() <= now + 365 * 86400000)
      .reduce((s, e) => s + e.amount, 0);

    // Status
    let status: Forecast["status"] = "comfortable";
    let status_note = "All upcoming tax bills are covered.";
    if (cash_in_12mo < 0) {
      status = "at_risk";
      status_note = `You'll be £${Math.abs(cash_in_12mo).toLocaleString("en-GB")} short over the next year if nothing else comes in.`;
    } else if (cash_in_12mo < total_payments_out_12mo * 0.25) {
      status = "tight";
      status_note = "Things get tight — keep saving and chase outstanding invoices.";
    } else if (cash_in_12mo === cashToday && events.length === 0) {
      status = "comfortable";
      status_note = "No upcoming bills logged.";
    }

    return NextResponse.json<Forecast>({
      cash_today: cashToday,
      cash_in_3mo,
      cash_in_6mo,
      cash_in_12mo,
      total_payments_out_12mo,
      total_payments_in_12mo,
      events: events.slice(0, 12), // cap at 12 events for UI
      status,
      status_note,
      data_sources: sources,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err, 500, "Could not load forecast.");
  }
}
