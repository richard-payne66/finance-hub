import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { getCategories, receiptRelevant } from "@/app/lib/fa-categories";
import { loadRules } from "@/app/lib/category-rules";
import { errorResponse } from "@/app/lib/api-helpers";

// GET /api/categories
// Returns FA categories annotated with usage_count, **filtered down to
// just the ones a receipt would realistically be categorised against**
// (see receiptRelevant() in fa-categories.ts).
//
// Pass ?all=true to get the full unfiltered FA list — useful when the
// accountant asks about a balance-sheet/payroll category that's hidden.
//
// Also: categories that have been *used* (usage_count > 0) are always
// included even if the filter would hide them, so the editor doesn't
// suddenly drop your existing selection from the dropdown.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const all = new URL(req.url).searchParams.get("all") === "true";

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

    const visible = all
      ? cats
      : cats.filter((c) => receiptRelevant(c) || (usage.get(c.url) ?? 0) > 0);

    const annotated = visible.map((c) => ({
      url: c.url,
      description: c.description,
      group: c.group_description,
      allowable_for_tax: c.allowable_for_tax,
      usage_count: usage.get(c.url) ?? 0,
    }));

    return NextResponse.json({
      categories: annotated,
      filtered: !all,
      total: cats.length,
      shown: annotated.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
