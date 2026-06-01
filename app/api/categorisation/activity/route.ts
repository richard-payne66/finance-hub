import { NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { getCategories } from "@/app/lib/fa-categories";
import { loadRules } from "@/app/lib/category-rules";
import { errorResponse } from "@/app/lib/api-helpers";

// Read-only feed of what the system has filed on its own, newest first,
// so the user can review (and, via /api/categorisation/correct, fix) it.
//   filed:      AuditEntry[] with action=auto_applied
//   categories: ALL FA categories annotated with usage_count (for the
//               "change category" picker on the activity page)
export async function GET() {
  try {
    const [log, cats, rules] = await Promise.all([
      loadAuditLog(),
      getCategories().catch(() => []),
      loadRules().catch(() => []),
    ]);

    const usage = new Map<string, number>();
    for (const e of log) {
      if (e.action === "auto_applied" && e.category_url) {
        usage.set(e.category_url, (usage.get(e.category_url) ?? 0) + 1);
      }
    }
    for (const r of rules) {
      usage.set(r.category_url, (usage.get(r.category_url) ?? 0) + (r.hits ?? 1));
    }

    const categories = cats.map((c) => ({
      url: c.url,
      description: c.description,
      group: c.group_description,
      allowable_for_tax: c.allowable_for_tax,
      usage_count: usage.get(c.url) ?? 0,
    }));

    // Log is stored newest-first (appendAuditEntries prepends).
    const filed = log.filter((e) => e.action === "auto_applied").slice(0, 200);

    return NextResponse.json({ filed, categories });
  } catch (err) {
    return errorResponse(err);
  }
}
