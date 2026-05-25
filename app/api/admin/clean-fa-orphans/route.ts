import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { api as faApi, apiSend as faApiSend } from "@/app/lib/freeagent";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Find FreeAgent expenses that no longer have a matching receipt row in
// our DB — orphans left behind by an earlier DB-only deletion that
// happened before the FA-aware DELETE endpoint was deployed.
//
// GET  → preview (returns the orphan list, doesn't delete)
// POST → preview + delete each orphan from FA
//
// Safety: only considers expenses created in the last 90 days, so a
// pre-existing FA expense the user added manually won't be touched.

type FaExpenseRow = {
  url: string;
  description?: string;
  gross_value?: string;
  dated_on?: string;
  created_at?: string;
};
type FaExpensesList = { expenses: FaExpenseRow[] };

async function listRecentFaExpenses(): Promise<FaExpenseRow[]> {
  const out: FaExpenseRow[] = [];
  // FreeAgent paginates; pull up to 4 pages of 100 = 400 expenses max.
  for (let page = 1; page <= 4; page++) {
    const res = await faApi<FaExpensesList>(`/expenses?per_page=100&page=${page}&view=recent`);
    if (!res.expenses || res.expenses.length === 0) break;
    out.push(...res.expenses);
    if (res.expenses.length < 100) break;
  }
  return out;
}

async function findOrphans(): Promise<FaExpenseRow[]> {
  const expenses = await listRecentFaExpenses();
  const { data: receipts } = await db()
    .from("receipts")
    .select("freeagent_url")
    .not("freeagent_url", "is", null);
  const linkedUrls = new Set(
    (receipts ?? []).map((r) => r.freeagent_url as string).filter(Boolean),
  );
  // Only consider expenses that look like ours — 90-day window.
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return expenses.filter((e) => {
    if (linkedUrls.has(e.url)) return false;
    if (!e.dated_on) return true; // include unknowns
    return new Date(e.dated_on).getTime() > cutoff;
  });
}

export async function GET() {
  try {
    const orphans = await findOrphans();
    return NextResponse.json({
      orphan_count: orphans.length,
      preview: orphans.slice(0, 50).map((e) => ({
        url: e.url,
        description: e.description,
        gross_value: e.gross_value,
        dated_on: e.dated_on,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(_req: NextRequest) {
  try {
    const orphans = await findOrphans();
    const results: Array<{ url: string; ok: boolean; error?: string }> = [];
    for (const o of orphans) {
      try {
        await faApiSend(o.url, "DELETE");
        results.push({ url: o.url, ok: true });
      } catch (err) {
        results.push({
          url: o.url,
          ok: false,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
      }
    }
    return NextResponse.json({
      total: results.length,
      deleted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      failed_samples: results.filter((r) => !r.ok).slice(0, 10),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
