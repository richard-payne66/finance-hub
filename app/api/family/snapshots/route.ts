import { NextRequest, NextResponse } from "next/server";
import { getSnapshots, createSnapshot, isTableMissing } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function GET() {
  try {
    const snapshots = await getSnapshots();
    return NextResponse.json({ snapshots });
  } catch (err) {
    if (isTableMissing(err)) return NextResponse.json({ snapshots: [], setupNeeded: true });
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const snapshot = await createSnapshot(body);
    return NextResponse.json({ snapshot });
  } catch (err) { return errorResponse(err); }
}
