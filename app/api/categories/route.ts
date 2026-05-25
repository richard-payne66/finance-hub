import { NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { getCategories } from "@/app/lib/fa-categories";
import { loadRules } from "@/app/lib/category-rules";
import { errorResponse } from "@/app/lib/api-helpers";

// GET /api/categories
// Returns all FreeAgent categories annotated with a usage_count derived
// from the audit log + learned rules, so the picker can rank/filter
// to the ones Richard actually uses. Same data shape as the embedded
// version in /api/categorisation/list — extracted here so the receipt
// editor can reuse it without pulling the categorisation queue too.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [log, cats, rules] = await Promise.all([
      loadAuditLog(),
      getCategories().catch(() => []),
      loadRules().catch(() => []),
    ]);

    const usage = new Map<string, number>();
    for (const e of log) {
      if (e.action !== "auto_applied" || !e.category_url) continue;
      usage.set(e.category_url, (usage.get(e.category_url) ?? 0) + 1);
    }
    for (const r of rules) {
      usage.set(r.category_url, (usage.get(r.category_url) ?? 0) + (r.hits ?? 1));
    }

    const annotated = cats.map((c) => ({
      url: c.url,
      description: c.description,
      group: c.group_description,
      allowable_for_tax: c.allowable_for_tax,
      usage_count: usage.get(c.url) ?? 0,
    }));

    return NextResponse.json({ categories: annotated });
  } catch (err) {
    return errorResponse(err);
  }
}
