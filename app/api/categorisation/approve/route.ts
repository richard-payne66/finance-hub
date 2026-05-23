import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog, type AuditEntry } from "@/app/lib/audit-log";
import { loadTokens } from "@/app/lib/freeagent";
import { upsertRule } from "@/app/lib/category-rules";
import { db } from "@/app/lib/db";

// Push a category to FA. Returns:
//   - 'ok' with the explanation URL if push succeeded
//   - 'already_explained' if FA returns 404 (txn was explained elsewhere)
//   - 'error' otherwise, with full FA response surfaced
type PushOutcome =
  | { kind: "ok"; explanation_url: string }
  | { kind: "already_explained" }
  | { kind: "error"; status: number; body: string };

async function pushToFA(args: {
  bank_transaction_url: string;
  category_url: string;
  dated_on: string;
  amount: number;
  description: string;
}): Promise<PushOutcome> {
  const tokens = await loadTokens();
  if (!tokens) return { kind: "error", status: 0, body: "FA not connected" };

  // Look up the transaction to get the bank_account URL.
  const txnRes = await fetch(args.bank_transaction_url, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
  });

  if (txnRes.status === 404) {
    return { kind: "already_explained" };
  }
  if (!txnRes.ok) {
    return { kind: "error", status: txnRes.status, body: (await txnRes.text()).slice(0, 500) };
  }

  const txnJson = await txnRes.json();
  const bankAccount = txnJson?.bank_transaction?.bank_account;
  if (!bankAccount) {
    return { kind: "error", status: 200, body: `Transaction has no bank_account field` };
  }

  // Check if already explained — FA includes 'is_explained' on the txn
  // when it's been categorised. If true, treat as already done.
  if (txnJson?.bank_transaction?.is_manual === false && Array.isArray(txnJson?.bank_transaction?.bank_transaction_explanations) && txnJson.bank_transaction.bank_transaction_explanations.length > 0) {
    return { kind: "already_explained" };
  }

  const body = {
    bank_transaction_explanation: {
      bank_transaction: args.bank_transaction_url,
      bank_account: bankAccount,
      category: args.category_url,
      dated_on: args.dated_on,
      gross_value: String(args.amount),
      description: args.description.slice(0, 250),
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
    const text = (await r.text()).slice(0, 500);
    // FA returns 422 with 'has already been explained' message in some cases
    if (r.status === 422 && /already/i.test(text)) return { kind: "already_explained" };
    return { kind: "error", status: r.status, body: text };
  }
  const j = await r.json();
  return { kind: "ok", explanation_url: j?.bank_transaction_explanation?.url ?? "" };
}

export async function POST(req: NextRequest) {
  try {
    const { id, category_url: overrideCategory } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const log = await loadAuditLog();
    const idx = log.findIndex((e) => e.id === id);
    if (idx < 0) return NextResponse.json({ error: "entry not found in audit log" }, { status: 404 });

    const entry = log[idx];
    const categoryUrl = overrideCategory ?? entry.category_url;
    if (!categoryUrl) return NextResponse.json({ error: "no category to apply" }, { status: 400 });

    // Resolve category name (for the audit log + learning rule)
    let categoryName = entry.category_name;
    if (overrideCategory && overrideCategory !== entry.category_url) {
      const { getCategories } = await import("@/app/lib/fa-categories");
      const cats = await getCategories();
      categoryName = cats.find((c) => c.url === overrideCategory)?.description ?? null;
    }

    const outcome = await pushToFA({
      bank_transaction_url: entry.bank_transaction_url,
      category_url: categoryUrl,
      dated_on: entry.txn_date,
      amount: entry.txn_amount,
      description: entry.txn_description,
    });

    if (outcome.kind === "error") {
      return NextResponse.json(
        { error: `FreeAgent rejected: ${outcome.body}`, status: outcome.status },
        { status: 502 }
      );
    }

    // outcome is 'ok' or 'already_explained' — both are 'done' from the
    // user's POV. Mark the entry applied and remove from queue.
    const updated: AuditEntry = {
      ...entry,
      category_url: categoryUrl,
      category_name: categoryName,
      action: "auto_applied",
      fa_explanation_url: outcome.kind === "ok" ? outcome.explanation_url : entry.fa_explanation_url,
      reasoning: outcome.kind === "already_explained"
        ? `${entry.reasoning} [already explained in FA]`
        : entry.reasoning,
    };
    log[idx] = updated;
    await db().from("kv").upsert({ key: "auto_categorisations_log", value: JSON.stringify(log) });

    // LEARNING LOOP: persist a vendor → category rule so next time the
    // same supplier shows up, we skip Claude and apply directly.
    if (categoryName) {
      await upsertRule({
        description: entry.txn_description,
        category_url: categoryUrl,
        category_name: categoryName,
      });
    }

    return NextResponse.json({
      ok: true,
      already_explained: outcome.kind === "already_explained",
      fa_explanation_url: outcome.kind === "ok" ? outcome.explanation_url : null,
    });
  } catch (err) {
    // Surface the real error to the client so we can debug
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
