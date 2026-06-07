import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { isConnected as faIsConnected, api as faApi } from "@/app/lib/freeagent";

export const dynamic = "force-dynamic";

// Probe FreeAgent with a real authenticated call. The dashboard degrades
// silently when FA is unreachable (widgets show £0 / "not connected" rather
// than erroring), so without this the health check would report green while
// the books are actually invisible. /users/me is the smallest authenticated
// call and also exercises the token-refresh path.
async function checkFreeAgent(): Promise<"ok" | "not_connected" | string> {
  try {
    if (!(await faIsConnected())) return "not_connected";
    await faApi("/users/me");
    return "ok";
  } catch (err) {
    return err instanceof Error ? err.message.slice(0, 200) : String(err);
  }
}

// Health check — confirms the server can reach Supabase (all tables exist)
// AND that the FreeAgent connection is live.
export async function GET() {
  const tables = ["receipts", "processed_files", "freeagent_categories", "checklist_state", "documents", "tax_deadlines", "kv"];
  const results: Record<string, "ok" | string> = {};
  try {
    // Run all checks in parallel — no reason to wait for each sequentially.
    const [checks, freeagent] = await Promise.all([
      Promise.all(
        tables.map((t) =>
          db()
            .from(t)
            .select("*", { count: "exact", head: true })
            .limit(0)
            .then(({ error }) => ({ t, result: error ? error.message : "ok" as const }))
        )
      ),
      checkFreeAgent(),
    ]);
    for (const { t, result } of checks) results[t] = result;
    const tablesOk = Object.values(results).every((v) => v === "ok");
    const allOk = tablesOk && freeagent === "ok";
    return NextResponse.json({ ok: allOk, tables: results, freeagent }, { status: allOk ? 200 : 500 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
