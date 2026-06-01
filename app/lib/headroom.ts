import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { db } from "@/app/lib/db";

// "How much can I safely pay myself right now?"
//
// Conservative back-of-envelope. NOT a substitute for an accountant's
// view of retained earnings/reserves — just a quick gut check.
//
// safe_dividend = max(0, cash_in_bank − tax_due_soon − operating_buffer)
//
// IMPORTANT — "tax_due_soon" means tax that genuinely needs paying out of
// today's cash: anything due in the next ~90 days, plus anything overdue in
// the last ~45 days. We deliberately EXCLUDE:
//   • far-future bills (e.g. Corporation Tax not due for many months) — you
//     don't need to lock up cash for those today; they show on the forecast.
//   • un-filed VAT estimates for periods that haven't been filed yet.
//   • "stale" overdue returns (>45 days past due) that FreeAgent still shows
//     as unpaid — almost always already paid by direct debit and never
//     reconciled in FA. We surface these separately as `stale_unpaid` so the
//     user can verify/mark-paid, rather than silently locking up headroom for
//     money that's probably already gone.
//
// This lives in lib/ (not the route) so the butler chat reads the SAME
// numbers via its financial_position tool — one source of truth.

type FaBank = {
  is_personal: boolean;
  status: string;
  current_balance: string;
  latest_activity_date?: string;
};
type FaVatPayment = { amount_due?: string; due_on?: string; status?: string };
type FaVatReturn = { status?: string; payments?: FaVatPayment[] };
type FaCt = { amount_due?: string; payment_status?: string; payment_due_on?: string };
type FaTxn = { amount: string; dated_on: string };
type ManualLine = { amount: number; status: string; due_on?: string | null };

const STALE_DAYS = 14;
const BUFFER_FLOOR = 2000;
const NEAR_FUTURE_MS = 90 * 86400000;  // count tax due within the next 90 days
const OVERDUE_GRACE_MS = 45 * 86400000; // ...and anything overdue in the last 45 days

const parseAmount = (s: string | undefined | null): number => {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export type DividendHeadroom = {
  cash_today: number;
  tax_owed: number;        // tax genuinely due soon / recently overdue
  stale_unpaid: number;    // older "unpaid" tax FA never marked paid (verify!)
  operating_buffer: number;
  safe_dividend: number;
  status: "comfortable" | "tight" | "negative";
  note: string;
  updated_at: string;
};

export async function getDividendHeadroom(): Promise<DividendHeadroom> {
  if (!(await faConnected())) {
    return {
      cash_today: 0, tax_owed: 0, stale_unpaid: 0, operating_buffer: BUFFER_FLOOR, safe_dividend: 0,
      status: "negative", note: "Connect FreeAgent first.", updated_at: new Date().toISOString(),
    };
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

  // Classify a liability by its due date: is it owed-soon, stale-overdue, or
  // far-future (ignored for "set aside now")?
  const dueClass = (dueOn?: string | null): "owed" | "stale" | "future" => {
    if (!dueOn) return "owed"; // no date → treat as currently owed (cautious)
    const t = new Date(dueOn).getTime();
    if (t > now + NEAR_FUTURE_MS) return "future";
    if (t < now - OVERDUE_GRACE_MS) return "stale";
    return "owed";
  };

  let tax_owed = 0;
  let stale_unpaid = 0;
  const add = (amt: number, dueOn?: string | null) => {
    if (amt < 0.01) return;
    const c = dueClass(dueOn);
    if (c === "owed") tax_owed += amt;
    else if (c === "stale") stale_unpaid += amt;
    // future: ignore (shows on the forecast, not reserved today)
  };

  // VAT — skip un-filed estimate periods; classify each unpaid payment by due date.
  const vat = await faApi<{ vat_returns: FaVatReturn[] }>("/vat_returns");
  for (const r of vat.vat_returns) {
    if (r.status === "unfiled") continue;
    for (const p of r.payments ?? []) {
      if (p.status === "marked_as_paid") continue;
      add(Math.abs(parseAmount(p.amount_due)), p.due_on);
    }
  }

  // Corporation Tax — classify by payment due date.
  const ct = await faApi<{ corporation_tax_returns: FaCt[] }>("/corporation_tax_returns");
  for (const r of ct.corporation_tax_returns) {
    if (r.payment_status === "marked_as_paid") continue;
    add(parseAmount(r.amount_due), r.payment_due_on);
  }

  // Manual liabilities (e.g. Self Assessment).
  const manualRow = await db().from("kv").select("value").eq("key", "manual_tax_liabilities").maybeSingle();
  if (manualRow.data) {
    try {
      const lines = JSON.parse(manualRow.data.value) as ManualLine[];
      for (const l of lines) {
        if (l.status === "paid") continue;
        add(l.amount, l.due_on ?? null);
      }
    } catch {}
  }

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

  tax_owed = Math.round(tax_owed);
  stale_unpaid = Math.round(stale_unpaid);
  const safe_dividend = Math.max(0, Math.round(cash - tax_owed - operating_buffer));

  const status: DividendHeadroom["status"] =
    safe_dividend >= 3000 ? "comfortable" :
    safe_dividend > 0     ? "tight" :
                            "negative";

  const staleNote = stale_unpaid > 500
    ? ` Heads up: FreeAgent also shows £${stale_unpaid.toLocaleString("en-GB")} of older tax as unpaid — if you've already paid those (e.g. by direct debit), mark them paid in FreeAgent so this stays accurate.`
    : "";

  const note =
    (status === "comfortable"
      ? `You could pay yourself a £${safe_dividend.toLocaleString("en-GB")} dividend now and still cover tax + a month's buffer.`
      : status === "tight"
        ? `Only £${safe_dividend.toLocaleString("en-GB")} of dividend headroom. Wait for the next invoice before drawing more.`
        : `No safe dividend right now — cash after tax due soon + a month's buffer is negative by £${Math.abs(cash - tax_owed - operating_buffer).toLocaleString("en-GB")}.`)
    + staleNote;

  return {
    cash_today: Math.round(cash),
    tax_owed,
    stale_unpaid,
    operating_buffer,
    safe_dividend,
    status,
    note,
    updated_at: new Date().toISOString(),
  };
}
