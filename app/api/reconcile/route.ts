import { NextResponse } from "next/server";
import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { api as monzoApi, isConnected as monzoConnected, type MonzoApiError } from "@/app/lib/monzo";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// Three-way reconciliation across Monzo (source of truth for bank),
// FreeAgent (source of truth for books), and Gmail/Supabase receipts.
//
// Default window: 90 days. Pass ?days=365 (etc.) to widen.
// Matching: amount within £0.01 + date within ±2 days for bank-to-bank,
// ±7 days for receipt-to-bank.

export const maxDuration = 300;

type MonzoAccount = { id: string; closed: boolean; type: string };
type MonzoTxn = {
  id: string;
  created: string;       // ISO
  amount: number;        // pence, signed
  currency: string;
  description: string;
  merchant?: { name?: string } | null;
  notes?: string;
};
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

type MatchedMonzoFaItem = {
  date: string;
  amount: number;
  monzo_desc: string;
  fa_desc: string;
};
type OnlyInMonzoItem = {
  monzo_id: string;
  date: string;
  amount: number;
  description: string;
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
  monzo_connected: boolean;
  fa_connected: boolean;
  monzo_sca_required?: boolean;
  totals: {
    monzo_txns: number;
    fa_txns: number;
    receipts: number;
    matched_monzo_fa: number;
    only_in_monzo: number;
    only_in_fa: number;
    receipts_matched_to_bank: number;
    orphan_receipts: number;
  };
  samples: {
    matched: MatchedMonzoFaItem[];
    only_in_monzo: OnlyInMonzoItem[];
    only_in_fa: OnlyInFaItem[];
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
      monzo_connected: false,
      fa_connected: false,
      totals: {
        monzo_txns: 0, fa_txns: 0, receipts: 0,
        matched_monzo_fa: 0, only_in_monzo: 0, only_in_fa: 0,
        receipts_matched_to_bank: 0, orphan_receipts: 0,
      },
      samples: { matched: [], only_in_monzo: [], only_in_fa: [], orphan_receipts: [] },
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

    // -- Monzo: pull current-account transactions --
    const monzoTxns: MonzoTxn[] = [];
    if (await monzoConnected()) {
      report.monzo_connected = true;
      try {
        const acc = await monzoApi<{ accounts: MonzoAccount[] }>("/accounts");
        const active = acc.accounts.find((a) => !a.closed);
        if (active) {
          // Monzo /transactions max 100 per page; paginate via since= cursor
          let since = cutoffISO;
          for (let i = 0; i < 50; i++) {
            const tr = await monzoApi<{ transactions: MonzoTxn[] }>(
              `/transactions?account_id=${active.id}&since=${encodeURIComponent(since)}&limit=100&expand[]=merchant`
            );
            const t = tr.transactions ?? [];
            if (t.length === 0) break;
            monzoTxns.push(...t);
            if (t.length < 100) break;
            since = t[t.length - 1].created;
          }
        }
      } catch (err) {
        if ((err as MonzoApiError)?.code === "sca_required") {
          report.monzo_sca_required = true;
        }
      }
    }
    report.totals.monzo_txns = monzoTxns.length;

    // -- Receipts from Supabase --
    const { data: rcs } = await db()
      .from("receipts")
      .select("id, supplier, supply_date, gross_total, source_ref")
      .gte("created_at", cutoffISO);
    const receipts: Receipt[] = (rcs ?? []) as Receipt[];
    report.totals.receipts = receipts.length;

    // -- Match Monzo ↔ FA --
    // Normalise: Monzo amount = pence signed; convert to GBP signed.
    // FA amount = string of signed pounds.
    type NMonzo = { id: string; date: string; amount: number; description: string; matched: boolean };
    type NFa    = { url: string; date: string; amount: number; description: string; matched: boolean };

    const mNorm: NMonzo[] = monzoTxns.map((m) => ({
      id: m.id,
      date: m.created.slice(0, 10),
      amount: m.amount / 100,
      description: m.merchant?.name ?? m.description ?? "",
      matched: false,
    }));
    const fNorm: NFa[] = faTxns.map((f) => ({
      url: f.url,
      date: f.dated_on,
      amount: parseAmount(f.amount),
      description: f.full_description ?? f.description,
      matched: false,
    }));

    // For each Monzo txn, find best FA match (exact amount, ≤2 days apart)
    for (const m of mNorm) {
      let best: NFa | null = null;
      let bestGap = Infinity;
      for (const f of fNorm) {
        if (f.matched) continue;
        if (Math.abs(f.amount - m.amount) > 0.01) continue;
        const gap = daysBetween(m.date, f.date);
        if (gap > 2) continue;
        if (gap < bestGap) { best = f; bestGap = gap; }
      }
      if (best) {
        m.matched = true;
        best.matched = true;
      }
    }

    // -- Match receipts to (Monzo OR FA) by amount + date --
    let receiptsMatchedToBank = 0;
    const orphanReceipts: Receipt[] = [];
    for (const r of receipts) {
      if (!r.gross_total || !r.supply_date) {
        orphanReceipts.push(r);
        continue;
      }
      const target = new Date(r.supply_date).getTime();
      const matchesMonzo = mNorm.find((m) => Math.abs(Math.abs(m.amount) - r.gross_total!) < 0.01 && Math.abs(new Date(m.date).getTime() - target) <= 7 * 86400000);
      const matchesFa = fNorm.find((f) => Math.abs(Math.abs(f.amount) - r.gross_total!) < 0.01 && Math.abs(new Date(f.date).getTime() - target) <= 7 * 86400000);
      if (matchesMonzo || matchesFa) {
        receiptsMatchedToBank++;
      } else {
        orphanReceipts.push(r);
      }
    }

    report.totals.matched_monzo_fa = mNorm.filter((m) => m.matched).length;
    report.totals.only_in_monzo = mNorm.filter((m) => !m.matched).length;
    report.totals.only_in_fa = fNorm.filter((f) => !f.matched).length;
    report.totals.receipts_matched_to_bank = receiptsMatchedToBank;
    report.totals.orphan_receipts = orphanReceipts.length;

    // Samples for the UI
    report.samples.matched = mNorm.filter((m) => m.matched).slice(0, 10).map((m) => {
      const f = fNorm.find((f) => Math.abs(f.amount - m.amount) < 0.01 && daysBetween(m.date, f.date) <= 2);
      return { date: m.date, amount: m.amount, monzo_desc: m.description, fa_desc: f?.description ?? "?" };
    });
    report.samples.only_in_monzo = mNorm
      .filter((m) => !m.matched)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((m) => ({ monzo_id: m.id, date: m.date, amount: m.amount, description: m.description }));
    report.samples.only_in_fa = fNorm
      .filter((f) => !f.matched)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((f) => ({ fa_url: f.url, date: f.date, amount: f.amount, description: f.description }));
    report.samples.orphan_receipts = orphanReceipts
      .sort((a, b) => (b.supply_date ?? "").localeCompare(a.supply_date ?? ""))
      .slice(0, 20)
      .map((r) => ({ receipt_id: r.id, date: r.supply_date, amount: r.gross_total, supplier: r.supplier }));

    return NextResponse.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
