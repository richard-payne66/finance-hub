import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// Manual "I'm already doing this" toggles for each optimisation tip.
// Without this every tip would scream forever even if you'd actioned it.

export type OptimisationFlag =
  | "salary_at_12570"
  | "dividends_vouchered"
  | "pension_company"
  | "home_office_claim"
  | "mileage_claim"
  | "trivial_benefits";

export type OptimisationFlags = Partial<Record<OptimisationFlag, boolean>>;

const KV_KEY = "optimisation_flags";

export async function GET() {
  try {
    const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    const flags: OptimisationFlags = data
      ? (() => { try { return JSON.parse(data.value); } catch { return {}; } })()
      : {};
    return NextResponse.json(flags);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { flag, enabled } = await req.json();
    if (!flag || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "flag + enabled required" }, { status: 400 });
    }
    const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    const current: OptimisationFlags = data
      ? (() => { try { return JSON.parse(data.value); } catch { return {}; } })()
      : {};
    current[flag as OptimisationFlag] = enabled;
    await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(current) });
    return NextResponse.json(current);
  } catch (err) {
    return errorResponse(err);
  }
}
