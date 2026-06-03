import { NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { errorResponse } from "@/app/lib/api-helpers";

// READ-ONLY. Lists everything the system marked as "personal" (skipped, kept
// out of the books) so we can spot any genuine business costs that were parked
// too cautiously and could be reclaimed.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const log = await loadAuditLog();
    const items = log
      .filter((e) => e.action === "skipped_personal")
      .map((e) => ({
        id: e.id,
        date: e.txn_date,
        amount: e.txn_amount,
        description: (e.txn_description ?? "").replace(/\s+/g, " ").slice(0, 100),
        suggested_category: e.category_name,
        reasoning: e.reasoning,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return NextResponse.json({
      count: items.length,
      total_abs: Math.round(items.reduce((s, e) => s + Math.abs(e.amount), 0)),
      money_out_only: items.filter((e) => e.amount < 0).length,
      items,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
