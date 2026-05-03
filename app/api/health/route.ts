import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";

export const dynamic = "force-dynamic";

// Health check — confirms the server can reach Supabase and all tables exist.
export async function GET() {
  const tables = ["receipts", "processed_files", "freeagent_categories", "checklist_state", "documents", "tax_deadlines", "kv"];
  const results: Record<string, "ok" | string> = {};
  try {
    for (const t of tables) {
      const { error } = await db().from(t).select("*", { count: "exact", head: true }).limit(0);
      results[t] = error ? error.message : "ok";
    }
    const allOk = Object.values(results).every((v) => v === "ok");
    return NextResponse.json({ ok: allOk, tables: results }, { status: allOk ? 200 : 500 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
