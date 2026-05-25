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

let _cachedUserUrl: string | null = null;

async function getUserUrl(): Promise<string> {
  if (_cachedUserUrl) return _cachedUserUrl;
  const me = await faApi<FaUserResponse>("/users/me");
  _cachedUserUrl = me.user.url;
  return _cachedUserUrl;
}

export async function approveReceipt(receiptId: string): Promise<ApproveResult> {
  const { data, error } = await db()
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, pushed: false, reason: error?.message ?? "not found" };
  }
  const r = data as Receipt;

  if (r.status === "approved" && r.freeagent_url) {
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

  // Push as an out-of-pocket Expense.
  // sales_tax_status:
  //   - "TAXABLE"   → has VAT; FA computes from category + amount
  //   - "EXEMPT"    → 0% / Exempt / Out of Scope
  //   - "OUT_OF_SCOPE" — for non-UK
  // We default to TAXABLE unless vat_rate explicitly says zero/exempt.
  const vatRate = (r.vat_rate ?? "").toLowerCase();
  const salesTaxStatus =
    vatRate.includes("exempt") || vatRate.includes("out of scope")
      ? "EXEMPT"
      : vatRate === "0%"
      ? "EXEMPT"
      : "TAXABLE";

  try {
    const userUrl = await getUserUrl();
    // Best-effort attachment fetch. If it fails, push the expense anyway
    // — the financial entry is more important than the image; user can
    // attach manually in FA if needed.
    const attachment = await buildAttachment(r.receipt_image_url).catch(() => null);

    const fa = await faApiSend<FaExpenseResponse>("/expenses", "POST", {
      expense: {
        user: userUrl,
        category: r.category_url,
        gross_value: r.gross_total,
        dated_on: r.supply_date,
        description: r.description ?? r.supplier ?? "Receipt",
        sales_tax_status: salesTaxStatus,
        ...(attachment ? { attachment } : {}),
      },
    });

    await db()
      .from("receipts")
      .update({
        status: "approved",
        freeagent_url: fa.expense.url,
        pushed_at: new Date().toISOString(),
      })
      .eq("id", r.id);

    return { ok: true, pushed: true, freeagent_url: fa.expense.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't auto-mark approved if the FA push failed — let the user retry.
    return { ok: false, pushed: false, reason: msg.slice(0, 600) };
  }
}
