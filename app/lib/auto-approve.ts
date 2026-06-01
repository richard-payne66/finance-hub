// Auto-approve FreeAgent's guessed bank-transaction explanations.
//
// FreeAgent pre-guesses a category for every marked-for-review transaction
// (explanation carries marked_for_review:true + a guess_rule_name). This
// module CONFIRMS the guesses we're confident about (clears marked_for_review
// via PUT) and HOLDS the judgement calls for the human.
//
// It only ever confirms FA's OWN guess — it never invents or changes a
// category — so there's no double-booking or mis-filing risk. The risky /
// uncertain transactions stay in FreeAgent's review tab (and our /review
// queue) for a manual glance.

import { api as faApi, apiSend } from "@/app/lib/freeagent";
import { getCategories } from "@/app/lib/fa-categories";
import { loadRules, vendorKey } from "@/app/lib/category-rules";
import { loadAuditLog, type AuditEntry } from "@/app/lib/audit-log";
import { db } from "@/app/lib/db";
import { randomUUID } from "crypto";

// Amount above which we ALWAYS ask the human, even for a confident guess.
const APPROVE_CEILING = 350;

// FA guess sources we trust enough to auto-confirm on their own:
//  - invoice_rule / bill_rule: deterministic match to a real invoice/bill
//  - similar_explained_transactions_rule: FA repeating a category YOU have
//    confirmed before (i.e. learned from your own past approvals)
const TRUSTED_GUESS_RULES = new Set([
  "invoice_rule",
  "bill_rule",
  "similar_explained_transactions_rule",
]);

// Categories we never auto-approve — tax-judgement / personal-risk buckets.
const HOLD_CATEGORIES = new Set([
  "Accommodation and Meals",
  "Business Entertaining",
  "Staff Entertaining",
  "Sundries",
]);

type FaTxn = { url: string; amount: string; bank_account: string; dated_on: string; description: string; full_description?: string };
type FaExplanation = { url: string; category?: string; marked_for_review?: boolean; guess_rule_name?: string };

export type AutoApproveResult = {
  approved: number;
  held: number;
  skipped: number;
  errors: number;
  details: Array<{ desc: string; amount: number; category: string | null; decision: "approved" | "held" | "error"; why: string }>;
};

async function fetchMarkedForReview(): Promise<FaTxn[]> {
  const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string; marked_for_review_count?: number }> }>("/bank_accounts");
  const business = banks.bank_accounts.filter((b) => !b.is_personal && b.status === "active" && (b.marked_for_review_count ?? 0) > 0);
  const all: FaTxn[] = [];
  for (const a of business) {
    for (let page = 1; page <= 10; page++) {
      const res = await faApi<{ bank_transactions: FaTxn[] }>(`/bank_transactions?bank_account=${encodeURIComponent(a.url)}&view=marked_for_review&per_page=50&page=${page}`);
      const t = res.bank_transactions ?? [];
      all.push(...t);
      if (t.length < 50) break;
    }
  }
  return all;
}

// The unconfirmed guessed explanation on a transaction, if any.
async function guessedExplanation(txnUrl: string): Promise<FaExplanation | null> {
  const j = await faApi<{ bank_transaction?: { bank_transaction_explanations?: FaExplanation[] } }>(txnUrl);
  const exps = j?.bank_transaction?.bank_transaction_explanations;
  if (!Array.isArray(exps) || exps.length === 0) return null;
  // Prefer the unconfirmed (guessed) one; fall back to the first.
  return exps.find((e) => e && typeof e === "object" && e.marked_for_review !== false) ?? exps[0] ?? null;
}

export async function autoApproveGuesses(): Promise<AutoApproveResult> {
  const [cats, rules, txns, log] = await Promise.all([
    getCategories().catch(() => []),
    loadRules().catch(() => []),
    fetchMarkedForReview(),
    loadAuditLog(),
  ]);
  const catByUrl = new Map(cats.map((c) => [c.url, c.description]));
  const ruleByVendor = new Map(rules.map((r) => [r.vendor, r]));

  // The source of truth for "needs approving" is FreeAgent's own
  // marked_for_review state (handled per-txn below via the guessed
  // explanation's marked_for_review flag) — NOT our audit log, which can
  // wrongly say "auto_applied" for txns a past POST only no-op'd. The ONLY
  // thing we honour from the log is an explicit "mark personal" so we never
  // auto-approve something the user has rejected.
  const terminal = new Set(
    log.filter((e) => e.action === "skipped_personal").map((e) => e.bank_transaction_url)
  );

  const result: AutoApproveResult = { approved: 0, held: 0, skipped: 0, errors: 0, details: [] };
  const newEntries: AuditEntry[] = [];
  const heldUrls = new Set<string>();

  for (const txn of txns) {
    if (terminal.has(txn.url)) { result.skipped++; continue; }
    const amount = parseFloat(txn.amount);
    const desc = txn.full_description ?? txn.description ?? "";

    let g: FaExplanation | null;
    try { g = await guessedExplanation(txn.url); } catch { result.errors++; continue; }
    if (!g || !g.category) { result.skipped++; continue; }          // nothing guessed → nothing to approve
    if (g.marked_for_review === false) { result.skipped++; continue; } // already confirmed

    const catName = catByUrl.get(g.category) ?? null;
    const rule = ruleByVendor.get(vendorKey(desc));
    const ruleAgrees = !!rule && rule.category_url === g.category;
    const trusted = !!g.guess_rule_name && TRUSTED_GUESS_RULES.has(g.guess_rule_name);
    const confident = ruleAgrees || trusted;

    // ── decide ──
    let hold: string | null = null;
    if (Math.abs(amount) > APPROVE_CEILING) hold = `over £${APPROVE_CEILING} — your call`;
    else if (catName && HOLD_CATEGORIES.has(catName)) hold = `${catName} — tax judgement`;
    else if (!confident) hold = "FreeAgent's guess isn't backed by your history";

    if (hold) {
      result.held++;
      heldUrls.add(txn.url);
      result.details.push({ desc: desc.slice(0, 40), amount, category: catName, decision: "held", why: hold });
      // Surface in our review queue (unless already queued for this txn).
      if (!log.some((e) => e.bank_transaction_url === txn.url && e.action === "queued_for_review")) {
        newEntries.push(mkEntry(txn, amount, desc, g, catName, "queued_for_review", `Held for your review — ${hold}.`, 0.6));
      }
      continue;
    }

    // ── approve: confirm FA's guess in place (PUT marked_for_review:false) ──
    const why = ruleAgrees ? `matches your saved rule for "${rule!.vendor}"` : `FreeAgent ${g.guess_rule_name === "invoice_rule" ? "matched it to an invoice" : "matched your past categorisations"}`;
    try {
      await apiSend(g.url, "PUT", { bank_transaction_explanation: { category: g.category, marked_for_review: false } });
      result.approved++;
      result.details.push({ desc: desc.slice(0, 40), amount, category: catName, decision: "approved", why });
      newEntries.push(mkEntry(txn, amount, desc, g, catName, "auto_applied", `✓ Approved FreeAgent's guess (${why}).`, 1));
    } catch (e) {
      result.errors++;
      result.details.push({ desc: desc.slice(0, 40), amount, category: catName, decision: "error", why: e instanceof Error ? e.message : String(e) });
    }
  }

  // Persist: drop stale queued entries for txns we just re-decided, then prepend new ones.
  if (newEntries.length > 0) {
    const reprocessed = new Set(newEntries.map((e) => e.bank_transaction_url));
    const kept = log.filter((e) => !(e.action === "queued_for_review" && reprocessed.has(e.bank_transaction_url)));
    const merged = [...newEntries, ...kept].slice(0, 500);
    await db().from("kv").upsert({ key: "auto_categorisations_log", value: JSON.stringify(merged) });
  }

  return result;
}

function mkEntry(txn: FaTxn, amount: number, desc: string, g: FaExplanation, catName: string | null, action: AuditEntry["action"], reasoning: string, confidence: number): AuditEntry {
  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    bank_transaction_url: txn.url,
    txn_description: desc,
    txn_amount: amount,
    txn_date: txn.dated_on,
    category_url: g.category ?? null,
    category_name: catName,
    confidence,
    reasoning,
    tax_note: null,
    action,
    fa_explanation_url: g.url,
    error: null,
  };
}
