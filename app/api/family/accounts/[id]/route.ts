import { NextRequest, NextResponse } from "next/server";
import { updateAccount, deleteAccount } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    await updateAccount(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
