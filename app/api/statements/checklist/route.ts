import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/lib/db";

// GET — returns array of checked statement keys e.g. ["statement-2023-04", ...]
export async function GET() {
  const { data } = await db()
    .from("checklist_state")
    .select("item_id")
    .like("item_id", "statement-%")
    .eq("completed", true);

  return NextResponse.json((data ?? []).map((r) => r.item_id));
}

// POST — toggle a single statement key
export async function POST(req: NextRequest) {
  const { key, checked } = await req.json();
  if (!key?.startsWith("statement-")) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  await db()
    .from("checklist_state")
    .upsert(
      {
        item_id: key,
        completed: checked,
        completed_at: checked ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );

  return NextResponse.json({ ok: true });
}
