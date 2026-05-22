import { NextResponse } from "next/server";
import { api, isConnected } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

// ---- FreeAgent response shapes (only the fields we need) ----

type VatReturn = {
  url: string;
  status: "Draft" | "Open" | "Submitted" | "Locked" | string;
  liability?: string;
  filing_due_on?: string;
  payment_due_on?: string;
  period_starts_on?: string;
  period_ends_on?: string;
};

type CTReturn = {
  url: string;
  status: string;
  total_amount_due?: string;
  filing_due_on?: string;
  payment_due_on?: string;
  accounting_period_starts_on?: string;
  accounting_period_ends_on?: string;
};

type HmrcLine = {
  kind: "VAT" | "Corporation Tax" | "PAYE";
  amount: number;       // £, positive = you owe
  due_on: string | null; // ISO date or null
  period_label: string;
  status: string;
};

export type HmrcSummary = {
  connected: boolean;
  total: number;
  lines: HmrcLine[];
  next_due_on: string | null;
  next_due_days: number | null;
  updated_at: string;
};

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function fmtPeriod(start?: string, end?: string): string {
  if (!start || !end) return "—";
  const s = new Date(start).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  const e = new Date(end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  return `${s} – ${e}`;
}

export async function GET() {
  try {
    if (!(await isConnected())) {
      return NextResponse.json<HmrcSummary>({
        connected: false,
        total: 0,
        lines: [],
        next_due_on: null,
        next_due_days: null,
        updated_at: new Date().toISOString(),
      });
    }

    // --- VAT: find the most recent unfiled / outstanding return ---
    const vatRes = await api<{ vat_returns: VatReturn[] }>("/vat_returns");
    const vatOutstanding = vatRes.vat_returns
      .filter((r) => r.status !== "Submitted" && r.status !== "Locked" && parseAmount(r.liability) !== 0)
      .sort((a, b) => (a.period_ends_on ?? "").localeCompare(b.period_ends_on ?? ""))[0];

    // --- Corporation Tax: outstanding payable returns ---
    const ctRes = await api<{ corporation_tax_returns: CTReturn[] }>("/corporation_tax_returns");
    const ctOutstanding = ctRes.corporation_tax_returns
      .filter((r) => parseAmount(r.total_amount_due) > 0 && r.payment_due_on)
      .filter((r) => !r.payment_due_on || new Date(r.payment_due_on).getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000)
      .sort((a, b) => (a.payment_due_on ?? "").localeCompare(b.payment_due_on ?? ""));

    const lines: HmrcLine[] = [];

    if (vatOutstanding) {
      lines.push({
        kind: "VAT",
        amount: parseAmount(vatOutstanding.liability),
        due_on: vatOutstanding.payment_due_on ?? vatOutstanding.filing_due_on ?? null,
        period_label: fmtPeriod(vatOutstanding.period_starts_on, vatOutstanding.period_ends_on),
        status: vatOutstanding.status,
      });
    }

    for (const ct of ctOutstanding) {
      lines.push({
        kind: "Corporation Tax",
        amount: parseAmount(ct.total_amount_due),
        due_on: ct.payment_due_on ?? null,
        period_label: fmtPeriod(ct.accounting_period_starts_on, ct.accounting_period_ends_on),
        status: ct.status,
      });
    }

    const total = lines.reduce((s, l) => s + l.amount, 0);
    const nextDue = lines
      .filter((l) => l.due_on)
      .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))[0];

    return NextResponse.json<HmrcSummary>({
      connected: true,
      total,
      lines,
      next_due_on: nextDue?.due_on ?? null,
      next_due_days: nextDue ? daysFromNow(nextDue.due_on) : null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err, 500, "Could not load FreeAgent data.");
  }
}
