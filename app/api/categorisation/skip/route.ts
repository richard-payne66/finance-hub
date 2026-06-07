import { NextRequest, NextResponse } from "next/server";
import { loadAuditLog, replaceAuditEntry } from "@/app/lib/audit-log";
import { errorResponse } from "@/app/lib/api-helpers";

// Mark a queued entry as 'skipped_personal' so it stops showing in the
// review queue. Doesn't push anything to FA — the FA transaction stays
// marked-for-review (which is correct for personal-card spend).
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const log = await loadAuditLog();
    const entry = log.find((e) => e.id === id);
    if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
    await replaceAuditEntry({ ...entry, action: "skipped_personal" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
