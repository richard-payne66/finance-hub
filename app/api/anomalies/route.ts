import { NextResponse } from "next/server";
import { api as faApi, isConnected } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

// Heuristic anomaly detection — runs cheap pattern matching across
// recent FreeAgent bank transactions. Looks for:
//
//   1. Big unusual outgoings  — > 2x the user's own median outgoing
//   2. Recurring supplier MIA — a vendor that paid/charged like clockwork
//                                hasn't shown up in expected window
//   3. Duplicate-looking      — same amount, same supplier-ish, within 7 days
//   4. New supplier           — first seen in last 30 days, > £100
//
// Returns plain-English anomaly list. Calm, not alarmist.

type FaTxn = {
  url: string;
  amount: string;
  dated_on: string;
  description: string;
  full_description?: string;
};

export type Anomaly = {
  id: string;
  kind: "large_outgoing" | "missing_recurring" | "possible_duplicate" | "new_vendor";
  title: string;
  detail: string;
  amount: number | null;
  date: string | null;
  severity: "low" | "medium" | "high";
};

const LOOKBACK_DAYS = 180;
const PER_PAGE = 50;
const MAX_PAGES = 6;

function normaliseSupplier(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .join(" ")
    .trim();
}

function parseAmount(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

export async function GET() {
  try {
    if (!(await isConnected())) {
      return NextResponse.json({ connected: false, anomalies: [] });
    }

    // Find the primary business account
    const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string; is_primary?: boolean }> }>("/bank_accounts");
    const primary = banks.bank_accounts.find((b) => !b.is_personal && b.status === "active" && b.is_primary);
    if (!primary) return NextResponse.json({ connected: true, anomalies: [] });

    // Pull recent transactions across pages (combined explained + unexplained)
    const allTxns: FaTxn[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await faApi<{ bank_transactions: FaTxn[] }>(
        `/bank_transactions?bank_account=${encodeURIComponent(primary.url)}&per_page=${PER_PAGE}&page=${page}`
      );
      const txns = r.bank_transactions ?? [];
      allTxns.push(...txns);
      if (txns.length < PER_PAGE) break;
    }

    const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;
    const recent = allTxns
      .map((t) => ({ ...t, _amount: parseAmount(t.amount), _ts: new Date(t.dated_on).getTime() }))
      .filter((t) => t._ts >= cutoff);

    const outgoings = recent.filter((t) => t._amount < 0).map((t) => ({ ...t, _abs: Math.abs(t._amount) }));
    const incomes = recent.filter((t) => t._amount > 0);

    const anomalies: Anomaly[] = [];

    // 1. Big unusual outgoings (last 14 days only)
    const medianOut = median(outgoings.map((t) => t._abs).filter((n) => n > 0));
    const last14d = Date.now() - 14 * 86400000;
    const bigOnes = outgoings
      .filter((t) => t._ts >= last14d && t._abs > Math.max(medianOut * 4, 200))
      .sort((a, b) => b._abs - a._abs)
      .slice(0, 3);
    for (const t of bigOnes) {
      anomalies.push({
        id: `big-${t.url}`,
        kind: "large_outgoing",
        title: `Large outgoing: £${t._abs.toFixed(2)}`,
        detail: `${(t.full_description ?? t.description).slice(0, 80)} on ${t.dated_on}. Bigger than your typical spend (£${medianOut.toFixed(0)} median).`,
        amount: -t._abs,
        date: t.dated_on,
        severity: t._abs > 1000 ? "medium" : "low",
      });
    }

    // 2. Missing recurring incomes
    // Group incomes by normalised supplier, check if any vendor that
    // historically paid monthly hasn't paid in 45+ days.
    const incomeGroups = new Map<string, Array<typeof recent[0]>>();
    for (const t of incomes) {
      const sup = normaliseSupplier(t.description);
      if (!sup) continue;
      if (!incomeGroups.has(sup)) incomeGroups.set(sup, []);
      incomeGroups.get(sup)!.push(t);
    }
    for (const [sup, txs] of incomeGroups) {
      if (txs.length < 3) continue; // need a history to detect a pattern
      const sorted = txs.sort((a, b) => a._ts - b._ts);
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) intervals.push((sorted[i]._ts - sorted[i - 1]._ts) / 86400000);
      const medianGap = median(intervals);
      if (medianGap < 15 || medianGap > 60) continue; // weekly/monthly-ish only
      const lastSeen = sorted[sorted.length - 1]._ts;
      const daysSince = (Date.now() - lastSeen) / 86400000;
      if (daysSince > medianGap * 1.5 + 7) {
        anomalies.push({
          id: `missing-${sup}`,
          kind: "missing_recurring",
          title: `Missing payment from ${sup}`,
          detail: `Usually paid every ${Math.round(medianGap)} days, last on ${sorted[sorted.length - 1].dated_on}. That's ${Math.round(daysSince)} days ago.`,
          amount: null,
          date: sorted[sorted.length - 1].dated_on,
          severity: "medium",
        });
      }
    }

    // 3. Possible duplicates — same amount within £0.01, same first-word
    //    supplier, within 7 days of each other
    for (let i = 0; i < outgoings.length; i++) {
      for (let j = i + 1; j < outgoings.length; j++) {
        const a = outgoings[i], b = outgoings[j];
        if (Math.abs(a._abs - b._abs) > 0.01) continue;
        if (daysBetween(a.dated_on, b.dated_on) > 7) continue;
        if (normaliseSupplier(a.description).split(" ")[0] !== normaliseSupplier(b.description).split(" ")[0]) continue;
        anomalies.push({
          id: `dup-${a.url}-${b.url}`,
          kind: "possible_duplicate",
          title: `Possible duplicate: £${a._abs.toFixed(2)}`,
          detail: `Same amount paid to ${normaliseSupplier(a.description)} on ${a.dated_on} and ${b.dated_on}.`,
          amount: -a._abs,
          date: a.dated_on,
          severity: "high",
        });
      }
    }

    // 4. New big vendor first seen in last 30 days
    const last30d = Date.now() - 30 * 86400000;
    const vendorFirstSeen = new Map<string, number>();
    for (const t of outgoings) {
      const sup = normaliseSupplier(t.description);
      if (!sup) continue;
      vendorFirstSeen.set(sup, Math.min(vendorFirstSeen.get(sup) ?? Infinity, t._ts));
    }
    const newBigVendors = outgoings
      .filter((t) => {
        const sup = normaliseSupplier(t.description);
        const first = vendorFirstSeen.get(sup) ?? Infinity;
        return first >= last30d && t._abs >= 100;
      })
      .sort((a, b) => b._abs - a._abs)
      .slice(0, 3);
    for (const t of newBigVendors) {
      anomalies.push({
        id: `newvendor-${t.url}`,
        kind: "new_vendor",
        title: `First time paying ${normaliseSupplier(t.description)}`,
        detail: `£${t._abs.toFixed(2)} on ${t.dated_on}. You haven't paid this vendor before — make sure it's legitimate.`,
        amount: -t._abs,
        date: t.dated_on,
        severity: "low",
      });
    }

    // De-dup by id and cap at 8
    const seen = new Set<string>();
    const deduped = anomalies.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    }).slice(0, 8);

    return NextResponse.json({ connected: true, anomalies: deduped, total_transactions: recent.length });
  } catch (err) {
    return errorResponse(err);
  }
}
