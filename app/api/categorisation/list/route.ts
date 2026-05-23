import { NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { getCategories } from "@/app/lib/fa-categories";
import { errorResponse } from "@/app/lib/api-helpers";

// Returns:
//   queue: AuditEntry[] currently action=queued_for_review
//   categories: all FA categories grouped (for the override picker)
export async function GET() {
  try {
    const [log, cats] = await Promise.all([loadAuditLog(), getCategories().catch(() => [])]);
    const queue = log.filter((e) => e.action === "queued_for_review");
    return NextResponse.json({
      queue,
      categories: cats.map((c) => ({
        url: c.url,
        description: c.description,
        group: c.group_description,
        allowable_for_tax: c.allowable_for_tax,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
