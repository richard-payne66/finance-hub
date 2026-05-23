import { NextResponse } from "next/server";
import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { getCategories } from "@/app/lib/fa-categories";
import { classifyTransaction, type PastExample } from "@/app/lib/categorise";
import { loadAuditLog, appendAuditEntries, summarise, type AuditEntry } from "@/app/lib/audit-log";
import { lookupRule } from "@/app/lib/category-rules";
import { randomUUID } from "crypto";
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 300; // up to 5 min for batch runs

type FaTxn = {
  url: string;
  amount: string;
  bank_account: string;
  dated_on: string;
  description: string;
  full_description?: string;
};

type FaExplanation = {
  url: string;
  description?: string;
  transaction_description?: string;
  gross_value?: string;
  category?: string;
};

// Threshold above which we silently auto-apply. Below this we still log
// the suggestion but don't push to FA — the user reviews it.
const AUTO_THRESHOLD = 0.85;

// Pull all marked-for-review transactions across active business accounts
async function fetchUncategorised(): Promise<FaTxn[]> {
  const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string; marked_for_review_count?: number }> }>("/bank_accounts");
  const businessAccounts = banks.bank_accounts.filter((b) => !b.is_personal && b.status === "active" && (b.marked_for_review_count ?? 0) > 0);

  const all: FaTxn[] = [];
  for (const a of businessAccounts) {
    let page = 1;
    while (true) {
      const url = `/bank_transactions?bank_account=${encodeURIComponent(a.url)}&view=marked_for_review&per_page=50&page=${page}`;
      const res = await faApi<{ bank_transactions: FaTxn[] }>(url);
      const txns = res.bank_transactions ?? [];
      all.push(...txns);
      if (txns.length < 50) break;
      page += 1;
      if (page > 10) break; // safety
    }
  }
  return all;
}

// Pull recent past explanations for in-context learning examples
async function fetchPastExamples(): Promise<PastExample[]> {
  const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string }> }>("/bank_accounts");
  const businessAccounts = banks.bank_accounts.filter((b) => !b.is_personal && b.status === "active");
  const cats = await getCategories();
  const catLookup = new Map(cats.map((c) => [c.url, c.description]));

  const examples: PastExample[] = [];
  for (const a of businessAccounts) {
    const res = await faApi<{ bank_transaction_explanations: FaExplanation[] }>(
      `/bank_transaction_explanations?bank_account=${encodeURIComponent(a.url)}&per_page=30`
    );
    for (const ex of res.bank_transaction_explanations ?? []) {
      if (!ex.category) continue;
      examples.push({
        description: ex.description ?? ex.transaction_description ?? "",
        amount: parseFloat(ex.gross_value ?? "0"),
        category_name: catLookup.get(ex.category) ?? "Unknown",
        category_url: ex.category,
      });
    }
    if (examples.length >= 50) break;
  }
  return examples.slice(0, 50);
}

// Push a category back to FA by creating an explanation.
// faApi is read-only so we do the POST manually with the stored bearer.
async function applyToFA(txn: FaTxn, categoryUrl: string, description: string): Promise<string> {
  const { loadTokens } = await import("@/app/lib/freeagent");
  const tokens = await loadTokens();
  if (!tokens) throw new Error("Not connected to FA");

  const body = {
    bank_transaction_explanation: {
      bank_transaction: txn.url,
      bank_account: txn.bank_account,
      category: categoryUrl,
      dated_on: txn.dated_on,
      gross_value: txn.amount,
      description: description.slice(0, 250),
    },
  };

  const r = await fetch("https://api.freeagent.com/v2/bank_transaction_explanations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Finance Hub / Richard Payne LTD",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300);
    // 'already explained' is a no-op success — the txn IS categorised in FA
    if (r.status === 422 && /already.*explained/i.test(text)) {
      return "already-explained";
    }
    throw new Error(`FA explain ${r.status}: ${text}`);
  }
  const json = await r.json();
  return json?.bank_transaction_explanation?.url ?? "";
}

// GET — summary of recent activity
export async function GET() {
  try {
    const log = await loadAuditLog();
    return NextResponse.json({
      summary_7d: summarise(log, 7),
      summary_30d: summarise(log, 30),
      recent: log.slice(0, 25),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST — actually run the categorisation pipeline.
// Body: { dry_run?: boolean, limit?: number }
// (dry_run defaults to false; limit caps how many txns we process this run.)
export async function POST(req: Request) {
  try {
    if (!(await faConnected())) {
      return NextResponse.json({ error: "FreeAgent not connected." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const limit = Math.min(Math.max(parseInt(body.limit ?? "50"), 1), 200);

    const [categories, txns, pastExamples, recentLog] = await Promise.all([
      getCategories(),
      fetchUncategorised(),
      fetchPastExamples(),
      loadAuditLog(),
    ]);

    // Dedupe against the audit log: don't re-process transactions
    // we've already successfully auto-applied OR pushed to FA.
    // (FA's marked_for_review filter is eventually consistent and
    // sometimes returns transactions we just explained.)
    const alreadyDone = new Set(
      recentLog
        .filter((e) => e.action === "auto_applied")
        .map((e) => e.bank_transaction_url)
    );

    const fresh = txns.filter((t) => !alreadyDone.has(t.url));
    const toProcess = fresh.slice(0, limit);

    const entries: AuditEntry[] = [];

    for (const txn of toProcess) {
      const amount = parseFloat(txn.amount);
      const desc = txn.full_description ?? txn.description ?? "";

      // LEARNED RULE CHECK: if we've seen this vendor before and the user
      // explicitly approved a category for it, skip Claude entirely.
      const rule = await lookupRule(desc);
      let result;
      if (rule) {
        result = {
          category_url: rule.category_url,
          category_name: rule.category_name,
          confidence: 1.0, // user-confirmed = full confidence
          reasoning: `Matched learned rule for "${rule.vendor}" (used ${rule.hits} time${rule.hits !== 1 ? "s" : ""} before).`,
          tax_note: null,
          is_personal_likely: false,
        };
      } else {
      try {
        result = await classifyTransaction({
          description: desc,
          amount,
          date: txn.dated_on,
          categories,
          pastExamples,
        });
      } catch (err) {
        entries.push({
          id: randomUUID(),
          created_at: new Date().toISOString(),
          bank_transaction_url: txn.url,
          txn_description: desc,
          txn_amount: amount,
          txn_date: txn.dated_on,
          category_url: null,
          category_name: null,
          confidence: 0,
          reasoning: "",
          tax_note: null,
          action: "error",
          fa_explanation_url: null,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      } // close else branch of rule check

      // Decide action
      let action: AuditEntry["action"];
      let faUrl: string | null = null;
      let err: string | null = null;

      if (result.is_personal_likely) {
        action = "skipped_personal";
      } else if (result.category_url && result.confidence >= AUTO_THRESHOLD && !dryRun) {
        try {
          faUrl = await applyToFA(txn, result.category_url, desc);
          action = "auto_applied";
        } catch (e) {
          action = "error";
          err = e instanceof Error ? e.message : String(e);
        }
      } else {
        action = "queued_for_review";
      }

      entries.push({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        bank_transaction_url: txn.url,
        txn_description: desc,
        txn_amount: amount,
        txn_date: txn.dated_on,
        category_url: result.category_url,
        category_name: result.category_name,
        confidence: result.confidence,
        reasoning: result.reasoning,
        tax_note: result.tax_note,
        action,
        fa_explanation_url: faUrl,
        error: err,
      });
    }

    if (entries.length > 0) {
      await appendAuditEntries(entries);
    }

    return NextResponse.json({
      processed: entries.length,
      total_uncategorised: txns.length,
      auto_applied: entries.filter((e) => e.action === "auto_applied").length,
      queued: entries.filter((e) => e.action === "queued_for_review").length,
      skipped: entries.filter((e) => e.action === "skipped_personal").length,
      errors: entries.filter((e) => e.action === "error").length,
      dry_run: dryRun,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
