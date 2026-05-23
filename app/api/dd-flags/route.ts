import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";

// Per-tax-type Direct Debit flags. Stored in kv as a small map.
// Set manually — automatic DD detection from bank transactions is on
// the roadmap but not implemented yet.

export type TaxKind = "vat" | "corp_tax" | "self_assessment" | "paye";
export type DdFlags = Partial<Record<TaxKind, boolean>>;

const KV_KEY = "dd_flags";

export async function GET() {
  try {
    const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    const flags: DdFlags = data ? (() => { try { return JSON.parse(data.value); } catch { return {}; } })() : {};
    return NextResponse.json(flags);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kind, enabled } = body as { kind: TaxKind; enabled: boolean };
    if (!kind || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "kind + enabled required" }, { status: 400 });
    }
    const { data } = await db().from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    const current: DdFlags = data ? (() => { try { return JSON.parse(data.value); } catch { return {}; } })() : {};
    current[kind] = enabled;
    await db().from("kv").upsert({ key: KV_KEY, value: JSON.stringify(current) });
    return NextResponse.json(current);
  } catch (err) {
    return errorResponse(err);
  }
}
