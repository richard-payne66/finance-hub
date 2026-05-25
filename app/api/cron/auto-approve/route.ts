import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { approveReceipt } from "@/app/lib/receipt-approve";
import { errorResponse } from "@/app/lib/api-helpers";

export const maxDuration = 300;

// Daily cron. Anything still pending after 30 days gets auto-approved
// (and pushed to FreeAgent via the same approveReceipt path). The
// reasoning: a month is long enough that if Richard hasn't intervened,
// the AI's extraction is good enough to land in the books.
//
// Status logged in kv so the dashboard can show "Last auto-approval
// pass: 24 May, 2 receipts approved".

const AGE_DAYS = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const startedAt = new Date().toISOString();

  const { data: rows, error } = await db()
    .from("receipts")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(50);

  if (error) return errorResponse(error, 500, "Auto-approve query failed.");

  const results: Array<{ id: string; ok: boolean; pushed: boolean; reason?: string }> = [];
  for (const r of rows ?? []) {
    try {
      const res = await approveReceipt(r.id);
      results.push({ id: r.id, ok: res.ok, pushed: res.pushed, reason: res.reason ?? res.skipped });
    } catch (err) {
      results.push({
        id: r.id,
        ok: false,
        pushed: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    last_run_at: startedAt,
    finished_at: new Date().toISOString(),
    considered: rows?.length ?? 0,
    approved: results.filter((r) => r.ok).length,
    pushed: results.filter((r) => r.pushed).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };

  try {
    await db().from("kv").upsert({
      key: "receipts_auto_approve_last_run",
      value: JSON.stringify(summary),
    });
  } catch {
    // non-fatal
  }

  return NextResponse.json(summary);
}
