import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";

export const maxDuration = 300;

// Weekly scan (Fri 13:00 UTC ≈ 2pm BST / 1pm GMT) of the receipts@…
// mailbox + the RECEIPTS label. Persists last-run summary in kv so the
// dashboard can show "Gmail checked Friday 24 May: 0 new". Also kicks
// off the actual heavy lifting in /api/gmail-receipts (Claude
// extraction etc.) by POSTing to it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = new URL(req.url).origin;
  const startedAt = new Date().toISOString();
  let result: unknown = null;
  let error: string | null = null;

  try {
    const res = await fetch(`${origin}/api/gmail-receipts`, { method: "POST" });
    result = await res.json();
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Distil the result into a small status payload the dashboard can render.
  let processed = 0;
  let skipped = 0;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.processed === "number") processed = r.processed;
    if (typeof r.skipped === "number") skipped = r.skipped;
  }

  const status = {
    last_run_at: startedAt,
    finished_at: new Date().toISOString(),
    processed,
    skipped,
    error,
  };

  try {
    await db()
      .from("kv")
      .upsert({ key: "gmail_receipts_last_run", value: JSON.stringify(status) });
  } catch {
    // non-fatal — never let kv write break the cron
  }

  return NextResponse.json({ ran_at: startedAt, status, result });
}
