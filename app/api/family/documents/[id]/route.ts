import { NextRequest, NextResponse } from "next/server";
import { deleteDocument } from "@/app/lib/family";
import { errorResponse } from "@/app/lib/api-helpers";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteDocument(id);
    return NextResponse.json({ ok: true });
  } catch (err) { return errorResponse(err); }
}
