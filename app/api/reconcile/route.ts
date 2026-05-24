import { NextResponse } from "next/server";
import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// Two-way reconciliation: FreeAgent bank transactions ↔ Receipts.
// (Monzo direct integration was removed — FA's bank feed already pulls
// every Monzo transaction, so we don't need Monzo as a separate source.)
//
// Default window: 90 days. Pass ?days=365 (etc.) to widen.

export const maxDuration = 300;

type FaTxn = {
  url: string;
  amount: string;
  dated_on: string;
  description: string;
  full_description?: string;
};

type Receipt = {
  id: string;
  supplier: string | null;
  supply_date: string | null;
  gross_total: number | null;
  source_ref: string | null;
};

type FaTxnMatched = {
  fa_url: string;
  date: string;
  amount: number;
  description: string;
  has_receipt: boolean;
};
type MatchedSample = {
  date: string;
  amount: number;
  fa_desc: string;
  receipt_supplier: string | null;
};
type OnlyInFaItem = {
  fa_url: string;
  date: string;
  amount: number;
  description: string;
};
type OrphanReceiptItem = {
  receipt_id: string;
  date: string | null;
  amount: number | null;
  supplier: string | null;
};

export type ReconcileReport = {
  window_days: number;
  fa_connected: boolean;
  totals: {
    fa_txns: number;
    receipts: number;
    receipts_matched_to_bank: number;
    fa_with_receipt: number;
    orphan_receipts: number;
    fa_without_receipt: number;
  };
  samples: {
    matched: MatchedSample[];
    fa_without_receipt: OnlyInFaItem[];
    orphan_receipts: OrphanReceiptItem[];
  };
  generated_at: string;
};

function parseAmount(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const windowDays = Math.max(7, Math.min(parseInt(url.searchParams.get("days") ?? "90"), 730));
    const cutoffMs = Date.now() - windowDays * 86400000;
    const cutoffISO = new Date(cutoffMs).toISOString();
    const cutoffDate = cutoffISO.slice(0, 10);

    const report: ReconcileReport = {
      window_days: windowDays,
      fa_connected: false,
      totals: {
        fa_txns: 0,
        receipts: 0,
        receipts_matched_to_bank: 0,
        fa_with_receipt: 0,
        orphan_receipts: 0,
        fa_without_receipt: 0,
      },
      samples: { matched: [], fa_without_receipt: [], orphan_receipts: [] },
      generated_at: new Date().toISOString(),
    };

    // -- FreeAgent: pull all bank_transactions on primary business account --
    const faTxns: FaTxn[] = [];
    if (await faConnected()) {
      report.fa_connected = true;
      const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string; is_primary?: boolean }> }>("/bank_accounts");
      const primary = banks.bank_accounts.find((b) => !b.is_personal && b.status === "active" && b.is_primary);
      if (primary) {
        for (let page = 1; page <= 30; page++) {
          const r = await faApi<{ bank_transactions: FaTxn[] }>(
            `/bank_transactions?bank_account=${encodeURIComponent(primary.url)}&from_date=${cutoffDate}&per_page=50&page=${page}`
          );
          const t = r.bank_transactions ?? [];
          faTxns.push(...t);
          if (t.length < 50) break;
        }
      }
    }
    report.totals.fa_txns = faTxns.length;

    // -- Receipts from Supabase --
    const { data: rcs } = await db()
      .from("receipts")
      .select("id, supplier, supply_date, gross_total, source_ref")
      .gte("created_at", cutoffISO);
    const receipts: Receipt[] = (rcs ?? []) as Receipt[];
    report.totals.receipts = receipts.length;

    // Normalise FA
    const fNorm: FaTxnMatched[] = faTxns.map((f) => ({
      fa_url: f.url,
      date: f.dated_on,
      amount: parseAmount(f.amount),
      description: f.full_description ?? f.description,
      has_receipt: false,
    }));

    const orphanReceipts: Receipt[] = [];
    const matchedSamples: MatchedSample[] = [];

    // For each receipt, try to find a matching FA transaction (exact amount, ±7 days)
    for (const r of receipts) {
      if (!r.gross_total || !r.supply_date) {
        orphanReceipts.push(r);
        continue;
      }
      const target = new Date(r.supply_date).getTime();
      const matchIndex = fNorm.findIndex(
        (f) =>
          !f.has_receipt &&
          Math.abs(Math.abs(f.amount) - r.gross_total!) < 0.01 &&
          Math.abs(new Date(f.date).getTime() - target) <= 7 * 86400000
      );

      if (matchIndex >= 0) {
        fNorm[matchIndex].has_receipt = true;
        report.totals.receipts_matched_to_bank++;
        if (matchedSamples.length < 10) {
          matchedSamples.push({
            date: fNorm[matchIndex].date,
            amount: fNorm[matchIndex].amount,
            fa_desc: fNorm[matchIndex].description,
            receipt_supplier: r.supplier,
          });
        }
      } else {
        orphanReceipts.push(r);
      }
    }

    report.totals.fa_with_receipt = fNorm.filter((f) => f.has_receipt).length;
    report.totals.fa_without_receipt = fNorm.filter((f) => !f.has_receipt && f.amount < 0).length;
    report.totals.orphan_receipts = orphanReceipts.length;

    report.samples.matched = matchedSamples;
    report.samples.fa_without_receipt = fNorm
      .filter((f) => !f.has_receipt && f.amount < 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((f) => ({ fa_url: f.fa_url, date: f.date, amount: f.amount, description: f.description }));
    report.samples.orphan_receipts = orphanReceipts
      .sort((a, b) => (b.supply_date ?? "").localeCompare(a.supply_date ?? ""))
      .slice(0, 20)
      .map((r) => ({ receipt_id: r.id, date: r.supply_date, amount: r.gross_total, supplier: r.supplier }));

    // Suppress unused-locals
    void daysBetween;

    return NextResponse.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
