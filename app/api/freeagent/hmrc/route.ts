import { NextResponse } from "next/server";
import { api, isConnected } from "@/app/lib/freeagent";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// ---- FreeAgent response shapes (only the fields we need) ----

type VatPayment = {
  label?: string;
  amount_due?: string;
  due_on?: string;
  status?: string; // 'marked_as_paid' | 'unpaid' | ...
};

type VatReturn = {
  url: string;
  filing_status?: string;
  period_starts_on?: string;
  period_ends_on?: string;
  filing_due_on?: string;
  filed_at?: string;
  payments?: VatPayment[];
};

type CTReturn = {
  url: string;
  amount_due?: string;
  payment_status?: string; // 'unpaid' | 'marked_as_paid'
  filing_status?: string;  // 'draft' | 'final' | etc
  payment_due_on?: string;
  filing_due_on?: string;
  period_starts_on?: string;
  period_ends_on?: string;
};

export type Bucket = "owed_now" | "upcoming_estimate" | "paid";

export type HmrcLine = {
  kind: "VAT" | "Corporation Tax" | "Self Assessment" | "PAYE" | "Other";
  bucket: Bucket;
  amount: number;           // £, positive = you owe (or paid)
  due_on: string | null;
  paid_on: string | null;
  period_label: string;
  status: string;
  source: "FreeAgent" | "Manual";
  ref?: string | null;       // FA URL or manual ID
};

export type HmrcSummary = {
  connected: boolean;
  owed_now_total: number;
  upcoming_total: number;
  paid_ytd_total: number;
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
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function fmtPeriod(start?: string, end?: string): string {
  if (!start || !end) return "—";
  const s = new Date(start).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  const e = new Date(end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  return `${s} – ${e}`;
}

// Manual liabilities — things FA doesn't track via API (Self Assessment, etc.)
// Stored as a single kv row.
type ManualLine = {
  id: string;
  kind: HmrcLine["kind"];
  amount: number;
  due_on: string | null;
  paid_on: string | null;
  period_label: string;
  status: string; // 'unpaid' | 'paid'
  note?: string;
};

async function loadManualLines(): Promise<ManualLine[]> {
  const { data } = await db().from("kv").select("value").eq("key", "manual_tax_liabilities").maybeSingle();
  if (!data) return [];
  try { return JSON.parse(data.value) as ManualLine[]; } catch { return []; }
}

export async function GET() {
  try {
    const manual = await loadManualLines();

    if (!(await isConnected())) {
      return NextResponse.json<HmrcSummary>({
        connected: false,
        owed_now_total: 0,
        upcoming_total: 0,
        paid_ytd_total: 0,
        lines: manualToLines(manual),
        next_due_on: null,
        next_due_days: null,
        updated_at: new Date().toISOString(),
      });
    }

    const lines: HmrcLine[] = [];

    // --- VAT ---
    const vatRes = await api<{ vat_returns: VatReturn[] }>("/vat_returns");
    for (const r of vatRes.vat_returns) {
      for (const p of r.payments ?? []) {
        const amount = parseAmount(p.amount_due);
        if (Math.abs(amount) < 0.01) continue;
        const isRefund = amount < 0;
        const paid = p.status === "marked_as_paid";
        lines.push({
          kind: "VAT",
          bucket: paid ? "paid" : "owed_now",
          amount: Math.abs(amount),
          due_on: p.due_on ?? r.filing_due_on ?? null,
          paid_on: paid ? (r.filed_at ?? null) : null,
          period_label: fmtPeriod(r.period_starts_on, r.period_ends_on) + (isRefund ? " (refund)" : ""),
          status: paid ? "paid" : (r.filing_status ?? "outstanding"),
          source: "FreeAgent",
          ref: r.url,
        });
      }
    }

    // --- Corporation Tax ---
    const ctRes = await api<{ corporation_tax_returns: CTReturn[] }>("/corporation_tax_returns");
    for (const r of ctRes.corporation_tax_returns) {
      const amount = parseAmount(r.amount_due);
      if (amount < 0.01) continue;
      const paid = r.payment_status === "marked_as_paid";
      // CT returns in 'draft' status are FA's projection for an ongoing/future year — not yet filed
      const isDraftEstimate = r.filing_status === "draft" && !paid;
      const periodEnd = r.period_ends_on ? new Date(r.period_ends_on) : null;
      const isFutureOrCurrent = periodEnd ? periodEnd.getTime() > Date.now() - 30 * 86400000 : false;
      lines.push({
        kind: "Corporation Tax",
        bucket: paid ? "paid" : (isDraftEstimate && isFutureOrCurrent ? "upcoming_estimate" : "owed_now"),
        amount,
        due_on: r.payment_due_on ?? null,
        paid_on: null,
        period_label: fmtPeriod(r.period_starts_on, r.period_ends_on),
        status: paid ? "paid" : (r.filing_status ?? "outstanding"),
        source: "FreeAgent",
        ref: r.url,
      });
    }

    // --- Manual lines (Self Assessment, PAYE, etc.) ---
    lines.push(...manualToLines(manual));

    // --- Totals ---
    const owed = lines.filter((l) => l.bucket === "owed_now");
    const upcoming = lines.filter((l) => l.bucket === "upcoming_estimate");
    const paid_ytd = lines.filter((l) => {
      if (l.bucket !== "paid" || !l.paid_on) return false;
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      return new Date(l.paid_on) > yearAgo;
    });

    const owed_now_total = owed.reduce((s, l) => s + l.amount, 0);
    const upcoming_total = upcoming.reduce((s, l) => s + l.amount, 0);
    const paid_ytd_total = paid_ytd.reduce((s, l) => s + l.amount, 0);

    const nextDue = owed
      .filter((l) => l.due_on)
      .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))[0];

    // Sort lines: owed first (by due date), then upcoming (by due date), then paid (newest first)
    lines.sort((a, b) => {
      const bucketOrder = { owed_now: 0, upcoming_estimate: 1, paid: 2 };
      if (bucketOrder[a.bucket] !== bucketOrder[b.bucket]) return bucketOrder[a.bucket] - bucketOrder[b.bucket];
      if (a.bucket === "paid") return (b.paid_on ?? "").localeCompare(a.paid_on ?? "");
      return (a.due_on ?? "").localeCompare(b.due_on ?? "");
    });

    return NextResponse.json<HmrcSummary>({
      connected: true,
      owed_now_total,
      upcoming_total,
      paid_ytd_total,
      lines,
      next_due_on: nextDue?.due_on ?? null,
      next_due_days: nextDue ? daysFromNow(nextDue.due_on) : null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err, 500, "Could not load FreeAgent data.");
  }
}

function manualToLines(manual: ManualLine[]): HmrcLine[] {
  return manual.map((m) => ({
    kind: m.kind,
    bucket: m.status === "paid" ? ("paid" as Bucket) : ("owed_now" as Bucket),
    amount: m.amount,
    due_on: m.due_on,
    paid_on: m.paid_on,
    period_label: m.period_label,
    status: m.status,
    source: "Manual",
    ref: m.id,
  }));
}
