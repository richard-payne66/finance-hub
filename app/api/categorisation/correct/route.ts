import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog, replaceAuditEntry, type AuditEntry } from "@/app/lib/audit-log";
import { api as faApi, apiSend } from "@/app/lib/freeagent";
import { getCategories } from "@/app/lib/fa-categories";
import { upsertRule, removeRule } from "@/app/lib/category-rules";
import { errorResponse } from "@/app/lib/api-helpers";

// Correct something the system auto-filed.
//   { id, category_url }   → re-categorise: updates the FA explanation to
//                            the new category and re-teaches the vendor rule.
//   { id, mark_personal }  → un-file: deletes the FA explanation (txn goes
//                            back to "to review" in FA) and forgets the rule
//                            so we stop auto-filing this vendor.
//
// Both operate on an existing auto_applied entry.

// Resolve the FA explanation URL for a transaction. Prefer the one we
// stored when we filed it; otherwise look it up live from FA.
async function explanationUrlFor(entry: AuditEntry): Promise<string | null> {
  if (entry.fa_explanation_url) return entry.fa_explanation_url;
  try {
    const j = await faApi<{ bank_transaction?: { bank_transaction_explanations?: Array<string | { url?: string }> } }>(
      entry.bank_transaction_url
    );
    const exps = j?.bank_transaction?.bank_transaction_explanations;
    if (Array.isArray(exps) && exps.length > 0) {
      const first = exps[0];
      return typeof first === "string" ? first : first?.url ?? null;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { id, category_url: newCategory, mark_personal } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const log = await loadAuditLog();
    const idx = log.findIndex((e) => e.id === id);
    if (idx < 0) return NextResponse.json({ error: "entry not found" }, { status: 404 });
    const entry = log[idx];

    const explanationUrl = await explanationUrlFor(entry);

    // ---- Mark personal / un-file ----
    if (mark_personal) {
      if (explanationUrl) {
        try {
          await apiSend(explanationUrl, "DELETE");
        } catch (e) {
          // If it's already gone in FA, that's fine — keep going.
          const msg = e instanceof Error ? e.message : String(e);
          if (!/404/.test(msg)) {
            return NextResponse.json({ error: `FreeAgent rejected un-filing: ${msg}` }, { status: 502 });
          }
        }
      }
      // Forget the learned rule so we don't auto-file this vendor again.
      await removeRule(entry.txn_description);

      await replaceAuditEntry({
        ...entry,
        action: "skipped_personal",
        category_url: null,
        category_name: null,
        fa_explanation_url: null,
        reasoning: `${entry.reasoning} [you marked this personal]`.trim(),
      });
      return NextResponse.json({ ok: true, action: "marked_personal" });
    }

    // ---- Re-categorise ----
    if (!newCategory) return NextResponse.json({ error: "category_url or mark_personal required" }, { status: 400 });

    const cats = await getCategories();
    const newName = cats.find((c) => c.url === newCategory)?.description ?? null;

    if (!explanationUrl) {
      return NextResponse.json(
        { error: "Couldn't find this transaction's entry in FreeAgent to update." },
        { status: 502 }
      );
    }

    try {
      // Also clear marked_for_review so a guessed explanation is fully
      // confirmed in FA (not just re-categorised while still "awaiting approval").
      await apiSend(explanationUrl, "PUT", {
        bank_transaction_explanation: { category: newCategory, marked_for_review: false },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `FreeAgent rejected the change: ${msg}` }, { status: 502 });
    }

    await replaceAuditEntry({
      ...entry,
      category_url: newCategory,
      category_name: newName,
      reasoning: `${entry.reasoning} [you re-categorised this]`.trim(),
    });

    // Re-teach: next time this vendor appears, use the corrected category.
    if (newName) {
      await upsertRule({
        description: entry.txn_description,
        category_url: newCategory,
        category_name: newName,
      });
    }

    return NextResponse.json({ ok: true, action: "recategorised", category_name: newName });
  } catch (err) {
    return errorResponse(err);
  }
}
