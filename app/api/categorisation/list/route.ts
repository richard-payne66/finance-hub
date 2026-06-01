import { NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { getCategories } from "@/app/lib/fa-categories";
import { loadRules } from "@/app/lib/category-rules";
import { reconcileQueue } from "@/app/lib/queue-reconcile";
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 120;

// Returns:
//   queue:      AuditEntry[] currently action=queued_for_review,
//               AFTER reconciling against FreeAgent (drops items already
//               handled in FA, auto-applies learned-rule matches).
//   categories: ALL FA categories, each annotated with usage_count
//               (derived from the audit log + learned rules so the
//               picker can rank/filter by what the user actually uses)
//   reconcile:  { resolved, auto_applied, checked } for a small banner
export async function GET() {
  try {
    // Self-clean the queue first, then read the (now fresh) log for usage.
    const recon = await reconcileQueue().catch(() => null);

    const [log, cats, rules] = await Promise.all([
      loadAuditLog(),
      getCategories().catch(() => []),
      loadRules().catch(() => []),
    ]);

    // Tally usage by category_url across approved entries + learned rules
    const usage = new Map<string, number>();
    for (const e of log) {
      if (e.action !== "auto_applied" || !e.category_url) continue;
      usage.set(e.category_url, (usage.get(e.category_url) ?? 0) + 1);
    }
    for (const r of rules) {
      // Learned rules count for extra weight — they were explicit user confirmations
      usage.set(r.category_url, (usage.get(r.category_url) ?? 0) + (r.hits ?? 1));
    }

    const annotated = cats.map((c) => ({
      url: c.url,
      description: c.description,
      group: c.group_description,
      allowable_for_tax: c.allowable_for_tax,
      usage_count: usage.get(c.url) ?? 0,
    }));

    const queue = recon?.queue ?? log.filter((e) => e.action === "queued_for_review");

    return NextResponse.json({
      queue,
      categories: annotated,
      reconcile: recon
        ? { resolved: recon.resolved, auto_applied: recon.auto_applied, checked: recon.checked }
        : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
