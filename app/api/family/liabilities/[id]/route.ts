import { NextRequest, NextResponse } from "next/server";
import { updateLiability, deleteLiability } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    await updateLiability(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteLiability(id);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
