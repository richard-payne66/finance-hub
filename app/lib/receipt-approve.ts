// Shared "approve a receipt" logic used by:
//   - POST /api/receipts/[id]/approve  (when the user clicks Approve)
//   - The 30-day auto-approve cron      (anything still pending after a month)
//
// Behaviour:
//   * Receipts paid with a *business card* don't get pushed to FA as an
//     Expense — they get matched against an existing bank-feed line via
//     the auto-categorise pipeline. We just flip status='approved' in
//     our DB.
//   * Everything else (cash / personal card / bank transfer with no
//     match yet) is pushed to FreeAgent as an out-of-pocket Expense,
//     which is what reimburses the director via the DLA.
//   * pushed_at + freeagent_url guard against double-push if the route
//     gets retried.

import { db } from "@/app/lib/db";
import {
  api as faApi,
  apiSend as faApiSend,
  isConnected as faIsConnected,
} from "@/app/lib/freeagent";
import type { Receipt } from "@/app/lib/types";
import { upsertRule } from "@/app/lib/category-rules";

export type ApproveResult = {
  ok: boolean;
  pushed: boolean;
  freeagent_url?: string | null;
  reason?: string; // when ok=false, why
  skipped?: string; // when ok=true but we deliberately didn't push (e.g. business card)
};

type FaUserResponse = { user: { url: string } };
type FaExpenseResponse = { expense: { url: string } };

// Pull the receipt image out of Supabase storage and return it as the
// attachment payload FA expects. Returns null if we can't get it — the
// caller pushes the expense without an attachment in that case.
async function buildAttachment(
  storageKey: string | null,
): Promise<{ file_name: string; content_type: string; data: string } | null> {
  if (!storageKey) return null;
  // Receipts uploaded before we added storage keys could conceivably be
  // full URLs — we only know how to handle bucket-relative keys here.
  if (/^https?:/.test(storageKey)) return null;

  const { data: blob, error } = await db().storage.from("receipts").download(storageKey);
  if (error || !blob) return null;

  const ext = (storageKey.split(".").pop() ?? "").toLowerCase();
  const contentType =
    ext === "pdf"
      ? "application/pdf"
      : ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg";

  const buf = Buffer.from(await blob.arrayBuffer());
  return {
    file_name: storageKey.split("/").pop() ?? `receipt.${ext || "jpg"}`,
    content_type: contentType,
    data: buf.toString("base64"),
  };
}

// Record the approval + FA link in our DB, retrying transient failures. This
// is the keystone of push idempotency: if we created the expense in FA but
// never store its URL, the next approve would create a SECOND one.
async function persistApproval(id: string, url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await db()
      .from("receipts")
      .update({
        status: "approved",
        freeagent_url: url,
        pushed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (!error) return true;
  }
  return false;
}

let _cachedUserUrl: string | null = null;

async function getUserUrl(): Promise<string> {
  if (_cachedUserUrl) return _cachedUserUrl;
  const me = await faApi<FaUserResponse>("/users/me");
  _cachedUserUrl = me.user.url;
  return _cachedUserUrl;
}

export async function approveReceipt(
  receiptId: string,
  opts: { force?: boolean } = {},
): Promise<ApproveResult> {
  const { data, error } = await db()
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, pushed: false, reason: error?.message ?? "not found" };
  }
  const r = data as Receipt;

  // Idempotency guard. `force` bypasses it — used when re-pushing after
  // a code fix (e.g. attaching the image, correcting VAT) or after the
  // user deleted the FA-side expense to retry.
  if (!opts.force && r.status === "approved" && r.freeagent_url) {
    return { ok: true, pushed: false, freeagent_url: r.freeagent_url, skipped: "Already approved + pushed" };
  }

  // Business-card receipts get reconciled with the bank feed elsewhere.
  // We just confirm them in our DB; no FA write.
  if (r.is_business_card === true) {
    await db().from("receipts").update({ status: "approved" }).eq("id", r.id);
    return { ok: true, pushed: false, skipped: "Business-card spend — reconciled via bank feed" };
  }

  // Need the minimum set of fields to push a valid expense to FA.
  if (!r.category_url || r.gross_total == null || !r.supply_date) {
    return {
      ok: false,
      pushed: false,
      reason: `Missing fields for FA push (category=${!!r.category_url}, total=${r.gross_total != null}, date=${!!r.supply_date}).`,
    };
  }

  if (!(await faIsConnected())) {
    // FA not connected → don't fail the click; mark approved internally
    // so the auto-approve cron / user can see it landed, but flag.
    await db()
      .from("receipts")
      .update({ status: "approved" })
      .eq("id", r.id);
    return {
      ok: true,
      pushed: false,
      skipped: "FreeAgent not connected — approved in DB only",
    };
  }

  // Map our extracted VAT data onto the fields FA's /v2/expenses expects.
  //
  //   sales_tax_status — TAXABLE | EXEMPT | OUT_OF_SCOPE
  //   sales_tax_rate   — numeric, required when status=TAXABLE
  //   manual_sales_tax_amount — exact VAT figure from the receipt; sent
  //     whenever Claude pulled it out so the FA line matches what's on
  //     the paper. Without this, FA computes VAT from the category's
  //     default 20% which mis-bills 5%/0%/mixed-rate receipts.
  const vatRateStr = (r.vat_rate ?? "").toLowerCase().trim();
  const rateMatch = vatRateStr.match(/^(\d+(?:\.\d+)?)\s*%$/);
  const explicitRate = rateMatch ? Number.parseFloat(rateMatch[1]) : null;

  let salesTaxStatus: "TAXABLE" | "EXEMPT" | "OUT_OF_SCOPE" = "TAXABLE";
  let salesTaxRate: number | null = explicitRate;

  if (vatRateStr === "exempt") {
    salesTaxStatus = "EXEMPT";
    salesTaxRate = null;
  } else if (vatRateStr === "out of scope") {
    salesTaxStatus = "OUT_OF_SCOPE";
    salesTaxRate = null;
  } else if (explicitRate === 0) {
    // 0%-rated (food etc) is technically TAXABLE at 0%, not EXEMPT.
    salesTaxStatus = "TAXABLE";
    salesTaxRate = 0;
  } else if (explicitRate == null && (r.vat_total ?? 0) === 0) {
    // Claude couldn't determine the rate AND no VAT amount → safest as exempt
    // (FA won't try to imply 20% from an unknown category default).
    salesTaxStatus = "EXEMPT";
  } else if (explicitRate == null && r.vat_total != null && r.gross_total != null) {
    // We have a VAT amount but no explicit rate string — back it out from
    // the numbers so FA's required sales_tax_rate field can be sent.
    const netImplied = r.gross_total - r.vat_total;
    if (netImplied > 0) {
      salesTaxRate = Math.round((r.vat_total / netImplied) * 1000) / 10; // 1dp
    }
  }

  try {
    const userUrl = await getUserUrl();
    // Best-effort attachment fetch. If it fails, push the expense anyway
    // — the financial entry is more important than the image; user can
    // attach manually in FA if needed.
    const attachment = await buildAttachment(r.receipt_image_url).catch(() => null);

    // CRITICAL SIGN CONVENTION:
    //
    // FreeAgent's /v2/expenses gross_value is signed FROM THE CLAIMANT'S
    // PERSPECTIVE — negative means "the company owes the claimant for
    // money they spent" (i.e. an EXPENSE), positive means "the claimant
    // owes the company a refund" (the opposite).
    //
    // Earlier code was passing the positive amount Claude extracts, so
    // everything landed in FA as a REFUND. Forcing negative here for
    // both gross_value and the explicit VAT amount.
    const grossExpense = -Math.abs(r.gross_total);
    const vatExpense =
      r.vat_total != null ? -Math.abs(r.vat_total) : null;

    const payload = {
      expense: {
        user: userUrl,
        category: r.category_url,
        gross_value: grossExpense,
        dated_on: r.supply_date,
        description: r.description ?? r.supplier ?? "Receipt",
        sales_tax_status: salesTaxStatus,
        ...(salesTaxRate != null ? { sales_tax_rate: salesTaxRate } : {}),
        ...(vatExpense != null
          ? { manual_sales_tax_amount: vatExpense }
          : {}),
        ...(attachment ? { attachment } : {}),
      },
    };

    // If we already pushed this receipt and have its FA URL, UPDATE
    // instead of creating a second expense line. That makes the
    // "Push again to FA" button + a forced re-approve idempotent
    // and lets us correct earlier wrong-signed pushes.
    const isForcedUpdate = !!(opts.force && r.freeagent_url);
    const fa: FaExpenseResponse =
      isForcedUpdate
        ? await faApiSend<FaExpenseResponse>(r.freeagent_url!, "PUT", payload).then(() => ({ expense: { url: r.freeagent_url! } }))
        : await faApiSend<FaExpenseResponse>("/expenses", "POST", payload);

    // Persist the FA link, and if we can't, undo so we never leave an
    // unrecorded expense behind (which a later approve would duplicate).
    const persisted = await persistApproval(r.id, fa.expense.url);
    if (!persisted) {
      if (!isForcedUpdate) {
        // We just created this expense — roll it back so FA matches our DB.
        await faApiSend(fa.expense.url, "DELETE").catch(() => {});
        return {
          ok: false,
          pushed: false,
          reason: "Pushed to FreeAgent but couldn't save the link locally — rolled back the FA expense. Please retry.",
        };
      }
      return {
        ok: false,
        pushed: false,
        reason: `Updated FreeAgent but couldn't save the link locally (${fa.expense.url}).`,
      };
    }

    // Teach the system this supplier→category for next time. Now when
    // a new Anthropic receipt lands, it auto-picks Computer Software
    // before Claude even has to guess.
    if (r.supplier && r.category_url && r.category_name) {
      await upsertRule({
        description: r.supplier,
        category_url: r.category_url,
        category_name: r.category_name,
      }).catch(() => {});
    }

    return { ok: true, pushed: true, freeagent_url: fa.expense.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't auto-mark approved if the FA push failed — let the user retry.
    return { ok: false, pushed: false, reason: msg.slice(0, 600) };
  }
}
