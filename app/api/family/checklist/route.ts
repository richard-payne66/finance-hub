import { NextRequest, NextResponse } from "next/server";
import { getChecklist, createChecklistItem, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const items = await getChecklist();
    return NextResponse.json({ items });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ items: [], setupNeeded: true });
    return errorResponse(err);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { name, note } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const item = await createChecklistItem(name.trim(), note?.trim());
    return NextResponse.json({ item });
  } catch (err) { return errorResponse(err); }
}
