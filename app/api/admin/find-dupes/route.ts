import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/find-dupes
//
// Returns groups of receipts that share supplier + supply_date + gross_total.
// Anything with >1 in the group is a candidate duplicate. Rejected
// receipts are excluded (already dismissed).

type Row = {
  id: string;
  supplier: string | null;
  supply_date: string | null;
  gross_total: number | null;
  currency: string | null;
  status: string;
  freeagent_url: string | null;
  source: string | null;
  created_at: string;
};

export async function GET() {
  try {
    const { data, error } = await db()
      .from("receipts")
      .select("id, supplier, supply_date, gross_total, currency, status, freeagent_url, source, created_at")
      .neq("status", "rejected")
      .not("supplier", "is", null)
      .not("supply_date", "is", null)
      .not("gross_total", "is", null);
    if (error) return errorResponse(error, 500, "Could not query receipts.");

    const groups = new Map<string, Row[]>();
    for (const r of (data ?? []) as Row[]) {
      const key = `${(r.supplier ?? "").toLowerCase().trim()}|${r.supply_date}|${r.gross_total}|${r.currency ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const dupeGroups = Array.from(groups.values())
      .filter((g) => g.length > 1)
      .map((g) => ({
        key: `${g[0].supplier} · ${g[0].supply_date} · ${g[0].currency ?? "£"}${g[0].gross_total}`,
        count: g.length,
        rows: g
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((r) => ({
            id: r.id,
            status: r.status,
            source: r.source,
            freeagent_url: r.freeagent_url,
            created_at: r.created_at,
          })),
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      total_groups: dupeGroups.length,
      total_extra_receipts: dupeGroups.reduce((s, g) => s + (g.count - 1), 0),
      groups: dupeGroups,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
