import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Health check — confirms the server can reach Supabase and all tables exist.
export async function GET() {
  const tables = ["receipts", "processed_files", "freeagent_categories", "checklist_state", "documents", "tax_deadlines", "kv"];
  const results: Record<string, "ok" | string> = {};
  try {
    // Run all 7 checks in parallel — no reason to wait for each sequentially.
    const checks = await Promise.all(
      tables.map((t) =>
        db()
          .from(t)
          .select("*", { count: "exact", head: true })
          .limit(0)
          .then(({ error }) => ({ t, result: error ? error.message : "ok" as const }))
      )
    );
    for (const { t, result } of checks) results[t] = result;
    const allOk = Object.values(results).every((v) => v === "ok");
    return NextResponse.json({ ok: allOk, tables: results }, { status: allOk ? 200 : 500 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
