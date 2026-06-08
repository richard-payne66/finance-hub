import { NextRequest, NextResponse } from "next/server";
import { updateExpense, deleteExpense } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    await updateExpense(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
