import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog, appendAuditEntries, type AuditEntry } from "@/app/lib/audit-log";
import { loadTokens } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";
import { db } from "@/app/lib/db";

// POST body:
//   { id: string, category_url?: string }
// If category_url is given, it overrides Claude's suggestion (user edit).
// Pushes to FA via /v2/bank_transaction_explanations and updates the
// audit entry to action='auto_applied' with fa_explanation_url set.

async function pushToFA(args: {
  bank_transaction_url: string;
  category_url: string;
  dated_on: string;
  amount: number;
  description: string;
}): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error("Not connected to FA");

  // Need the bank_account URL too. Look up the transaction.
  const txnRes = await fetch(args.bank_transaction_url, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
  });
  if (!txnRes.ok) throw new Error(`Lookup txn: ${txnRes.status} ${await txnRes.text()}`);
  const txnJson = await txnRes.json();
  const bankAccount = txnJson?.bank_transaction?.bank_account;
  if (!bankAccount) throw new Error("No bank_account on transaction");

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
  if (!r.ok) throw new Error(`FA explain ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j?.bank_transaction_explanation?.url ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const { id, category_url: overrideCategory } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const log = await loadAuditLog();
    const idx = log.findIndex((e) => e.id === id);
    if (idx < 0) return NextResponse.json({ error: "entry not found" }, { status: 404 });

    const entry = log[idx];
    const categoryUrl = overrideCategory ?? entry.category_url;
    if (!categoryUrl) return NextResponse.json({ error: "no category to apply" }, { status: 400 });

    // Resolve category name if overridden
    let categoryName = entry.category_name;
    if (overrideCategory && overrideCategory !== entry.category_url) {
      const { getCategories } = await import("@/app/lib/fa-categories");
      const cats = await getCategories();
      categoryName = cats.find((c) => c.url === overrideCategory)?.description ?? null;
    }

    const faUrl = await pushToFA({
      bank_transaction_url: entry.bank_transaction_url,
      category_url: categoryUrl,
      dated_on: entry.txn_date,
      amount: entry.txn_amount,
      description: entry.txn_description,
    });

    // Mark this audit entry as applied (and add a fresh entry recording the override)
    const updated: AuditEntry = {
      ...entry,
      category_url: categoryUrl,
      category_name: categoryName,
      action: "auto_applied",
      fa_explanation_url: faUrl,
    };
    log[idx] = updated;
    await db().from("kv").upsert({ key: "auto_categorisations_log", value: JSON.stringify(log) });

    // If user overrode, persist the override so future categorisations can learn from it
    if (overrideCategory && overrideCategory !== entry.category_url) {
      await appendAuditEntries([{
        ...updated,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        action: "auto_applied",
        reasoning: `User override (was ${entry.category_name})`,
      }]);
    }

    return NextResponse.json({ ok: true, fa_explanation_url: faUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
