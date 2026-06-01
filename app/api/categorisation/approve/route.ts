import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog, type AuditEntry } from "@/app/lib/audit-log";
import { loadTokens } from "@/app/lib/freeagent";
import { getCategories } from "@/app/lib/fa-categories";
import { upsertRule } from "@/app/lib/category-rules";
import { db } from "@/app/lib/db";

// Approve a queued bank transaction. Two paths depending on what FA has:
//
//   A) FA has a guessed explanation (marked_for_review:true) — the normal
//      case for every bank-feed transaction. We CONFIRM it in place:
//        PUT /bank_transaction_explanations/:id  { category, marked_for_review:false }
//      If the user overrides the category we also set the new category in
//      the same PUT (so FreeAgent learns from the correction too).
//
//   B) No explanation exists yet (blank txn, or a manually-uploaded
//      statement). Fall back to POSTing a new explanation — the old model,
//      which is still correct for genuinely unexplained txns.
//
// Either way the audit log is updated and the vendor rule is taught.

const FA_BASE = "https://api.freeagent.com/v2";
const HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "Finance Hub / Richard Payne LTD",
});

type ConfirmOutcome =
  | { kind: "confirmed"; explanation_url: string }
  | { kind: "created";   explanation_url: string }
  | { kind: "error";     body: string };

async function confirmOrCreate(args: {
  bank_transaction_url: string;
  category_url: string;
  dated_on: string;
  amount: number;
  description: string;
  token: string;
}): Promise<ConfirmOutcome> {
  // Fetch the full transaction to find any existing explanation.
  const txnRes = await fetch(args.bank_transaction_url, {
    headers: HEADERS(args.token),
  });
  if (!txnRes.ok) {
    return { kind: "error", body: `FA txn lookup ${txnRes.status}: ${(await txnRes.text()).slice(0, 200)}` };
  }
  const txnJson = await txnRes.json();
  const txn = txnJson?.bank_transaction;
  if (!txn) return { kind: "error", body: "Unexpected FA response — no bank_transaction field" };

  const exps: Array<{ url: string; marked_for_review?: boolean; category?: string }> =
    txn.bank_transaction_explanations ?? [];

  // Prefer the unconfirmed (guessed) explanation; fall back to any explanation.
  const existing = exps.find((e) => e.marked_for_review !== false) ?? exps[0];

  // ── PATH A: confirm/update the existing explanation ──
  if (existing?.url) {
    const expPath = existing.url.replace(FA_BASE, "");
    const r = await fetch(`${FA_BASE}${expPath}`, {
      method: "PUT",
      headers: HEADERS(args.token),
      body: JSON.stringify({
        bank_transaction_explanation: {
          category: args.category_url,
          marked_for_review: false,
        },
      }),
    });
    if (!r.ok) {
      const text = (await r.text()).slice(0, 300);
      return { kind: "error", body: `FA PUT ${r.status}: ${text}` };
    }
    const j = await r.json().catch(() => null);
    return {
      kind: "confirmed",
      explanation_url: j?.bank_transaction_explanation?.url ?? existing.url,
    };
  }

  // ── PATH B: no existing explanation — create one ──
  const bankAccount = txn.bank_account;
  if (!bankAccount) return { kind: "error", body: "Transaction has no bank_account field" };
  const r = await fetch(`${FA_BASE}/bank_transaction_explanations`, {
    method: "POST",
    headers: HEADERS(args.token),
    body: JSON.stringify({
      bank_transaction_explanation: {
        bank_transaction: args.bank_transaction_url,
        bank_account: bankAccount,
        category: args.category_url,
        dated_on: args.dated_on,
        gross_value: String(args.amount),
        description: args.description.slice(0, 250),
      },
    }),
  });
  if (!r.ok) {
    const text = (await r.text()).slice(0, 300);
    if (r.status === 422 && /already/i.test(text)) {
      // Treat 422 already-explained as a no-op success.
      return { kind: "confirmed", explanation_url: "" };
    }
    return { kind: "error", body: `FA POST ${r.status}: ${text}` };
  }
  const j = await r.json();
  return { kind: "created", explanation_url: j?.bank_transaction_explanation?.url ?? "" };
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

    const tokens = await loadTokens();
    if (!tokens) return NextResponse.json({ error: "FreeAgent not connected" }, { status: 400 });

    // Resolve category name for the override case.
    let categoryName = entry.category_name;
    if (overrideCategory && overrideCategory !== entry.category_url) {
      const cats = await getCategories();
      categoryName = cats.find((c) => c.url === overrideCategory)?.description ?? null;
    }

    const outcome = await confirmOrCreate({
      bank_transaction_url: entry.bank_transaction_url,
      category_url: categoryUrl,
      dated_on: entry.txn_date,
      amount: entry.txn_amount,
      description: entry.txn_description,
      token: tokens.access_token,
    });

    if (outcome.kind === "error") {
      return NextResponse.json({ error: outcome.body }, { status: 502 });
    }

    // Update audit log: mark applied.
    const updated: AuditEntry = {
      ...entry,
      category_url: categoryUrl,
      category_name: categoryName,
      action: "auto_applied",
      fa_explanation_url: outcome.explanation_url || entry.fa_explanation_url,
      reasoning: `${entry.reasoning} [manually approved${overrideCategory && overrideCategory !== entry.category_url ? ` with override to ${categoryName}` : ""}]`.trim(),
    };
    log[idx] = updated;
    await db().from("kv").upsert({ key: "auto_categorisations_log", value: JSON.stringify(log) });

    // Teach the rule — if user overrode the category, this corrects it.
    if (categoryName) {
      await upsertRule({
        description: entry.txn_description,
        category_url: categoryUrl,
        category_name: categoryName,
      });
    }

    return NextResponse.json({ ok: true, how: outcome.kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
