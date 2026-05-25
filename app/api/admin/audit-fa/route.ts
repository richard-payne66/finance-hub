import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { api as faApi } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/admin/audit-fa
//
// For every receipt with status='approved' AND a stored freeagent_url,
// fetch the live expense from FA and report whether gross_value is
// currently negative (= correctly an expense) or positive (= still
// landing as a refund).
//
// Use this after a sign-fix backfill to find anything that didn't take.

type FaExpense = { expense: { gross_value: string; dated_on: string; description: string; url: string } };

export async function GET() {
  try {
    const { data, error } = await db()
      .from("receipts")
      .select("id, supplier, gross_total, freeagent_url, status")
      .eq("status", "approved")
      .not("freeagent_url", "is", null);
    if (error) return errorResponse(error, 500, "Could not load receipts.");

    const results: Array<{
      receipt_id: string;
      supplier: string | null;
      our_total: number | null;
      fa_url: string | null;
      fa_gross_value: string | null;
      is_refund: boolean;
      error?: string;
    }> = [];

    for (const r of data ?? []) {
      const out: (typeof results)[number] = {
        receipt_id: r.id,
        supplier: r.supplier,
        our_total: r.gross_total,
        fa_url: r.freeagent_url,
        fa_gross_value: null,
        is_refund: false,
      };
      try {
        const fa = await faApi<FaExpense>(r.freeagent_url as string);
        out.fa_gross_value = fa.expense.gross_value;
        const num = Number.parseFloat(fa.expense.gross_value);
        out.is_refund = Number.isFinite(num) && num > 0;
      } catch (err) {
        out.error = err instanceof Error ? err.message.slice(0, 250) : String(err);
      }
      results.push(out);
    }

    const refunds = results.filter((r) => r.is_refund);
    const errors = results.filter((r) => r.error);
    return NextResponse.json({
      total: results.length,
      correctly_expense: results.length - refunds.length - errors.length,
      still_refund: refunds.length,
      errors: errors.length,
      refund_details: refunds,
      error_details: errors,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
