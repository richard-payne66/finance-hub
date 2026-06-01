import { NextResponse } from "next/server";
import { loadAuditLog, summarise } from "@/app/lib/audit-log";
import { errorResponse } from "@/app/lib/api-helpers";

// GET — summary of recent auto-bookkeeping activity, read from the audit log.
// Powers the "Auto bookkeeping" card on the home page.
//
// NOTE: the old POST endpoint that created BRAND-NEW explanations in FreeAgent
// used to live here. It was removed (June 2026): that "create a new
// explanation" model risked double-booking and was superseded by the
// approve-guesses model, which CONFIRMS FreeAgent's own guesses in place.
// See /api/approve-guesses and /api/cron/approve-guesses for the live model.
export async function GET() {
  try {
    const log = await loadAuditLog();
    return NextResponse.json({
      summary_7d: summarise(log, 7),
      summary_30d: summarise(log, 30),
      recent: log.slice(0, 25),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
