// Queue reconciliation.
//
// The review queue is derived from `queued_for_review` entries in the
// audit log. Those entries can go stale: the underlying FreeAgent
// transaction may since have been explained/matched (e.g. an incoming
// payment linked to an invoice), or we may have since learned a vendor
// rule that should auto-apply. Reconcile walks the queued entries,
// checks each one LIVE against FreeAgent, and:
//
//   • drops anything already explained / matched / gone in FA
//     (so it stops showing on the site), and
//   • auto-applies a learned vendor rule when one matches an
//     still-unexplained transaction (so "teach it once" really means
//     you never see that vendor again — it gets booked automatically).
//
// This is what makes the queue self-cleaning and pushes the system
// toward full automation.

import { loadAuditLog, type AuditEntry } from "@/app/lib/audit-log";
import { loadTokens } from "@/app/lib/freeagent";
import { lookupRule } from "@/app/lib/category-rules";
import { db } from "@/app/lib/db";

type FaStatus =
  | { status: "explained" }
  | { status: "gone" }
  | { status: "unexplained"; bank_account: string }
  | { status: "unknown" }; // FA error — be conservative, keep in queue

async function faTxnStatus(url: string, token: string): Promise<FaStatus> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "Finance Hub / Richard Payne LTD",
      },
    });
  } catch {
    return { status: "unknown" };
  }
  if (res.status === 404) return { status: "gone" };
  if (!res.ok) return { status: "unknown" };

  const json = await res.json().catch(() => null);
  const t = json?.bank_transaction;
  if (!t) return { status: "unknown" };

  const explained =
    Array.isArray(t.bank_transaction_explanations) &&
    t.bank_transaction_explanations.length > 0;
  if (explained) return { status: "explained" };
  if (!t.bank_account) return { status: "unknown" };
  return { status: "unexplained", bank_account: t.bank_account };
}

// Create an explanation in FA. Returns the explanation URL on success,
// "" when FA reports it was already explained, or null on hard failure.
async function applyExplanation(args: {
  bank_transaction_url: string;
  bank_account: string;
  category_url: string;
  dated_on: string;
  amount: number;
  description: string;
  token: string;
}): Promise<string | null> {
  const body = {
    bank_transaction_explanation: {
      bank_transaction: args.bank_transaction_url,
      bank_account: args.bank_account,
      category: args.category_url,
      dated_on: args.dated_on,
      gross_value: String(args.amount),
      description: args.description.slice(0, 250),
    },
  };
  let r: Response;
  try {
    r = await fetch("https://api.freeagent.com/v2/bank_transaction_explanations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Finance Hub / Richard Payne LTD",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300);
    if (r.status === 422 && /already/i.test(text)) return ""; // already explained = done
    return null;
  }
  const j = await r.json().catch(() => null);
  return j?.bank_transaction_explanation?.url ?? "";
}

// Run a list of async thunks with a small concurrency cap so a queue of
// dozens of items doesn't blow the function timeout, while staying well
// under FreeAgent rate limits.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type ReconcileResult = {
  queue: AuditEntry[]; // the cleaned, still-pending queue
  resolved: number; // dropped because already handled in FA
  auto_applied: number; // booked to FA via a learned rule
  checked: number;
};

// Reconcile the queued entries against FreeAgent. Mutates + persists the
// audit log. Safe to call repeatedly (idempotent — converges).
export async function reconcileQueue(opts?: { max?: number }): Promise<ReconcileResult> {
  const log = await loadAuditLog();
  const queued = log.filter((e) => e.action === "queued_for_review");

  const tokens = await loadTokens();
  if (!tokens) {
    // Can't talk to FA — just return the current queue untouched.
    return { queue: queued, resolved: 0, auto_applied: 0, checked: 0 };
  }

  const max = opts?.max ?? 80;
  const toCheck = queued.slice(0, max);

  let resolved = 0;
  let autoApplied = 0;

  await mapLimit(toCheck, 6, async (entry) => {
    const st = await faTxnStatus(entry.bank_transaction_url, tokens.access_token);
    const idx = log.findIndex((e) => e.id === entry.id);
    if (idx < 0) return;

    if (st.status === "explained" || st.status === "gone") {
      log[idx] = {
        ...log[idx],
        action: "auto_applied",
        reasoning: `${log[idx].reasoning} [resolved — already handled in FreeAgent]`.trim(),
      };
      resolved++;
      return;
    }

    if (st.status === "unknown") return; // leave it in the queue

    // Still genuinely unexplained — does a learned rule cover it?
    const rule = await lookupRule(entry.txn_description);
    if (!rule) return;

    const exUrl = await applyExplanation({
      bank_transaction_url: entry.bank_transaction_url,
      bank_account: st.bank_account,
      category_url: rule.category_url,
      dated_on: entry.txn_date,
      amount: entry.txn_amount,
      description: entry.txn_description,
      token: tokens.access_token,
    });
    if (exUrl === null) return; // hard failure — keep for manual review

    log[idx] = {
      ...log[idx],
      action: "auto_applied",
      category_url: rule.category_url,
      category_name: rule.category_name,
      confidence: 1,
      fa_explanation_url: exUrl || log[idx].fa_explanation_url,
      reasoning: `Auto-applied learned rule for "${rule.vendor}" (booked to FreeAgent).`,
    };
    autoApplied++;
  });

  if (resolved > 0 || autoApplied > 0) {
    await db().from("kv").upsert({
      key: "auto_categorisations_log",
      value: JSON.stringify(log),
    });
  }

  return {
    queue: log.filter((e) => e.action === "queued_for_review"),
    resolved,
    auto_applied: autoApplied,
    checked: toCheck.length,
  };
}
