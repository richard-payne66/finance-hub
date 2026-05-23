import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog } from "@/app/lib/audit-log";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// Mark a queued entry as 'skipped_personal' so it stops showing in the
// review queue. Doesn't push anything to FA — the FA transaction stays
// marked-for-review (which is correct for personal-card spend).
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const log = await loadAuditLog();
    const idx = log.findIndex((e) => e.id === id);
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    log[idx] = { ...log[idx], action: "skipped_personal" };
    await db().from("kv").upsert({ key: "auto_categorisations_log", value: JSON.stringify(log) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
